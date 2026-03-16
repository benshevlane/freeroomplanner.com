import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Monitor, Pencil, ZoomIn, HelpCircle } from "lucide-react";

const WIZARD_STORAGE_KEY = "roomsketch-mobile-wizard-shown";

interface MobileWizardProps {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: Monitor,
    title: "Welcome to RoomSketch",
    description:
      "This tool works best on desktop, but you can absolutely draw floor plans on mobile too. Here's a quick guide.",
  },
  {
    icon: Pencil,
    title: "Drawing Walls",
    description:
      "Tap to place wall points. Each tap connects to the previous point. Double-tap to finish a wall chain.",
  },
  {
    icon: ZoomIn,
    title: "Navigation",
    description:
      "Pinch with two fingers to zoom in and out. Drag with two fingers to pan around the canvas.",
  },
  {
    icon: HelpCircle,
    title: "You're Ready!",
    description:
      "Use the toolbar to switch tools. Tap the \u24D8 icon anytime for more help. Now go draw your room!",
  },
];

export default function MobileWizard({ open, onClose }: MobileWizardProps) {
  const [step, setStep] = useState(0);

  const handleClose = () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, "1");
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
    <Drawer open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DrawerContent>
        <DrawerHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DrawerTitle>{current.title}</DrawerTitle>
          <DrawerDescription className="mt-2">
            {current.description}
          </DrawerDescription>
        </DrawerHeader>

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

        <DrawerFooter className="flex-row gap-2 pt-2">
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
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
