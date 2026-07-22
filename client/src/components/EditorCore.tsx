import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useEditor } from "../hooks/use-editor";
import { useIsMobile } from "../hooks/use-mobile";
import FloorPlanCanvas from "./FloorPlanCanvas";
import EditorToolbar from "./EditorToolbar";
import FurniturePanel from "./FurniturePanel";
import PropertiesPanel from "./PropertiesPanel";
import RoomTabs from "./RoomTabs";
import { embedPlanInPng, extractPlanFromPng } from "../lib/png-plan";
import { getRecentPlans, recordRecentPlan, type RecentPlan } from "../lib/recent-plans";
import { FurnitureTemplate, FurnitureItem, RoomLabel, TextBox, Arrow, Point, UnitSystem, MeasureMode, isWallCupboard } from "../lib/types";
import { trackEvent } from "@/lib/analytics";
import {
  drawGrid,
  drawWalls,
  drawWallSegmentMeasurements,
  drawMeasurementIndicatorLines,
  drawFurniture,
  drawRoomAreas,
  drawLabels,
  drawArrows,
  drawTextBoxes,
  collectComponentLabelRects,
  resolveAndDrawLabelCollisions,
  collectWallMeasurementLabelRects,
  findParallelWallDiscrepancies,
  drawWallLabelsWithDiscrepancy,
  computeRoomLabelPositions,
  collectDistanceMeasurementRects,
  snapFurnitureToNearest,
} from "../lib/canvas-renderer";
import { detectRooms } from "../lib/room-detection";

// Lazy-loaded so Three.js is only downloaded when the user opens the 3D view
const View3D = lazy(() => import("./View3D"));
import { safeGetItem, safeSetItem } from "../lib/safe-storage";
import SavePlanDialog from "./SavePlanDialog";
import RatingPromptDialog from "./RatingPromptDialog";
import type { SharedPlanResult } from "../lib/plan-share";
import { getPlanCodeForSlot, rememberPlanCodeForSlot, forgetPlanCodeForSlot, intentToRoomType } from "../lib/plan-share";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Check, Box as BoxIcon, PencilRuler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface EditorCoreProps {
  storageKey: string;
  units?: UnitSystem;
  hideToolbar?: boolean;
  isDark: boolean;
  /** Render function for the header area above the toolbar. If omitted, no header is rendered. */
  renderHeader?: (editor: ReturnType<typeof useEditor>) => React.ReactNode;
  /** Render function for the status bar / attribution at the bottom of the properties panel. */
  renderStatusBar?: (state: ReturnType<typeof useEditor>["state"]) => React.ReactNode;
  /** Optional callback fired after a successful PNG export. */
  onExport?: () => void;
  /** Code of the shared plan this session was opened from (e.g. via /p/CODE). */
  initialShareCode?: string | null;
  /** When true, a successful cloud save rewrites the page URL to /p/CODE. */
  updateUrlOnSave?: boolean;
}

