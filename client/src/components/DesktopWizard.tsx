import { useState } from "react";
import { safeSetItem } from "../lib/safe-storage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Layout, Pencil, Ruler, Keyboard, Rocket } from "lucide-react";

const WIZARD_STORAGE_KEY = "freeroomplanner-desktop-wizard-shown";

interface DesktopWizardProps {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: Layout,
    title: "Welcome to Free Room Planner",
    description:
      "A quick walkthrough to get you started. You can draw walls, place furniture, and export your floor plan \u2014 all for free, no account needed.",
  },
  {
    icon: Pencil,
    title: "Drawing Walls",
    description:
      "Select the wall tool (or press W), then click to place wall points. Each click connects to the previous point. Double-click to finish a wall chain. Walls that form closed shapes automatically calculate room area.",
  },
  {
    icon: Ruler,
    title: "Wall Measurements",
    description:
      "By default, measurements show the inside wall distance \u2014 this excludes wall thickness, giving you the actual usable room dimensions. You can switch to full wall measurement anytime using the Inside / Full Wall toggle in the toolbar menu.",
  },
  {
    icon: Keyboard,
    title: "Keyboard Shortcuts",
    description:
      "Speed up your workflow: V for Select, W for Walls, L for Label, E for Eraser, H for Pan. Use Ctrl+Z / Ctrl+Y to undo and redo. Scroll to zoom in and out. Press the ? button in the toolbar for the full shortcut list.",
  },
  {
    icon: Rocket,
    title: "You're Ready!",
    description:
      "Drag items from the furniture library on the left, or start by drawing your room\u2019s walls. Your plan auto-saves in the browser. When you\u2019re done, hit Save Image to export as PNG.",
  },
];

export default function DesktopWizard({ open, onClose }: DesktopWizardProps) {
  const [step, setStep] = useState(0);

  const handleClose = () => {
    safeSetItem(WIZARD_STORAGE_KEY, "1");
    setStep(0);
    onClose();
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="text-center sm:text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{current.title}</DialogTitle>
          <DialogDescription className="mt-2 text-center">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 pt-2 sm:justify-center">
          {step > 0 ? (
            <Button variant="outline" className="flex-1" onClick={handleBack}>
              Back
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Skip
            </Button>
          )}
          <Button className="flex-1" onClick={handleNext}>
            {step < steps.length - 1 ? "Next" : "Get Started"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
