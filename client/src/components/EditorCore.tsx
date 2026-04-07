import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor } from "../hooks/use-editor";
import { useIsMobile } from "../hooks/use-mobile";
import FloorPlanCanvas from "./FloorPlanCanvas";
import EditorToolbar from "./EditorToolbar";
import FurniturePanel from "./FurniturePanel";
import PropertiesPanel from "./PropertiesPanel";
import RoomTabs from "./RoomTabs";
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
  collectComponentLabelRects,
  resolveAndDrawLabelCollisions,
  collectWallMeasurementLabelRects,
  findParallelWallDiscrepancies,
  drawWallLabelsWithDiscrepancy,
  computeRoomLabelPositions,
  collectDistanceMeasurementRects,
} from "../lib/canvas-renderer";
import { detectRooms } from "../lib/room-detection";
import { safeGetItem, safeSetItem } from "../lib/safe-storage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Check } from "lucide-react";
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
}

export default function EditorCore({
  storageKey,
  units: defaultUnits,
  hideToolbar = false,
  isDark,
  renderHeader,
  renderStatusBar,
  onExport,
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

  const [droppingFurniture, setDroppingFurniture] = useState<FurnitureTemplate | null>(null);
  const [autoEditTextBoxId, setAutoEditTextBoxId] = useState<string | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [furniturePanelOpen, setFurniturePanelOpen] = useState(false);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
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
      clipboardRef.current = { type: "furniture", data: { ...selectedFurniture } };
    } else if (selectedLabel) {
      clipboardRef.current = { type: "label", data: { ...selectedLabel } };
    } else if (selectedTextBox) {
      clipboardRef.current = { type: "textbox", data: { ...selectedTextBox } };
    } else if (selectedArrow) {
      clipboardRef.current = { type: "arrow", data: { ...selectedArrow } };
    }
    // Then paste immediately
    const clip = clipboardRef.current;
    if (!clip) return;
    if (clip.type === "furniture") {
      const template: FurnitureTemplate = {
        type: clip.data.type,
        label: (clip.data as FurnitureItem).label,
        width: (clip.data as FurnitureItem).width,
        height: (clip.data as FurnitureItem).height,
        category: (clip.data as FurnitureItem).category,
        icon: "",
      };
      editor.addFurniture(template, {
        x: (clip.data as FurnitureItem).x + (clip.data as FurnitureItem).width / 2 + 20,
        y: (clip.data as FurnitureItem).y + (clip.data as FurnitureItem).height / 2 + 20,
      });
    } else if (clip.type === "label") {
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

      // Arrow keys: nudge selected furniture by 1cm
      if (selectedFurniture && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
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
        drawRoomAreas(ctx, rooms, gridSize, zoom, panOffset, isDark, state.units, state.roomNames, null, roomLabelPositions, state.roomLabelOffsets);
      }

      // Walls with measurement labels
      drawWalls(ctx, state.walls, gridSize, zoom, panOffset, isDark, null, state.units, measureMode, state.furniture, rooms);

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

      finalCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${state.roomName.replace(/[^a-zA-Z0-9]/g, "_")}_plan.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Plan saved as PNG image");
        try {
          const intent = safeGetItem("freeroomplanner-intent");
          const planType = intent ? JSON.parse(intent)?.intent ?? "room" : "room";
          trackEvent('room_plan_saved', {
            plan_type: planType,
            room_name: state.roomName,
            timestamp: new Date().toISOString(),
          });
        } catch { /* analytics should never break the app */ }
        try { onExport?.(); } catch { /* never break the app */ }
      }, "image/png");
    } catch {
      showToast("Failed to save image");
    }
  }, [state, measureMode, showToast, onExport]);

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

  const handleLoadPlan = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const plan = JSON.parse(ev.target?.result as string);
          // Multi-tab format: { version: 2, tabs: [...] }
          if (plan.version === 2 && Array.isArray(plan.tabs)) {
            editor.importState(plan);
            showToast(`Loaded ${plan.tabs.length} rooms`);
            return;
          }
          // Single-room v1 format
          if (plan.version && plan.walls && plan.furniture) {
            editor.importState(plan);
            showToast("Plan loaded");
          }
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  }, [editor, showToast]);

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
      editor.updateFurniture(id, updates);
    },
    [editor]
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
          onUndo={editor.undo}
          onRedo={editor.redo}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onZoomIn={() => editor.setZoom(state.zoom * 1.2)}
          onZoomOut={() => editor.setZoom(state.zoom / 1.2)}
          onRotateSelected={handleRotateSelected}
          onDeleteSelected={handleDeleteSelected}
          hasSelection={hasSelection}
          selectionIsFurniture={!!selectedFurniture}
          onSavePlan={handleSavePlan}
          onSaveJSON={handleSaveJSON}
          onSaveAllJSON={handleSaveAllJSON}
          onLoadPlan={handleLoadPlan}
          onClearAll={() => setShowClearDialog(true)}
          zoom={state.zoom}
          units={state.units}
          onSetUnits={editor.setUnits}
          measureMode={measureMode}
          onToggleMeasureMode={toggleMeasureMode}
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

        {/* Canvas */}
        <FloorPlanCanvas
          state={state}
          isDark={isDark}
          measureMode={measureMode}
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
            <Button variant="destructive" onClick={() => { editor.clearAll(); setShowClearDialog(false); }}>Clear All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