export default function EditorCore({
  storageKey,
  units: defaultUnits,
  hideToolbar = false,
  isDark,
  renderHeader,
  renderStatusBar,
  onExport,
  initialShareCode = null,
  updateUrlOnSave = false,
}: EditorCoreProps) {
  const editor = useEditor(storageKey);
  const { state } = editor;
  const isMobile = useIsMobile();

  // Set default units if provided and different from current
  useEffect(() => {
    if (defaultUnits && state.units !== defaultUnits) {
      editor.setUnits(defaultUnits);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [measureMode, setMeasureMode] = useState<MeasureMode>(() => {
    const stored = safeGetItem("freeroomplanner-measure-mode");
    return (stored === "inside" || stored === "full") ? stored : "inside";
  });

  const toggleMeasureMode = useCallback(() => {
    setMeasureMode((prev) => {
      const next = prev === "full" ? "inside" : "full";
      safeSetItem("freeroomplanner-measure-mode", next);
      return next;
    });
  }, []);

  const [showAllMeasurements, setShowAllMeasurements] = useState<boolean>(() => {
    return safeGetItem("freeroomplanner-show-all-measurements") === "true";
  });

  const toggleShowAllMeasurements = useCallback(() => {
    setShowAllMeasurements((prev) => {
      const next = !prev;
      safeSetItem("freeroomplanner-show-all-measurements", String(next));
      return next;
    });
  }, []);

  const [recentPlans, setRecentPlans] = useState<RecentPlan[]>(() => getRecentPlans());

  const [droppingFurniture, setDroppingFurniture] = useState<FurnitureTemplate | null>(null);
  const [autoEditTextBoxId, setAutoEditTextBoxId] = useState<string | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [fitRequestId, setFitRequestId] = useState(0);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);

  // Snapping preference. Snapping is on by default (it's what most people want),
  // but it can now be turned off — previously it was always on with no escape,
  // which was the single most common complaint in the feedback inbox.
  const [snapEnabled, setSnapEnabled] = useState<boolean>(() => {
    try {
      return safeGetItem("freeroomplanner-snap-enabled") !== "false";
    } catch {
      return true;
    }
  });

  // Ask "are you enjoying it?" once per browser, after the user has actually
  // succeeded at something — saved a share link or downloaded their plan.
  // It used to fire on a two-minute timer, which interrupted people mid-drawing
  // and collected opinions at the moment of peak frustration rather than at a
  // natural high point. Never shown inside an embed.
  const [ratingPromptMode, setRatingPromptMode] = useState<"rating" | "review">("rating");

  //   1. First success -> the full flow: stars, acknowledgement, review invite.
  //   2. A later visit -> at most ONE more review invite, on its own.
  //
  // The invite goes to everyone regardless of score. Inviting only the happy
  // raters is "review gating": it breaches Trustpilot's Guidelines for
  // Businesses and, since April 2025, the UK DMCC Act 2024. We stop asking the
  // moment someone opens the review site, and never ask twice in one day.
  const REVIEW_STATE_KEY = "freeroomplanner-review-state";

  const readReviewState = useCallback((): { asks: number; lastAskDay: string; opened: boolean } => {
    try {
      const raw = safeGetItem(REVIEW_STATE_KEY);
      if (raw) return { asks: 0, lastAskDay: "", opened: false, ...JSON.parse(raw) };
    } catch { /* fall through to defaults */ }
    return { asks: 0, lastAskDay: "", opened: false };
  }, []);

  const writeReviewState = useCallback((next: Partial<{ asks: number; lastAskDay: string; opened: boolean }>) => {
    try {
      safeSetItem(REVIEW_STATE_KEY, JSON.stringify({ ...readReviewState(), ...next }));
    } catch { /* best-effort */ }
  }, [readReviewState]);

  const handleReviewOpened = useCallback(() => {
    writeReviewState({ opened: true });
  }, [writeReviewState]);

  const requestRatingPrompt = useCallback(() => {
    let mode: "rating" | "review";
    const today = new Date().toDateString();
    try {
      if (window.location.pathname.startsWith("/embed")) return;

      const st = readReviewState();
      if (st.opened) return;               // already reviewed — never ask again
      if (st.asks >= 2) return;            // one initial ask + one re-ask, then stop
      if (st.lastAskDay === today) return; // never twice in the same day

      if (!safeGetItem("freeroomplanner-rating-prompted")) {
        safeSetItem("freeroomplanner-rating-prompted", new Date().toISOString());
        mode = "rating";                   // first success: the full flow
      } else {
        mode = "review";                   // later visit: the review invite alone
      }

      // Count the ask when it is shown, not when it is declined — someone who
      // dismisses the dialog outright has still been asked.
      writeReviewState({ asks: st.asks + 1, lastAskDay: today });
    } catch {
      return; /* prompting must never break the app */
    }
    setRatingPromptMode(mode);
    // Let the save/share dialog finish closing so the two never stack.
    setTimeout(() => setShowRatingPrompt(true), 900);
  }, [readReviewState, writeReviewState]);
  const [currentPlanCode, setCurrentPlanCode] = useState<string | null>(initialShareCode ?? getPlanCodeForSlot(storageKey));

  const handleShareLink = useCallback(() => {
    trackEvent("share_dialog_opened");
    setShowShareDialog(true);
  }, []);

  const handlePlanSaved = useCallback(
    (result: SharedPlanResult) => {
      setCurrentPlanCode(result.code);
      rememberPlanCodeForSlot(storageKey, result.code);
      if (updateUrlOnSave) {
        try {
          window.history.replaceState(null, "", `/p/${result.code}`);
        } catch {
          /* URL update is cosmetic — never break the save */
        }
      }
      requestRatingPrompt();
    },
    [updateUrlOnSave, storageKey, requestRatingPrompt]
  );
  const [furniturePanelOpen, setFurniturePanelOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [dimEditing, setDimEditing] = useState<"width" | "height" | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clipboard for copy/paste
  const clipboardRef = useRef<{ type: "furniture"; data: FurnitureItem } | { type: "label"; data: RoomLabel } | { type: "textbox"; data: TextBox } | { type: "arrow"; data: Arrow } | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2500);
  }, []);

  const handleToggleSnap = useCallback(() => {
    const next = !snapEnabled;
    setSnapEnabled(next);
    try {
      safeSetItem("freeroomplanner-snap-enabled", next ? "true" : "false");
    } catch { /* preference persistence is best-effort */ }
    trackEvent("snap_toggled", { enabled: next });
    showToast(next ? "Snapping on — hold Alt to place freely" : "Snapping off — hold Alt to snap");
  }, [snapEnabled, showToast]);

  const selectedWall = state.walls.find((w) => w.id === state.selectedItemId) || null;
  const selectedFurniture = state.furniture.find((f) => f.id === state.selectedItemId) || null;
  const selectedLabel = state.labels.find((l) => l.id === state.selectedItemId) || null;
  const selectedTextBox = state.textBoxes.find((t) => t.id === state.selectedItemId) || null;
  const selectedArrow = state.arrows.find((a) => a.id === state.selectedItemId) || null;
  const hasSelection = !!(selectedWall || selectedFurniture || selectedLabel || selectedTextBox || selectedArrow);

  // Copy/paste/duplicate handlers
  const handleCopy = useCallback(() => {
    if (selectedFurniture) {
      clipboardRef.current = { type: "furniture", data: { ...selectedFurniture } };
    } else if (selectedLabel) {
      clipboardRef.current = { type: "label", data: { ...selectedLabel } };
    } else if (selectedTextBox) {
      clipboardRef.current = { type: "textbox", data: { ...selectedTextBox } };
    } else if (selectedArrow) {
      clipboardRef.current = { type: "arrow", data: { ...selectedArrow } };
    }
  }, [selectedFurniture, selectedLabel, selectedTextBox, selectedArrow]);

  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    if (clip.type === "furniture") {
      const newItem: FurnitureItem = {
        ...clip.data,
        id: generateId(),
        x: clip.data.x + 20,
        y: clip.data.y + 20,
      };
      const template: FurnitureTemplate = {
        type: newItem.type,
        label: newItem.label,
        width: newItem.width,
        height: newItem.height,
        category: newItem.category,
        icon: "",
      };
      editor.addFurniture(template, { x: newItem.x + newItem.width / 2, y: newItem.y + newItem.height / 2 });
    } else if (clip.type === "label") {
      editor.addLabel(clip.data.text, { x: clip.data.x + 20, y: clip.data.y + 20 });
    } else if (clip.type === "textbox") {
      const tbData = clip.data as TextBox;
      const newId = editor.addTextBox({ x: tbData.x + tbData.width / 2 + 20, y: tbData.y + tbData.height / 2 + 20 });
      editor.updateTextBox(newId, { ...tbData, id: newId, x: tbData.x + 20, y: tbData.y + 20 });
    } else if (clip.type === "arrow") {
      const arrowData = clip.data as Arrow;
      const newId = editor.addArrow(
        { x: arrowData.startX + 20, y: arrowData.startY + 20 },
        { x: arrowData.endX + 20, y: arrowData.endY + 20 }
      );
      editor.updateArrow(newId, { ...arrowData, id: newId, startX: arrowData.startX + 20, startY: arrowData.startY + 20, endX: arrowData.endX + 20, endY: arrowData.endY + 20 });
    }
  }, [editor]);

  const handleDuplicate = useCallback(() => {
    if (selectedFurniture) {
      // Full clone — preserves rotation, mirrored, customName, heightFromFloor, etc.
      editor.duplicateFurniture(selectedFurniture);
      clipboardRef.current = { type: "furniture", data: { ...selectedFurniture } };
      return;
    }
    if (selectedLabel) {
      clipboardRef.current = { type: "label", data: { ...selectedLabel } };
    } else if (selectedTextBox) {
      clipboardRef.current = { type: "textbox", data: { ...selectedTextBox } };
    } else if (selectedArrow) {
      clipboardRef.current = { type: "arrow", data: { ...selectedArrow } };
    }
    const clip = clipboardRef.current;
    if (!clip) return;
    if (clip.type === "label") {
      editor.addLabel((clip.data as RoomLabel).text, {
        x: (clip.data as RoomLabel).x + 20,
        y: (clip.data as RoomLabel).y + 20,
      });
    } else if (clip.type === "textbox") {
      const tbData = clip.data as TextBox;
      const newId = editor.addTextBox({ x: tbData.x + tbData.width / 2 + 20, y: tbData.y + tbData.height / 2 + 20 });
      editor.updateTextBox(newId, { ...tbData, id: newId, x: tbData.x + 20, y: tbData.y + 20 });
    } else if (clip.type === "arrow") {
      const arrowData = clip.data as Arrow;
      const newId = editor.addArrow(
        { x: arrowData.startX + 20, y: arrowData.startY + 20 },
        { x: arrowData.endX + 20, y: arrowData.endY + 20 }
      );
      editor.updateArrow(newId, { ...arrowData, id: newId, startX: arrowData.startX + 20, startY: arrowData.startY + 20, endX: arrowData.endX + 20, endY: arrowData.endY + 20 });
    }
  }, [selectedFurniture, selectedLabel, selectedTextBox, selectedArrow, editor]);

  const handleAddTextBox = useCallback(() => {
    // If an empty text box is already on the canvas (e.g. from a repeated
    // "t" press), re-use it instead of stacking new empty boxes.
    const existingEmpty = state.textBoxes.find(
      (t) => !(t.content && t.content.replace(/<[^>]*>/g, "").trim())
    );
    if (existingEmpty) {
      editor.setSelectedItem(existingEmpty.id);
      setAutoEditTextBoxId(existingEmpty.id);
      return;
    }
    const canvasEl = document.querySelector('[data-testid="floor-plan-canvas"]');
    const cx = canvasEl ? canvasEl.clientWidth / 2 : 400;
    const cy = canvasEl ? canvasEl.clientHeight / 2 : 300;
    const centerWorld = {
      x: (cx - state.panOffset.x) / ((state.gridSize * state.zoom) / 100),
      y: (cy - state.panOffset.y) / ((state.gridSize * state.zoom) / 100),
    };
    const newId = editor.addTextBox(centerWorld);
    setAutoEditTextBoxId(newId);
  }, [editor, state]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedWall) editor.removeWall(selectedWall.id);
    if (selectedFurniture) editor.removeFurniture(selectedFurniture.id);
    if (selectedLabel) editor.removeLabel(selectedLabel.id);
    if (selectedTextBox) editor.removeTextBox(selectedTextBox.id);
    if (selectedArrow) editor.removeArrow(selectedArrow.id);
  }, [selectedWall, selectedFurniture, selectedLabel, selectedTextBox, selectedArrow, editor]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      // Belt-and-braces: while any text field has focus, or an inline text
      // editor (label / text box / tab rename) is open, never run tool
      // shortcuts — otherwise typing can switch tools or spawn items.
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) return;
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable) return;
      if (document.body.dataset.frpTextEditing) return;

      if (e.key === "v" || e.key === "V") {
        if (!e.ctrlKey && !e.metaKey) editor.setTool("select");
      }
      if (e.key === "w" || e.key === "W") {
        if (!e.ctrlKey && !e.metaKey) editor.setTool("wall");
      }
      if (e.key === "a" || e.key === "A") {
        if (!e.ctrlKey && !e.metaKey) editor.setTool("arrow");
      }
      if (e.key === "l" || e.key === "L") {
        if (!e.ctrlKey && !e.metaKey) editor.setTool("label");
      }
      if (e.key === "e" || e.key === "E") {
        if (!e.ctrlKey && !e.metaKey) editor.setTool("eraser");
      }
      if (e.key === "t" || e.key === "T") {
        if (!e.ctrlKey && !e.metaKey) handleAddTextBox();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        editor.redo();
      }

      // Copy/Paste/Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboardRef.current) {
          e.preventDefault();
          handlePaste();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        handleDuplicate();
      }

      // Escape: cancel wall drawing, or deselect
      if (e.key === "Escape") {
        if (state.wallDrawing) {
          editor.setWallDrawing(null);
        } else if (state.selectedItemId) {
          editor.setSelectedItem(null);
        } else if (state.selectedTool !== "select") {
          editor.setTool("select");
        }
      }

      // Delete/Backspace: delete selected item (guard against input fields)
      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
        handleDeleteSelected();
      }

      // Arrow keys: nudge selected furniture by 1cm (Shift = 1mm fine step)
      if (selectedFurniture && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 1; // 0.1cm = 1mm
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        editor.nudgeFurniture(selectedFurniture.id, dx, dy);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, handleCopy, handlePaste, handleDuplicate, handleAddTextBox, handleDeleteSelected, state.wallDrawing, state.selectedItemId, state.selectedTool, selectedFurniture]);

  const handleRotateSelected = useCallback(() => {
    if (selectedFurniture) editor.rotateFurniture(selectedFurniture.id);
  }, [selectedFurniture, editor]);

  const handleMirrorSelected = useCallback(() => {
    if (selectedFurniture) editor.mirrorFurniture(selectedFurniture.id);
  }, [selectedFurniture, editor]);

  const handleNudgeFurniture = useCallback((dx: number, dy: number) => {
    if (selectedFurniture) editor.nudgeFurniture(selectedFurniture.id, dx, dy);
  }, [selectedFurniture, editor]);

  const handleSavePlan = useCallback(async () => {
    try {
      // Compute bounding box of all content (walls, furniture, labels) with padding for measurement lines
      const allPoints: { x: number; y: number }[] = [];
      state.walls.forEach((w) => {
        // Include wall thickness + measurement line offset in bounds
        const thick = w.thickness || 15;
        allPoints.push(
          { x: w.start.x - thick, y: w.start.y - thick },
          { x: w.start.x + thick, y: w.start.y + thick },
          { x: w.end.x - thick, y: w.end.y - thick },
          { x: w.end.x + thick, y: w.end.y + thick },
        );
      });
      state.furniture.forEach((f) => {
        allPoints.push({ x: f.x, y: f.y }, { x: f.x + f.width, y: f.y + f.height });
      });
      state.labels.forEach((l) => {
        allPoints.push({ x: l.x - 100, y: l.y - 50 }, { x: l.x + 100, y: l.y + 50 });
      });
      (state.textBoxes || []).forEach((t) => {
        allPoints.push({ x: t.x, y: t.y }, { x: t.x + t.width, y: t.y + t.height });
      });
      state.arrows.forEach((a) => {
        allPoints.push({ x: a.startX, y: a.startY }, { x: a.endX, y: a.endY });
      });
      if (allPoints.length === 0) {
        allPoints.push({ x: 0, y: 0 }, { x: 500, y: 400 });
      }

      // Add 80cm padding for measurement lines and labels
      const padding = 80;
      const minX = Math.min(...allPoints.map((p) => p.x)) - padding;
      const minY = Math.min(...allPoints.map((p) => p.y)) - padding;
      const maxX = Math.max(...allPoints.map((p) => p.x)) + padding;
      const maxY = Math.max(...allPoints.map((p) => p.y)) + padding;
      const contentW = maxX - minX;
      const contentH = maxY - minY;

      // Create offscreen canvas at 2x resolution
      const exportScale = 2;
      const pxPerCm = 1.2; // base scale for export
      const canvasW = Math.ceil(contentW * pxPerCm * exportScale);
      const canvasH = Math.ceil(contentH * pxPerCm * exportScale);

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = canvasW;
      finalCanvas.height = canvasH;
      const ctx = finalCanvas.getContext('2d');
      if (!ctx) throw new Error("Canvas 2D context unavailable — export not supported in this browser");
      ctx.scale(exportScale, exportScale);

      const gridSize = 100 * pxPerCm; // 1m = 100cm
      const zoom = 1;
      const panOffset = { x: -minX * pxPerCm, y: -minY * pxPerCm };
      const isDark = false; // always export in light mode

      // Background
      ctx.fillStyle = "#f7f6f2";
      ctx.fillRect(0, 0, canvasW / exportScale, canvasH / exportScale);

      // Grid
      drawGrid(ctx, canvasW / exportScale, canvasH / exportScale, gridSize, zoom, panOffset, isDark);

      // Room areas
      const rooms = detectRooms(state.walls);
      const roomLabelPositions = rooms.length > 0
        ? computeRoomLabelPositions(ctx, rooms, state.furniture, gridSize, zoom, state.roomNames, state.units)
        : new Map<string, Point>();
      if (rooms.length > 0) {
        drawRoomAreas(ctx, rooms, gridSize, zoom, panOffset, isDark, state.units, state.roomNames, null, roomLabelPositions, state.roomLabelOffsets, state.walls, measureMode);
      }

      // Walls with measurement labels — always render all wall labels in the export,
      // regardless of the live "Show all measurements" toggle state.
      drawWalls(
        ctx,
        state.walls,
        gridSize,
        zoom,
        panOffset,
        isDark,
        null,
        state.units,
        measureMode,
        state.furniture,
        rooms,
        undefined,
        { showAll: true, hoveredClusterIds: null },
      );

      // Measurement indicator lines
      drawMeasurementIndicatorLines(ctx, state.walls, rooms, gridSize, zoom, panOffset, measureMode);

      // Wall segment measurements
      drawWallSegmentMeasurements(ctx, state.walls, state.furniture, gridSize, zoom, panOffset, isDark, state.units, measureMode, rooms);

      // Furniture (floor items, wall cupboards, doors/windows)
      const floorFurniture = state.furniture.filter((f) => f.type !== "door" && f.type !== "door_double" && f.type !== "window" && f.type !== "bay_window" && !isWallCupboard(f.type));
      drawFurniture(ctx, floorFurniture, gridSize, zoom, panOffset, isDark, null);
      const wallCupboards = state.furniture.filter((f) => isWallCupboard(f.type));
      drawFurniture(ctx, wallCupboards, gridSize, zoom, panOffset, isDark, null);
      const doorWindowItems = state.furniture.filter((f) => f.type === "door" || f.type === "door_double" || f.type === "window" || f.type === "bay_window");
      drawFurniture(ctx, doorWindowItems, gridSize, zoom, panOffset, isDark, null);

      // Component labels with collision resolution
      const componentLabelInfos = collectComponentLabelRects(ctx, state.furniture, gridSize, zoom, panOffset, isDark, null, state.units, state.walls, rooms);
      const wallMeasurementRects = collectWallMeasurementLabelRects(state.walls, gridSize, zoom, panOffset, state.units, measureMode, state.furniture, rooms, ctx);
      resolveAndDrawLabelCollisions(ctx, rooms, state.walls, componentLabelInfos, state.labels, gridSize, zoom, panOffset, isDark, state.roomNames, state.componentLabelsVisible, null, roomLabelPositions, [], wallMeasurementRects);

      // Arrows
      drawArrows(ctx, state.arrows, gridSize, zoom, panOffset, isDark, null);

      // Text boxes (notes) — drawn above walls/furniture/arrows so they stay
      // visible in the exported image, matching the live editor.
      drawTextBoxes(ctx, state.textBoxes, gridSize, zoom, panOffset);

      // Attribution badge
      const w = canvasW / exportScale;
      const h = canvasH / exportScale;
      const badgeText = "Made with freeroomplanner.com";
      const fontSize = Math.max(14, Math.round(h * 0.018));
      ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
      const metrics = ctx.measureText(badgeText);
      const textW = metrics.width;
      const padX = fontSize * 0.7;
      const padY = fontSize * 0.45;
      const boxW = textW + padX * 2;
      const boxH = fontSize + padY * 2;
      const margin = Math.round(h * 0.015);
      const bx = w - boxW - margin;
      const by = h - boxH - margin;

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      const radius = boxH / 2;
      ctx.beginPath();
      ctx.moveTo(bx + radius, by);
      ctx.lineTo(bx + boxW - radius, by);
      ctx.arcTo(bx + boxW, by, bx + boxW, by + radius, radius);
      ctx.arcTo(bx + boxW, by + boxH, bx + boxW - radius, by + boxH, radius);
      ctx.lineTo(bx + radius, by + boxH);
      ctx.arcTo(bx, by + boxH, bx, by + boxH - radius, radius);
      ctx.arcTo(bx, by, bx + radius, by, radius);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, bx + boxW / 2, by + boxH / 2);

      finalCanvas.toBlob(async (blob) => {
        if (!blob) return;
        // Embed the plan data inside the PNG so the image itself can be
        // re-opened later via Load Plan and edited.
        let outBlob: Blob = blob;
        try {
          outBlob = await embedPlanInPng(blob, JSON.stringify(editor.exportState()));
        } catch { /* fall back to a plain image */ }
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${state.roomName.replace(/[^a-zA-Z0-9]/g, "_")}_plan.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Plan saved as PNG image");
        try { setRecentPlans(recordRecentPlan(state.roomName, JSON.stringify(editor.exportState()))); } catch { /* history is best-effort */ }
        try {
          const intent = safeGetItem("freeroomplanner-intent");
          const planType = intent ? JSON.parse(intent)?.intent ?? "room" : "room";
          trackEvent('room_plan_saved', {
            plan_type: planType,
            room_name: state.roomName,
            timestamp: new Date().toISOString(),
          });
          fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "plan_downloaded", roomType: intentToRoomType() }) }).catch(() => {});
        } catch { /* analytics should never break the app */ }
        try { onExport?.(); } catch { /* never break the app */ }
        requestRatingPrompt();
      }, "image/png");
    } catch {
      showToast("Failed to save image");
    }
  }, [state, measureMode, showToast, onExport, editor, requestRatingPrompt]);

  const handleSaveJSON = useCallback(() => {
    try {
      const data = editor.exportState();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.roomName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Room saved as JSON");
      try { setRecentPlans(recordRecentPlan(state.roomName, JSON.stringify(data))); } catch { /* history is best-effort */ }
    } catch {
      showToast("Failed to save JSON");
    }
  }, [editor, state.roomName, showToast]);

  const handleSaveAllJSON = useCallback(() => {
    try {
      const data = editor.exportAllRooms();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "floor-plan.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Saved all ${data.tabs.length} rooms as JSON`);
    } catch {
      showToast("Failed to save JSON");
    }
  }, [editor, showToast]);

  const applyLoadedPlan = useCallback((plan: any): boolean => {
    // Multi-tab format: { version: 2, tabs: [...] }
    if (plan && plan.version === 2 && Array.isArray(plan.tabs)) {
      editor.importState(plan);
      showToast(`Loaded ${plan.tabs.length} rooms`);
      setFitRequestId((n) => n + 1);
      return true;
    }
    // Single-room plans — current and older exports. Accept anything
    // with a walls/furniture array and default the missing fields.
    if (plan && (Array.isArray(plan.walls) || Array.isArray(plan.furniture))) {
      editor.importState({
        version: plan.version ?? 1,
        roomName: plan.roomName || plan.name || "Loaded Plan",
        walls: Array.isArray(plan.walls) ? plan.walls : [],
        furniture: Array.isArray(plan.furniture) ? plan.furniture : [],
        labels: Array.isArray(plan.labels) ? plan.labels : [],
        textBoxes: Array.isArray(plan.textBoxes) ? plan.textBoxes : [],
        arrows: Array.isArray(plan.arrows) ? plan.arrows : [],
        roomNames: plan.roomNames || {},
        roomLabelOffsets: plan.roomLabelOffsets || {},
        componentLabelsVisible: plan.componentLabelsVisible ?? true,
      });
      showToast("Plan loaded");
      setFitRequestId((n) => n + 1);
      return true;
    }
    return false;
  }, [editor, showToast]);

  const handleLoadPlan = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.png";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
      if (isPng) {
        // PNGs exported by the planner carry the plan data inside the image.
        extractPlanFromPng(file)
          .then((plan) => {
            if (!plan || !applyLoadedPlan(plan)) {
              showToast("This image doesn't contain plan data — PNGs saved from now on will. For older plans, use the JSON file if you have one.");
            }
          })
          .catch(() => showToast("Couldn't read that image file"));
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const plan = JSON.parse(ev.target?.result as string);
          if (!applyLoadedPlan(plan)) {
            showToast("That file doesn't look like a saved room plan");
          }
        } catch {
          showToast("Couldn't read that file — please choose a plan saved from Free Room Planner");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [applyLoadedPlan, showToast]);

  const handleLoadRecent = useCallback((p: RecentPlan) => {
    try {
      const plan = JSON.parse(p.data);
      if (!applyLoadedPlan(plan)) showToast("Couldn't open that plan");
    } catch {
      showToast("Couldn't open that plan");
    }
  }, [applyLoadedPlan, showToast]);

  const handleSelectFurniture = useCallback(
    (template: FurnitureTemplate) => {
      const canvasEl = document.querySelector('[data-testid="floor-plan-canvas"]');
      const cx = canvasEl ? canvasEl.clientWidth / 2 : 400;
      const cy = canvasEl ? canvasEl.clientHeight / 2 : 300;
      const centerWorld = {
        x: (cx - state.panOffset.x) / ((state.gridSize * state.zoom) / 100),
        y: (cy - state.panOffset.y) / ((state.gridSize * state.zoom) / 100),
      };
      editor.addFurniture(template, centerWorld);
      editor.setTool("select");
    },
    [editor, state]
  );

  const handleDropFurniture = useCallback(
    (template: FurnitureTemplate, position: Point) => {
      editor.addFurniture(template, position);
      editor.setTool("select");
    },
    [editor]
  );

  const handleUpdateFurniture = useCallback(
    (id: string, updates: Partial<FurnitureItem>) => {
      // When a size change comes through, re-apply the same edge magnetism used
      // on drag so the piece stays flush with its neighbours/walls instead of
      // drifting out of a run when it's resized from the centre.
      if (updates.width != null || updates.height != null) {
        const current = state.furniture.find((f) => f.id === id);
        if (current) {
          const resized = { ...current, ...updates } as FurnitureItem;
          const others = state.furniture.filter((f) => f.id !== id);
          const snap = snapFurnitureToNearest(resized, state.walls, others, 8);
          if (snap.didSnap) {
            editor.updateFurniture(id, { ...updates, x: snap.x, y: snap.y });
            return;
          }
        }
      }
      editor.updateFurniture(id, updates);
    },
    [editor, state.furniture, state.walls]
  );

  return (
    <>
      {/* Optional header */}
      {renderHeader && renderHeader(editor)}

      {/* Toolbar */}
      {!hideToolbar && (
        <EditorToolbar
          selectedTool={state.selectedTool}
          onSetTool={editor.setTool}
          snapEnabled={snapEnabled}
          onToggleSnap={handleToggleSnap}
          onUndo={editor.undo}
          onRedo={editor.redo}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onZoomIn={() => editor.setZoom(state.zoom * 1.2)}
          onZoomOut={() => editor.setZoom(state.zoom / 1.2)}
          onZoomFit={() => setFitRequestId((n) => n + 1)}
          onRotateSelected={handleRotateSelected}
          onDeleteSelected={handleDeleteSelected}
          hasSelection={hasSelection}
          selectionIsFurniture={!!selectedFurniture}
          onSavePlan={handleSavePlan}
          onSaveJSON={handleSaveJSON}
          onSaveAllJSON={handleSaveAllJSON}
          onShareLink={handleShareLink}
          onLoadPlan={handleLoadPlan}
          recentPlans={recentPlans}
          onLoadRecent={handleLoadRecent}
          onClearAll={() => setShowClearDialog(true)}
          zoom={state.zoom}
          units={state.units}
          onSetUnits={editor.setUnits}
          measureMode={measureMode}
          onToggleMeasureMode={toggleMeasureMode}
          showAllMeasurements={showAllMeasurements}
          onToggleShowAllMeasurements={toggleShowAllMeasurements}
          isMobile={isMobile}
          onToggleFurniturePanel={() => setFurniturePanelOpen((o) => !o)}
          onTogglePropertiesPanel={() => setPropertiesPanelOpen((o) => !o)}
          componentLabelsVisible={state.componentLabelsVisible}
          onToggleComponentLabels={editor.toggleComponentLabels}
          onAddTextBox={handleAddTextBox}
        />
      )}

      {/* Room tabs */}
      <RoomTabs
        rooms={state.rooms}
        activeRoomId={state.activeRoomId}
        roomOrder={state.roomOrder}
        onSwitchRoom={editor.switchRoom}
        onAddRoom={editor.addRoom}
        onRenameRoom={editor.renameRoom}
        onDuplicateRoom={editor.duplicateRoom}
        onDeleteRoom={editor.deleteRoom}
        onReorderRooms={editor.reorderRooms}
        sharedOpen={!!initialShareCode}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {isMobile ? (
          <>
            {/* Mobile: Furniture panel in a left sheet */}
            <Sheet open={furniturePanelOpen} onOpenChange={setFurniturePanelOpen}>
              <SheetContent side="left" className="p-0 w-72" onOpenAutoFocus={(e) => e.preventDefault()}>
                <SheetTitle className="sr-only">Items Library</SheetTitle>
                <FurniturePanel
                  className="w-full h-full border-r-0"
                  onSelectFurniture={(t) => { handleSelectFurniture(t); setFurniturePanelOpen(false); }}
                  onSwitchToSelect={() => editor.setTool("select")}
                />
              </SheetContent>
            </Sheet>

            {/* Mobile: Properties panel in a right sheet */}
            <Sheet open={propertiesPanelOpen} onOpenChange={setPropertiesPanelOpen}>
              <SheetContent side="right" className="p-0 w-64">
                <SheetTitle className="sr-only">Properties</SheetTitle>
                <div className="bg-card flex flex-col h-full">
                  <ScrollArea className="flex-1">
                    <PropertiesPanel
                      selectedWall={selectedWall}
                      selectedFurniture={selectedFurniture}
                      selectedLabel={selectedLabel}
                      selectedTextBox={selectedTextBox}
                      selectedArrow={selectedArrow}
                      onRotate={handleRotateSelected}
                      onMirror={handleMirrorSelected}
                      onDelete={handleDeleteSelected}
                      onDuplicate={handleDuplicate}
                      onUpdateFurniture={handleUpdateFurniture}
                      onUpdateLabel={editor.updateLabel}
                      onUpdateTextBox={editor.updateTextBox}
                      onUpdateWall={editor.updateWall}
                      onUpdateArrow={editor.updateArrow}
                      onNudge={handleNudgeFurniture}
                      walls={state.walls}
                      onDimEditing={setDimEditing}
                      units={state.units}
                      measureMode={measureMode}
                    />
                  </ScrollArea>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          /* Desktop: Furniture panel inline */
          <FurniturePanel onSelectFurniture={handleSelectFurniture} onSwitchToSelect={() => editor.setTool("select")} />
        )}

        {/* Canvas area: 2D plan or 3D view */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {is3D ? (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  Loading 3D view…
                </div>
              }
            >
              <View3D state={state} isDark={isDark} />
            </Suspense>
          ) : (
            <FloorPlanCanvas
          state={state}
          dimEditing={dimEditing}
          isDark={isDark}
          snapEnabled={snapEnabled}
          measureMode={measureMode}
          showAllMeasurements={showAllMeasurements}
          onAddWall={editor.addWall}
          onSelectItem={editor.setSelectedItem}
          onMoveFurniture={editor.moveFurniture}
          onMoveWall={editor.moveWall}
          onMoveLabel={editor.moveLabel}
          onRemoveWall={editor.removeWall}
          onRemoveFurniture={editor.removeFurniture}
          onRemoveLabel={editor.removeLabel}
          onSetZoom={editor.setZoom}
          onSetPan={editor.setPan}
          fitRequestId={fitRequestId}
          onSetWallDrawing={editor.setWallDrawing}
          onAddLabel={editor.addLabel}
          onUpdateLabel={editor.updateLabel}
          onPushUndo={editor.pushUndo}
          droppingFurniture={droppingFurniture}
          onDropFurniture={handleDropFurniture}
          onUpdateFurniture={handleUpdateFurniture}
          onSplitWallAndConnect={editor.splitWallAndConnect}
          onSetRoomName={editor.setRoomNameForRoom}
          onMoveTextBox={editor.moveTextBox}
          onUpdateTextBox={editor.updateTextBox}
          onRemoveTextBox={editor.removeTextBox}
          onPushUndoForTextBox={editor.pushUndo}
          onAddArrow={editor.addArrow}
          onUpdateArrow={editor.updateArrow}
          onRemoveArrow={editor.removeArrow}
          onSetLabelOffset={editor.setLabelOffset}
          onSetTool={editor.setTool}
          onSetRoomLabelOffset={editor.setRoomLabelOffset}
          onUpdateWallLabelOffset={editor.updateWallLabelOffset}
          autoEditTextBoxId={autoEditTextBoxId}
          onClearAutoEditTextBox={() => setAutoEditTextBoxId(null)}
        />
          )}

          {/* 2D/3D toggle */}
          <div className="absolute top-3 right-3 z-20">
          <Button
            size="sm"
            variant={is3D ? "default" : "secondary"}
            className="shadow-md gap-1.5"
            onClick={() => {
              setIs3D((v) => {
                const next = !v;
                if (next) trackEvent("view3d_opened", { walls: state.walls.length, furniture: state.furniture.length });
                return next;
              });
            }}
            data-testid="btn-3d-toggle"
          >
            {is3D ? (
              <><PencilRuler className="h-4 w-4" /> 2D Plan</>
            ) : (
              <><BoxIcon className="h-4 w-4" /> 3D View <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">beta</span></>
            )}
          </Button>
          </div>
        </div>

        {/* Desktop: Properties sidebar */}
        {!isMobile && (
          <div className="w-56 border-l border-border bg-card flex flex-col">
            <ScrollArea className="flex-1">
              <PropertiesPanel
                selectedWall={selectedWall}
                selectedFurniture={selectedFurniture}
                selectedLabel={selectedLabel}
                selectedTextBox={selectedTextBox}
                selectedArrow={selectedArrow}
                onRotate={handleRotateSelected}
                onMirror={handleMirrorSelected}
                onDelete={handleDeleteSelected}
                onDuplicate={handleDuplicate}
                onUpdateFurniture={handleUpdateFurniture}
                onUpdateLabel={editor.updateLabel}
                onUpdateTextBox={editor.updateTextBox}
                onUpdateWall={editor.updateWall}
                onUpdateArrow={editor.updateArrow}
                onNudge={handleNudgeFurniture}
                walls={state.walls}
                onDimEditing={setDimEditing}
                units={state.units}
                measureMode={measureMode}
              />
            </ScrollArea>

            {/* Status bar & attribution via render prop */}
            {renderStatusBar && renderStatusBar(state)}
          </div>
        )}
      </div>

      {/* Clear confirmation dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear canvas?</DialogTitle>
            <DialogDescription>
              This will remove all walls, furniture, and labels. You can undo this with Ctrl+Z.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { editor.clearAll(); forgetPlanCodeForSlot(storageKey); setCurrentPlanCode(null); setShowClearDialog(false); }}>Clear All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save & share dialog */}
      <SavePlanDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        getPlanData={() => editor.exportAllRooms()}
        planName={state.roomName}
        existingCode={currentPlanCode}
        onSaved={handlePlanSaved}
        onDownloadImage={handleSavePlan}
      />

      {/* One-time rating prompt */}
      <RatingPromptDialog
        open={showRatingPrompt}
        onOpenChange={setShowRatingPrompt}
        mode={ratingPromptMode}
        onReviewOpened={handleReviewOpened}
      />

      {/* Toast notification */}
      {toast.visible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-foreground text-background rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Check className="h-4 w-4" />
          {toast.message}
        </div>
      )}
    </>
  );
}
