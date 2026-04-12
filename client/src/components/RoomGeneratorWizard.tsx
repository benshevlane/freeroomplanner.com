import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Wall, FurnitureItem, Point, DEFAULT_WALL_THICKNESS } from "@/lib/types";

type WallSide = "top" | "bottom" | "left" | "right";
type FeatureType = "window" | "door";

interface WallFeature {
  id: string;
  wall: WallSide;
  type: FeatureType;
  widthCm: number;
  position: "center" | "custom";
  offsetCm: number; // offset from left/bottom edge of wall
}

interface GeneratedPlan {
  walls: Wall[];
  furniture: FurnitureItem[];
}

interface RoomGeneratorWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (plan: GeneratedPlan) => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const WALL_LABELS: Record<WallSide, string> = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
};

export default function RoomGeneratorWizard({
  open,
  onClose,
  onGenerate,
}: RoomGeneratorWizardProps) {
  const [step, setStep] = useState(0);
  const [roomName, setRoomName] = useState("Room");
  const [widthM, setWidthM] = useState("5.25");
  const [depthM, setDepthM] = useState("3.45");
  const [features, setFeatures] = useState<WallFeature[]>([
    {
      id: genId(),
      wall: "top",
      type: "window",
      widthCm: 100,
      position: "center",
      offsetCm: 0,
    },
  ]);

  const addFeature = useCallback(() => {
    setFeatures((f) => [
      ...f,
      {
        id: genId(),
        wall: "top",
        type: "window",
        widthCm: 100,
        position: "center",
        offsetCm: 0,
      },
    ]);
  }, []);

  const removeFeature = useCallback((id: string) => {
    setFeatures((f) => f.filter((feat) => feat.id !== id));
  }, []);

  const updateFeature = useCallback(
    (id: string, updates: Partial<WallFeature>) => {
      setFeatures((f) =>
        f.map((feat) => (feat.id === id ? { ...feat, ...updates } : feat))
      );
    },
    []
  );

  const handleGenerate = useCallback(() => {
    const wCm = parseFloat(widthM) * 100; // room interior width in cm
    const dCm = parseFloat(depthM) * 100; // room interior depth in cm
    if (isNaN(wCm) || isNaN(dCm) || wCm <= 0 || dCm <= 0) return;

    const wallThickness = DEFAULT_WALL_THICKNESS;
    const halfT = wallThickness / 2;

    // Origin: top-left outer corner of the room at (100, 100)
    // Walls are drawn center-to-center, so the outer boundary starts at origin
    // and the inner boundary is inset by half the wall thickness.
    const ox = 100; // origin x (cm)
    const oy = 100; // origin y (cm)

    // Corner points (wall center-line coordinates)
    const tl: Point = { x: ox, y: oy };
    const tr: Point = { x: ox + wCm, y: oy };
    const br: Point = { x: ox + wCm, y: oy + dCm };
    const bl: Point = { x: ox, y: oy + dCm };

    // Create 4 walls forming a closed rectangle (clockwise)
    const walls: Wall[] = [
      { id: genId(), start: tl, end: tr, thickness: wallThickness }, // top
      { id: genId(), start: tr, end: br, thickness: wallThickness }, // right
      { id: genId(), start: br, end: bl, thickness: wallThickness }, // bottom
      { id: genId(), start: bl, end: tl, thickness: wallThickness }, // left
    ];

    // Place features (windows/doors) as furniture items
    const furniture: FurnitureItem[] = [];

    for (const feat of features) {
      const isHorizontal = feat.wall === "top" || feat.wall === "bottom";
      const wallLengthCm = isHorizontal ? wCm : dCm;

      // Calculate center position along the wall
      let alongOffset: number; // distance from start of wall to center of feature
      if (feat.position === "center") {
        alongOffset = wallLengthCm / 2;
      } else {
        alongOffset = feat.offsetCm + feat.widthCm / 2;
      }

      // Clamp to wall bounds
      alongOffset = Math.max(
        feat.widthCm / 2,
        Math.min(wallLengthCm - feat.widthCm / 2, alongOffset)
      );

      let fx: number, fy: number;
      let rotation = 0;
      const featureDepth = 15; // cm (standard depth for windows/doors)

      if (feat.wall === "top") {
        fx = ox + alongOffset - feat.widthCm / 2;
        fy = oy - featureDepth / 2;
        rotation = 0;
      } else if (feat.wall === "bottom") {
        fx = ox + alongOffset - feat.widthCm / 2;
        fy = oy + dCm - featureDepth / 2;
        rotation = 0;
      } else if (feat.wall === "left") {
        // Rotated 90°: width and height swap
        fx = ox - featureDepth / 2;
        fy = oy + alongOffset - feat.widthCm / 2;
        rotation = 90;
      } else {
        // right wall
        fx = ox + wCm - featureDepth / 2;
        fy = oy + alongOffset - feat.widthCm / 2;
        rotation = 90;
      }

      const fWidth = rotation === 90 ? featureDepth : feat.widthCm;
      const fHeight = rotation === 90 ? feat.widthCm : featureDepth;

      furniture.push({
        id: genId(),
        type: feat.type,
        label: feat.type === "window" ? "Window" : "Door",
        x: fx,
        y: fy,
        width: fWidth,
        height: fHeight,
        rotation,
        category: "Structure",
      });
    }

    onGenerate({ walls, furniture });
    handleClose();
  }, [widthM, depthM, features, onGenerate]);

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const widthValid = !isNaN(parseFloat(widthM)) && parseFloat(widthM) > 0;
  const depthValid = !isNaN(parseFloat(depthM)) && parseFloat(depthM) > 0;
  const dimensionsValid = widthValid && depthValid;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 0 ? "Room Dimensions" : "Wall Features"}
          </DialogTitle>
          <DialogDescription>
            {step === 0
              ? "Enter the interior dimensions of your room."
              : "Add windows and doors to the walls. You can always edit these later."}
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Room Name
              </label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Living Room"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Width (m)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="50"
                  value={widthM}
                  onChange={(e) => setWidthM(e.target.value)}
                  placeholder="5.25"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Depth (m)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="50"
                  value={depthM}
                  onChange={(e) => setDepthM(e.target.value)}
                  placeholder="3.45"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Area:{" "}
              {dimensionsValid
                ? (parseFloat(widthM) * parseFloat(depthM)).toFixed(1)
                : "—"}{" "}
              m²
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto">
            {features.map((feat) => (
              <div
                key={feat.id}
                className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Wall
                      </label>
                      <Select
                        value={feat.wall}
                        onValueChange={(v) =>
                          updateFeature(feat.id, { wall: v as WallSide })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["top", "bottom", "left", "right"] as WallSide[]).map(
                            (side) => (
                              <SelectItem key={side} value={side}>
                                {WALL_LABELS[side]}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Type
                      </label>
                      <Select
                        value={feat.type}
                        onValueChange={(v) =>
                          updateFeature(feat.id, { type: v as FeatureType })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="window">Window</SelectItem>
                          <SelectItem value="door">Door</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Width (cm)
                      </label>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        min="30"
                        max="500"
                        value={feat.widthCm}
                        onChange={(e) =>
                          updateFeature(feat.id, {
                            widthCm: parseInt(e.target.value) || 100,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Position
                      </label>
                      <Select
                        value={feat.position}
                        onValueChange={(v) =>
                          updateFeature(feat.id, {
                            position: v as "center" | "custom",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="center">Centred</SelectItem>
                          <SelectItem value="custom">Custom offset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {feat.position === "custom" && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Offset from start (cm)
                        </label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          min="0"
                          value={feat.offsetCm}
                          onChange={(e) =>
                            updateFeature(feat.id, {
                              offsetCm: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive mt-4"
                  onClick={() => removeFeature(feat.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={addFeature}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Feature
            </Button>
          </div>
        )}

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 py-1">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            {step === 0 ? (
              <Button disabled={!dimensionsValid} onClick={() => setStep(1)}>
                Next
              </Button>
            ) : (
              <Button onClick={handleGenerate}>
                <Wand2 className="h-4 w-4 mr-1.5" />
                Generate
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
