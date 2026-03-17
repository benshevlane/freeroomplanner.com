import { Wall, FurnitureItem, RoomLabel, LabelSize, LabelColor, isWallCupboard } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCw, Trash2, Ruler, Copy, Bold, Square } from "lucide-react";

interface PropertiesPanelProps {
  selectedWall: Wall | null;
  selectedFurniture: FurnitureItem | null;
  selectedLabel: RoomLabel | null;
  onRotate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  onUpdateLabel: (id: string, updates: Partial<RoomLabel>) => void;
}

const LABEL_COLORS: { color: LabelColor; hex: string; label: string }[] = [
  { color: "black", hex: "#3a3938", label: "Black" },
  { color: "teal", hex: "#01696f", label: "Teal" },
  { color: "red", hex: "#d32f2f", label: "Red" },
  { color: "grey", hex: "#9e9e9e", label: "Grey" },
];

const LABEL_SIZES: { size: LabelSize; label: string }[] = [
  { size: "small", label: "S" },
  { size: "medium", label: "M" },
  { size: "large", label: "L" },
];

export default function PropertiesPanel({
  selectedWall,
  selectedFurniture,
  selectedLabel,
  onRotate,
  onDelete,
  onDuplicate,
  onUpdateFurniture,
  onUpdateLabel,
}: PropertiesPanelProps) {
  if (!selectedWall && !selectedFurniture && !selectedLabel) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="properties-empty">
        <p className="font-medium text-foreground mb-1">Properties</p>
        <p>Select an item to view its properties</p>
      </div>
    );
  }

  if (selectedWall) {
    const dx = selectedWall.end.x - selectedWall.start.x;
    const dy = selectedWall.end.y - selectedWall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);

    return (
      <div className="p-4 space-y-3" data-testid="properties-wall">
        <p className="text-sm font-semibold">Wall</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Length:</span>
            <span className="font-medium">{(lengthCm / 100).toFixed(2)}m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground ml-5">Thickness:</span>
            <span className="font-medium">{selectedWall.thickness}cm</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive w-full mt-2 min-h-[44px] md:min-h-0" data-testid="btn-delete-wall">
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete Wall
        </Button>
      </div>
    );
  }

  if (selectedFurniture) {
    const isStructural = selectedFurniture.type === "door" || selectedFurniture.type === "window";
    const isWallCup = isWallCupboard(selectedFurniture.type);
    const widthLabel = isStructural ? "Length:" : "Width:";
    const heightLabel = isStructural ? "Thickness:" : "Height:";
    const minWidth = 20;
    const minHeight = isStructural ? 5 : 20;

    return (
      <div className="p-4 space-y-3" data-testid="properties-furniture">
        <p className="text-sm font-semibold">{selectedFurniture.customName || selectedFurniture.label}</p>
        {isWallCup ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Label:</span>
            <Input
              type="text"
              value={selectedFurniture.label}
              onChange={(e) => {
                onUpdateFurniture(selectedFurniture.id, { label: e.target.value });
              }}
              className="h-9 w-32 text-sm md:h-7 md:w-28"
              placeholder="e.g. W600"
              data-testid="input-furniture-label"
            />
          </div>
        ) : (
          <p className="text-sm font-semibold">{selectedFurniture.label}</p>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{widthLabel}</span>
            <Input
              type="number"
              min={minWidth}
              value={selectedFurniture.width}
              onChange={(e) => {
                const val = Math.max(minWidth, parseInt(e.target.value) || minWidth);
                const delta = val - selectedFurniture.width;
                onUpdateFurniture(selectedFurniture.id, {
                  width: val,
                  x: selectedFurniture.x - delta / 2,
                });
              }}
              className="h-9 w-24 text-sm md:h-7 md:w-20"
              data-testid="input-furniture-width"
            />
            <span className="text-muted-foreground text-xs">cm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{heightLabel}</span>
            <Input
              type="number"
              min={minHeight}
              value={selectedFurniture.height}
              onChange={(e) => {
                const val = Math.max(minHeight, parseInt(e.target.value) || minHeight);
                const delta = val - selectedFurniture.height;
                onUpdateFurniture(selectedFurniture.id, {
                  height: val,
                  y: selectedFurniture.y - delta / 2,
                });
              }}
              className="h-9 w-24 text-sm md:h-7 md:w-20"
              data-testid="input-furniture-height"
            />
            <span className="text-muted-foreground text-xs">cm</span>
          </div>
          {isWallCup && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Height from floor:</span>
              <Input
                type="number"
                min={0}
                value={selectedFurniture.heightFromFloor ?? 145}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  onUpdateFurniture(selectedFurniture.id, { heightFromFloor: val });
                }}
                className="h-9 w-24 text-sm md:h-7 md:w-20"
                data-testid="input-furniture-height-from-floor"
              />
              <span className="text-muted-foreground text-xs">cm</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rotation:</span>
            <span className="font-medium">{selectedFurniture.rotation}°</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Category:</span>
            <span className="font-medium">{selectedFurniture.category}</span>
          </div>
        </div>
        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="secondary" onClick={onRotate} className="flex-1 min-h-[44px] md:min-h-0" data-testid="btn-rotate-furniture">
            <RotateCw className="h-3.5 w-3.5 mr-1" />
            Rotate
          </Button>
          <Button size="sm" variant="secondary" onClick={onDuplicate} className="min-h-[44px] md:min-h-0" data-testid="btn-duplicate-furniture">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive min-h-[44px] md:min-h-0" data-testid="btn-delete-furniture">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  if (selectedLabel) {
    const currentSize = selectedLabel.size || "medium";
    const currentColor = selectedLabel.color || "black";
    const isBold = selectedLabel.bold || false;
    const hasBackground = selectedLabel.background || false;

    return (
      <div className="p-4 space-y-3" data-testid="properties-label">
        <p className="text-sm font-semibold">Label</p>
        <p className="text-sm text-muted-foreground">{selectedLabel.text}</p>

        {/* Font size */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Size</p>
          <div className="flex gap-1">
            {LABEL_SIZES.map(({ size, label }) => (
              <Button
                key={size}
                size="sm"
                variant={currentSize === size ? "default" : "outline"}
                className="flex-1 text-xs min-h-[36px] md:min-h-0"
                onClick={() => onUpdateLabel(selectedLabel.id, { size })}
                data-testid={`btn-label-size-${size}`}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Bold toggle */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isBold ? "default" : "outline"}
            onClick={() => onUpdateLabel(selectedLabel.id, { bold: !isBold })}
            className="min-h-[36px] md:min-h-0"
            data-testid="btn-label-bold"
          >
            <Bold className="h-3.5 w-3.5 mr-1" />
            Bold
          </Button>
          <Button
            size="sm"
            variant={hasBackground ? "default" : "outline"}
            onClick={() => onUpdateLabel(selectedLabel.id, { background: !hasBackground })}
            className="min-h-[36px] md:min-h-0"
            data-testid="btn-label-background"
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            Pill
          </Button>
        </div>

        {/* Color picker */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Color</p>
          <div className="flex gap-1.5">
            {LABEL_COLORS.map(({ color, hex, label }) => (
              <button
                key={color}
                title={label}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  currentColor === color ? "border-primary scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: hex }}
                onClick={() => onUpdateLabel(selectedLabel.id, { color })}
                data-testid={`btn-label-color-${color}`}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="secondary" onClick={onDuplicate} className="flex-1 min-h-[44px] md:min-h-0" data-testid="btn-duplicate-label">
            <Copy className="h-3.5 w-3.5 mr-1" />
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive min-h-[44px] md:min-h-0" data-testid="btn-delete-label">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
