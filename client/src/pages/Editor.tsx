import { useState, useEffect, useCallback, useRef } from "react";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useEditor } from "../hooks/use-editor";
import { useIsMobile } from "../hooks/use-mobile";
import FloorPlanCanvas from "../components/FloorPlanCanvas";
import EditorToolbar from "../components/EditorToolbar";
import FurniturePanel from "../components/FurniturePanel";
import PropertiesPanel from "../components/PropertiesPanel";
import FreeRoomPlannerLogo from "../components/FreeRoomPlannerLogo";
import MobileWizard from "../components/MobileWizard";
import DesktopWizard from "../components/DesktopWizard";
import RoomGeneratorWizard from "../components/RoomGeneratorWizard";
import { PerplexityAttribution } from "../components/PerplexityAttribution";
import IntentCapture from "../components/IntentCapture";
import { FurnitureTemplate, FurnitureItem, RoomLabel, TextBox, Arrow, Point, UnitSystem, MeasureMode } from "../lib/types";
import html2canvas from "html2canvas";
import { trackEvent } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Sun,
  Moon,
  HelpCircle,
  Keyboard,
  Check,
  Wand2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function Editor() {
  useDocumentMeta({
    title: "Room Editor — Free Room Planner",
    description: "Draw walls, place furniture, and export your floor plan as PNG. Free online room planning tool — no account required.",
  });
  const editor = useEditor();
  const { state } = editor;
  const isMobile = useIsMobile();
  const [showIntentCapture, setShowIntentCapture] = useState(() => {
    return !localStorage.getItem("freeroomplanner-intent");
  });
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [measureMode, setMeasureMode] = useState<MeasureMode>(() => {
    const stored = localStorage.getItem("freeroomplanner-measure-mode");
    return (stored === "inside" || stored === "full") ? stored : "inside";
  });

  const toggleMeasureMode = useCallback(() => {
    setMeasureMode((prev) => {
      const next = prev === "full" ? "inside" : "full";
      localStorage.setItem("freeroomplanner-measure-mode", next);
      return next;
    });
  }, []);
  // Mobile onboarding wizard
  const [showMobileWizard, setShowMobileWizard] = useState(false);
  useEffect(() => {
    if (isMobile && !localStorage.getItem("freeroomplanner-mobile-wizard-shown")) {
      setShowMobileWizard(true);
    }
  }, [isMobile]);

  // Desktop onboarding wizard
  const [showDesktopWizard, setShowDesktopWizard] = useState(false);
  useEffect(() => {
    if (!isMobile && !localStorage.getItem("freeroomplanner-desktop-wizard-shown")) {
      setShowDesktopWizard(true);
    }
  }, [isMobile]);

  const [droppingFurniture, setDroppingFurniture] = useState<FurnitureTemplate | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showRoomGenerator, setShowRoomGenerator] = useState(false);
  const [furniturePanelOpen, setFurniturePanelOpen] = useState(false);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clipboard for copy/paste
  const clipboardRef = useRef<{ type: "furniture"; data: FurnitureItem } | { type: "label"; data: RoomLabel } | { type: "textbox"; data: TextBox } | { type: "arrow"; data: Arrow } | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

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

  // Auto-open properties sheet on mobile when something is selected
  useEffect(() => {
    if (isMobile) {
      if (hasSelection) setPropertiesPanelOpen(true);
      else setPropertiesPanelOpen(false);
    }
  }, [isMobile, hasSelection]);

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
      if (e.key === "h" || e.key === "H") {
        if (!e.ctrlKey && !e.metaKey) editor.setTool("pan");
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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, handleCopy, handlePaste, handleDuplicate]);

  const handleRotateSelected = useCallback(() => {
    if (selectedFurniture) editor.rotateFurniture(selectedFurniture.id);
  }, [selectedFurniture, editor]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedWall) editor.removeWall(selectedWall.id);
    if (selectedFurniture) editor.removeFurniture(selectedFurniture.id);
    if (selectedLabel) editor.removeLabel(selectedLabel.id);
    if (selectedTextBox) editor.removeTextBox(selectedTextBox.id);
    if (selectedArrow) editor.removeArrow(selectedArrow.id);
  }, [selectedWall, selectedFurniture, selectedLabel, selectedTextBox, selectedArrow, editor]);

  const handleSavePlan = useCallback(async () => {
    try {
      // Find the canvas container
      const canvasContainer = document.querySelector('[data-testid="canvas-container"]') as HTMLElement;
      if (!canvasContainer) return;

      const capture = await html2canvas(canvasContainer, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });

      // Create a new canvas to composite the capture + watermark
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = capture.width;
      finalCanvas.height = capture.height;
      const ctx = finalCanvas.getContext('2d')!;

      // Draw the captured image
      ctx.drawImage(capture, 0, 0);

      // Draw branding watermark
      const w = finalCanvas.width;
      const h = finalCanvas.height;
      const text = "Made with freeroomplanner.com";
      const fontSize = Math.max(14, Math.round(h * 0.018));
      ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const padX = fontSize * 0.7;
      const padY = fontSize * 0.45;
      const boxW = textW + padX * 2;
      const boxH = fontSize + padY * 2;
      const margin = Math.round(h * 0.015);
      const bx = w - boxW - margin;
      const by = h - boxH - margin;

      // Semi-transparent background pill
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

      // White text
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + boxW / 2, by + boxH / 2);

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
          const intent = localStorage.getItem("freeroomplanner-intent");
          const planType = intent ? JSON.parse(intent)?.intent ?? "room" : "room";
          trackEvent('room_plan_saved', {
            plan_type: planType,
            room_name: state.roomName,
            timestamp: new Date().toISOString(),
          });
        } catch { /* analytics should never break the app */ }
      }, "image/png");
    } catch {
      showToast("Failed to save image");
    }
  }, [state.roomName, showToast]);

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
          if (plan.version && plan.walls && plan.furniture) {
            editor.importState(plan);
          }
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  }, [editor]);

  const handleGenerateRoom = useCallback(
    (plan: { walls: import("@/lib/types").Wall[]; furniture: FurnitureItem[] }) => {
      editor.pushUndo();
      editor.importState({
        version: 1,
        roomName: state.roomName,
        walls: plan.walls,
        furniture: plan.furniture,
        labels: [],
        roomNames: {},
        componentLabelsVisible: true,
      });
      editor.setTool("select");
      showToast("Room generated — edit walls and features as needed");
    },
    [editor, state.roomName, showToast]
  );

  const handleSelectFurniture = useCallback(
    (template: FurnitureTemplate) => {
      // Place at center of visible area
      const centerWorld = {
        x: (400 - state.panOffset.x) / ((state.gridSize * state.zoom) / 100),
        y: (300 - state.panOffset.y) / ((state.gridSize * state.zoom) / 100),
      };
      editor.addFurniture(template, centerWorld);
      editor.setTool("select");
    },
    [editor, state]
  );

  const handleAddTextBox = useCallback(() => {
    const centerWorld = {
      x: (400 - state.panOffset.x) / ((state.gridSize * state.zoom) / 100),
      y: (300 - state.panOffset.y) / ((state.gridSize * state.zoom) / 100),
    };
    editor.addTextBox(centerWorld);
    editor.setTool("select");
  }, [editor, state]);

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

  if (showIntentCapture) {
    return (
      <IntentCapture
        onComplete={() => setShowIntentCapture(false)}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="editor-page">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <FreeRoomPlannerLogo size={24} className="text-primary flex-shrink-0" />
        <span className="text-sm font-semibold tracking-tight hidden md:inline">Free Room Planner</span>
        <Separator orientation="vertical" className="h-5 hidden md:block" />
        <Input
          value={state.roomName}
          onChange={(e) => editor.setRoomName(e.target.value)}
          className="h-7 w-28 md:w-48 text-sm border-transparent bg-transparent focus:bg-card"
          data-testid="room-name-input"
        />
        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setShowRoomGenerator(true)}
          data-testid="btn-quick-room"
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Quick Room</span>
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" data-testid="btn-help">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isMobile ? "Help" : "Keyboard Shortcuts"}</DialogTitle>
            </DialogHeader>
            {isMobile ? (
              <div className="space-y-3 text-sm">
                <div>
                  <h4 className="font-medium mb-2">Touch Gestures</h4>
                  <ul className="text-muted-foreground space-y-1">
                    <li>Pinch with two fingers to zoom in/out</li>
                    <li>Drag with two fingers to pan the canvas</li>
                    <li>Tap an item on canvas to select it</li>
                    <li>Tap items in the library to place them</li>
                    <li>Drag corner handles to resize furniture</li>
                    <li>Use the Pan tool to drag the canvas with one finger</li>
                  </ul>
                </div>
                <div className="pt-2 border-t border-border">
                  <h4 className="font-medium mb-2">Quick Tips</h4>
                  <ul className="text-muted-foreground space-y-1">
                    <li>Tap to start a wall, tap again to place it. Keep tapping to chain walls.</li>
                    <li>Walls that form closed loops automatically show room area.</li>
                    <li>Toggle between metres and feet in the toolbar overflow menu.</li>
                    <li>Save your plan as a PNG image to share.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <ShortcutRow keys="V" action="Select & Move tool" />
                  <ShortcutRow keys="W" action="Draw Walls tool" />
                  <ShortcutRow keys="A" action="Draw Arrow tool" />
                  <ShortcutRow keys="L" action="Add Label tool" />
                  <ShortcutRow keys="E" action="Eraser tool" />
                  <Separator className="my-2" />
                  <ShortcutRow keys="Ctrl+Z" action="Undo" />
                  <ShortcutRow keys="Ctrl+Y" action="Redo" />
                  <ShortcutRow keys="Ctrl+C" action="Copy selected" />
                  <ShortcutRow keys="Ctrl+V" action="Paste" />
                  <ShortcutRow keys="Ctrl+D" action="Duplicate selected" />
                  <ShortcutRow keys="Del" action="Delete selected" />
                  <ShortcutRow keys="Esc" action="Cancel / Deselect" />
                  <ShortcutRow keys="Scroll" action="Zoom in/out" />
                  <ShortcutRow keys="H" action="Pan tool" />
                  <ShortcutRow keys="Alt+Drag" action="Pan canvas" />
                  <ShortcutRow keys="Dbl-click" action="Finish wall chain / Edit label" />
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <h4 className="text-sm font-medium mb-2">Quick Tips</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Click to start a wall, click again to place it. Keep clicking to chain walls.</li>
                    <li>Drag items from the library onto the canvas.</li>
                    <li>Drag corner handles to resize selected furniture.</li>
                    <li>Walls that form closed loops automatically show room area.</li>
                    <li>Toggle between metres and feet using the unit button in the toolbar.</li>
                    <li>Export as PDF to share with builders or contractors.</li>
                    <li>Save your plan as a PNG image to share.</li>
                  </ul>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsDark(!isDark)}
          data-testid="btn-theme-toggle"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* Toolbar */}
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
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {isMobile ? (
          <>
            {/* Mobile: Furniture panel in a left sheet */}
            <Sheet open={furniturePanelOpen} onOpenChange={setFurniturePanelOpen}>
              <SheetContent side="left" className="p-0 w-72">
                <SheetTitle className="sr-only">Items Library</SheetTitle>
                <FurniturePanel
                  className="w-full border-r-0"
                  onSelectFurniture={(t) => { handleSelectFurniture(t); setFurniturePanelOpen(false); }}
                  onSwitchToSelect={() => editor.setTool("select")}
                  onAddTextBox={() => { handleAddTextBox(); setFurniturePanelOpen(false); }}
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
                      onDelete={handleDeleteSelected}
                      onDuplicate={handleDuplicate}
                      onUpdateFurniture={handleUpdateFurniture}
                      onUpdateLabel={editor.updateLabel}
                      onUpdateTextBox={editor.updateTextBox}
                      onUpdateWall={editor.updateWall}
                      onUpdateArrow={editor.updateArrow}
                      units={state.units}
                    />
                  </ScrollArea>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          /* Desktop: Furniture panel inline */
          <FurniturePanel onSelectFurniture={handleSelectFurniture} onSwitchToSelect={() => editor.setTool("select")} onAddTextBox={handleAddTextBox} />
        )}

        {/* Canvas */}
        <FloorPlanCanvas
          state={state}
          isDark={isDark}
          measureMode={measureMode}
          onAddWall={editor.addWall}
          onSelectItem={editor.setSelectedItem}
          onMoveFurniture={editor.moveFurniture}
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
                onDelete={handleDeleteSelected}
                onDuplicate={handleDuplicate}
                onUpdateFurniture={handleUpdateFurniture}
                onUpdateLabel={editor.updateLabel}
                onUpdateTextBox={editor.updateTextBox}
                onUpdateWall={editor.updateWall}
                onUpdateArrow={editor.updateArrow}
                units={state.units}
              />
            </ScrollArea>

            {/* Status bar */}
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Walls</span>
                <span className="font-medium tabular-nums">{state.walls.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Items</span>
                <span className="font-medium tabular-nums">{state.furniture.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Labels</span>
                <span className="font-medium tabular-nums">{state.labels.length}</span>
              </div>
              {state.textBoxes.length > 0 && (
                <div className="flex justify-between">
                  <span>Text Boxes</span>
                  <span className="font-medium tabular-nums">{state.textBoxes.length}</span>
                </div>
              )}
              {state.arrows.length > 0 && (
                <div className="flex justify-between">
                  <span>Arrows</span>
                  <span className="font-medium tabular-nums">{state.arrows.length}</span>
                </div>
              )}
            </div>

            {/* Attribution */}
            <div className="border-t border-border p-2">
              <PerplexityAttribution />
            </div>
          </div>
        )}
      </div>
      {/* Clear confirmation dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear canvas?</DialogTitle>
            <DialogDescription>
              This will remove all walls, furniture, and labels. This action cannot be undone.
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

      {/* Mobile onboarding wizard */}
      <MobileWizard open={showMobileWizard} onClose={() => setShowMobileWizard(false)} />

      {/* Desktop onboarding wizard */}
      {!isMobile && <DesktopWizard open={showDesktopWizard} onClose={() => setShowDesktopWizard(false)} />}

      {/* Room generator wizard */}
      <RoomGeneratorWizard
        open={showRoomGenerator}
        onClose={() => setShowRoomGenerator(false)}
        onGenerate={handleGenerateRoom}
      />
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{action}</span>
      <kbd className="px-2 py-0.5 text-xs rounded bg-muted font-mono">{keys}</kbd>
    </div>
  );
}
