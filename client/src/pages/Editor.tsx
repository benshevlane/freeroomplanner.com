import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useRoute } from "wouter";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useIsMobile } from "../hooks/use-mobile";
import EditorCore from "../components/EditorCore";
import FreeRoomPlannerLogo from "../components/FreeRoomPlannerLogo";
import MobileWizard from "../components/MobileWizard";
import DesktopWizard from "../components/DesktopWizard";
import RoomGeneratorWizard from "../components/RoomGeneratorWizard";
import IntentCapture from "../components/IntentCapture";
import { FurnitureItem } from "../lib/types";
import { detectRooms } from "../lib/room-detection";
import { safeGetItem as sgi, safeSetItem as ssi } from "../lib/safe-storage";
import { trackEvent as te } from "@/lib/analytics";
import {
  Dialog as AnnounceDialog,
  DialogContent as AnnounceContent,
  DialogHeader as AnnounceHeader,
  DialogTitle as AnnounceTitle,
  DialogDescription as AnnounceDescription,
  DialogFooter as AnnounceFooter,
} from "@/components/ui/dialog";
import { Button as AnnounceButton } from "@/components/ui/button";
import { Box as BoxIcon3D } from "lucide-react";
import { getRoomKey } from "../lib/canvas-renderer";
import { safeGetItem } from "../lib/safe-storage";
import { fetchSharedPlan, intentToRoomType, type FetchedPlan } from "../lib/plan-share";
import { safeSessionGetItem, safeSessionSetItem } from "../lib/safe-storage";
import { trackEvent } from "../lib/analytics";
import { safeMatchMediaMatches } from "../lib/safe-match-media";
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

  // Shared plan support: /p/:code opens a plan saved to the cloud.
  const [, shareParams] = useRoute("/p/:code");
  const shareCode = shareParams?.code ? shareParams.code.toUpperCase() : null;
  const [sharedPlan, setSharedPlan] = useState<FetchedPlan | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "error">(
    shareCode ? "loading" : "idle"
  );

  useEffect(() => {
    if (!shareCode) return;
    let cancelled = false;
    fetchSharedPlan(shareCode)
      .then((plan) => {
        if (cancelled) return;
        if (plan) {
          setSharedPlan(plan);
          setShareStatus("idle");
        } else {
          setShareStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setShareStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  const [showIntentCapture, setShowIntentCapture] = useState(() => {
    // Never interrupt someone opening a shared link with the intent question.
    return !shareCode && !safeGetItem("freeroomplanner-intent");
  });
  const [isDark, setIsDark] = useState(() =>
    safeMatchMediaMatches("(prefers-color-scheme: dark)")
  );

  // Count a "plan started" once per browser session (feeds the daily report).
  useEffect(() => {
    if (showIntentCapture) return;
    if (safeSessionGetItem("freeroomplanner-started-tracked")) return;
    safeSessionSetItem("freeroomplanner-started-tracked", "1");
    trackEvent("plan_started");
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "plan_started", roomType: intentToRoomType() }),
    }).catch(() => {});
  }, [showIntentCapture]);

  // One-time "we now do 3D" announcement for returning users. New users get
  // the 3D step inside the onboarding wizard instead.
  const [show3DAnnounce, setShow3DAnnounce] = useState(false);
  useEffect(() => {
    const isReturning =
      sgi("freeroomplanner-desktop-wizard-shown") || sgi("freeroomplanner-mobile-wizard-shown");
    if (isReturning && !sgi("freeroomplanner-3d-announce-shown")) {
      const t = setTimeout(() => {
        setShow3DAnnounce(true);
        te("announce_3d_shown");
      }, 1200);
      return () => clearTimeout(t);
    }
  }, []);
  const close3DAnnounce = (openIn3D: boolean) => {
    ssi("freeroomplanner-3d-announce-shown", "true");
    setShow3DAnnounce(false);
    te(openIn3D ? "announce_3d_cta" : "announce_3d_dismissed");
    if (openIn3D) {
      // The 3D toggle lives on the editor canvas
      setTimeout(() => {
        (document.querySelector('[data-testid="btn-3d-toggle"]') as HTMLElement | null)?.click();
      }, 150);
    }
  };

  // Mobile onboarding wizard
  const [showMobileWizard, setShowMobileWizard] = useState(false);
  useEffect(() => {
    if (isMobile && !safeGetItem("freeroomplanner-mobile-wizard-shown")) {
      setShowMobileWizard(true);
    }
  }, [isMobile]);

  // Desktop onboarding wizard
  const [showDesktopWizard, setShowDesktopWizard] = useState(false);
  useEffect(() => {
    if (!isMobile && !safeGetItem("freeroomplanner-desktop-wizard-shown")) {
      setShowDesktopWizard(true);
    }
  }, [isMobile]);

  const [showRoomGenerator, setShowRoomGenerator] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // We need a ref to the editor's importState / pushUndo / setTool for the
  // room generator and for loading shared plans. EditorCore exposes the
  // editor via renderHeader's parameter.
  const editorRef = useRef<any>(null);

  // Once a shared plan has been fetched and the editor is mounted, load it.
  const importedShareRef = useRef(false);
  useEffect(() => {
    if (!sharedPlan || importedShareRef.current) return;
    const timer = setInterval(() => {
      if (editorRef.current) {
        importedShareRef.current = true;
        clearInterval(timer);
        editorRef.current.importState(sharedPlan.data);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [sharedPlan]);

  const handleGenerateRoom = useCallback(
    (plan: { walls: import("@/lib/types").Wall[]; furniture: FurnitureItem[]; name?: string }) => {
      const editor = editorRef.current;
      if (!editor) return;
      const name = (plan.name || "").trim() || editor.state.roomName;
      // Use the wizard's room name for the in-plan label too.
      let roomNames: Record<string, string> = {};
      try {
        const detected = detectRooms(plan.walls);
        if (detected.length > 0) {
          const largest = detected.reduce((a, b) => (b.area > a.area ? b : a));
          roomNames = { [getRoomKey(largest)]: name };
        }
      } catch { /* label fallback is fine */ }
      editor.pushUndo();
      editor.importState({
        version: 1,
        roomName: name,
        walls: plan.walls,
        furniture: plan.furniture,
        labels: [],
        roomNames,
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

  // Shared link: wait for the plan before showing the editor (avoids a flash
  // of someone else's autosaved work), and show a friendly not-found state.
  if (shareCode && shareStatus === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background" data-testid="shared-plan-loading">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto mb-4 rounded-full border-4 border-muted border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Opening shared plan…</p>
        </div>
      </div>
    );
  }
  if (shareCode && shareStatus === "error") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background" data-testid="shared-plan-error">
        <div className="text-center max-w-sm px-6">
          <h1 className="text-lg font-semibold mb-2">Plan not found</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This plan link doesn’t exist or is no longer available. Check the
            link, or start a fresh plan — it only takes a minute.
          </p>
          <Button asChild>
            <Link href="/app">Open the planner</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden overscroll-none" data-testid="editor-page">
      <EditorCore
        storageKey={shareCode ? `freeroomplanner-shared-${shareCode}` : "freeroomplanner-autosave"}
        initialShareCode={shareCode}
        isDark={isDark}
        renderHeader={(editor) => {
          // Store editor ref for room generator
          editorRef.current = editor;
          return (
            <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
              <a href="/" className="flex items-center gap-3 no-underline text-inherit cursor-pointer">
                <FreeRoomPlannerLogo size={24} className="text-primary flex-shrink-0" />
                <span className="text-sm font-semibold tracking-tight hidden md:inline">Free Room Planner</span>
              </a>
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

          </>
        )}
      />

      {/* Mobile onboarding wizard */}
      <MobileWizard open={showMobileWizard} onClose={() => setShowMobileWizard(false)} />

      {/* Desktop onboarding wizard */}
      {!isMobile && <DesktopWizard open={showDesktopWizard} onClose={() => setShowDesktopWizard(false)} />}

      {/* "We now do 3D" one-time announcement for returning users */}
      <AnnounceDialog open={show3DAnnounce} onOpenChange={(o) => { if (!o) close3DAnnounce(false); }}>
        <AnnounceContent className="max-w-md" data-testid="announce-3d">
          <AnnounceHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <BoxIcon3D className="h-6 w-6 text-primary" />
            </div>
            <AnnounceTitle className="text-center">Your plans just went 3D</AnnounceTitle>
            <AnnounceDescription className="text-center">
              Every plan you've made — including the ones you've already built — can now be
              viewed in 3D. Press the <span className="font-semibold text-foreground">3D View</span> button
              on the canvas to step inside your room: drag to look around, click any item to
              recolour it, choose floors and wall colours with{" "}
              <span className="font-semibold text-foreground">Style</span>, and download a photo
              of the result. All free.
            </AnnounceDescription>
          </AnnounceHeader>
          <AnnounceFooter className="gap-2 sm:justify-center">
            <AnnounceButton variant="ghost" size="sm" onClick={() => close3DAnnounce(false)}>
              Later
            </AnnounceButton>
            <AnnounceButton size="sm" onClick={() => close3DAnnounce(true)} data-testid="announce-3d-cta">
              See my plan in 3D
            </AnnounceButton>
          </AnnounceFooter>
        </AnnounceContent>
      </AnnounceDialog>

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
