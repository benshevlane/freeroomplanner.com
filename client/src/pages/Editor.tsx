import { useState, useEffect, useCallback } from "react";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useIsMobile } from "../hooks/use-mobile";
import EditorCore from "../components/EditorCore";
import FreeRoomPlannerLogo from "../components/FreeRoomPlannerLogo";
import MobileWizard from "../components/MobileWizard";
import DesktopWizard from "../components/DesktopWizard";
import RoomGeneratorWizard from "../components/RoomGeneratorWizard";
import { PerplexityAttribution } from "../components/PerplexityAttribution";
import IntentCapture from "../components/IntentCapture";
import { FurnitureItem } from "../lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sun,
  Moon,
  HelpCircle,
  Wand2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Editor() {
  useDocumentMeta({
    title: "Room Editor — Free Room Planner",
    description: "Draw walls, place furniture, and export your floor plan as PNG. Free online room planning tool — no account required.",
  });
  const isMobile = useIsMobile();
  const [showIntentCapture, setShowIntentCapture] = useState(() => {
    return !localStorage.getItem("freeroomplanner-intent");
  });
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

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

  const [showRoomGenerator, setShowRoomGenerator] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // We need a ref to the editor's importState / pushUndo / setTool for the room generator.
  // EditorCore exposes the editor via renderHeader's parameter.
  const editorRef = { current: null as any };

  const handleGenerateRoom = useCallback(
    (plan: { walls: import("@/lib/types").Wall[]; furniture: FurnitureItem[] }) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.pushUndo();
      editor.importState({
        version: 1,
        roomName: editor.state.roomName,
        walls: plan.walls,
        furniture: plan.furniture,
        labels: [],
        roomNames: {},
        componentLabelsVisible: true,
      });
      editor.setTool("select");
    },
    []
  );

  if (showIntentCapture) {
    return (
      <IntentCapture
        onComplete={() => setShowIntentCapture(false)}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" data-testid="editor-page">
      <EditorCore
        storageKey="freeroomplanner-autosave"
        isDark={isDark}
        renderHeader={(editor) => {
          // Store editor ref for room generator
          editorRef.current = editor;
          return (
            <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
              <FreeRoomPlannerLogo size={24} className="text-primary flex-shrink-0" />
              <span className="text-sm font-semibold tracking-tight hidden md:inline">Free Room Planner</span>
              <Separator orientation="vertical" className="h-5 hidden md:block" />
              <Input
                value={editor.state.roomName}
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
                        <ShortcutRow keys="T" action="Add Text Box" />
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
          );
        }}
        renderStatusBar={(state) => (
          <>
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
          </>
        )}
      />

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
