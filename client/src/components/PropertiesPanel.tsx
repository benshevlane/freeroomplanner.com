import { Wall, FurnitureItem, RoomLabel, ArrowItem, ArrowLineType, ArrowHeadType, ArrowLineStyle, ArrowDashPattern, ArrowPresetName, ARROW_PRESETS, LabelSize, LabelColor, UnitSystem, isWallCupboard, cmToDisplay, displayToCm, dimensionSuffix } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCw, Trash2, Ruler, Copy, Bold, Square, ArrowLeftRight } from "lucide-react";

interface PropertiesPanelProps {
  selectedWall: Wall | null;
  selectedFurniture: FurnitureItem | null;
  selectedLabel: RoomLabel | null;
  selectedArrow: ArrowItem | null;
  onRotate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  onUpdateLabel: (id: string, updates: Partial<RoomLabel>) => void;
  onUpdateArrow: (id: string, updates: Partial<ArrowItem>) => void;
  units: UnitSystem;
}

/** Format a cm value for display in the selected units */
function formatDimension(cm: number, units: UnitSystem): string {
  switch (units) {
    case "m": return `${(cm / 100).toFixed(2)}m`;
    case "cm": return `${Math.round(cm)}cm`;
    case "mm": return `${Math.round(cm * 10)}mm`;
    case "ft": {
      const totalInches = cm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      if (inches === 12) return `${feet + 1}'0"`;
      if (feet === 0) return `${inches}"`;
      return `${feet}'${inches}"`;
    }
  }
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

const LINE_TYPES: { type: ArrowLineType; label: string }[] = [
  { type: "straight", label: "Straight" },
  { type: "curved", label: "Curved" },
  { type: "orthogonal", label: "Orthogonal" },
  { type: "polyline", label: "Polyline" },
];

const HEAD_TYPES: { type: ArrowHeadType; label: string; icon: string }[] = [
  { type: "none", label: "None", icon: "—" },
  { type: "filled-triangle", label: "Triangle", icon: "▶" },
  { type: "open-chevron", label: "Chevron", icon: "›" },
  { type: "circle", label: "Circle", icon: "●" },
  { type: "diamond-filled", label: "Diamond", icon: "◆" },
  { type: "diamond-outline", label: "Diamond ○", icon: "◇" },
  { type: "square", label: "Square", icon: "■" },
];

const LINE_STYLES: { style: ArrowLineStyle; label: string }[] = [
  { style: "solid", label: "Solid" },
  { style: "dashed", label: "Dashed" },
  { style: "dotted", label: "Dotted" },
];

const DASH_PATTERNS: { pattern: ArrowDashPattern; label: string }[] = [
  { pattern: "short", label: "Short" },
  { pattern: "long", label: "Long" },
  { pattern: "dash-dot", label: "Dash-Dot" },
];

const PRESET_LIST: { name: ArrowPresetName; label: string }[] = [
  { name: "annotation", label: "Annotation" },
  { name: "double-headed", label: "Double-headed" },
  { name: "dashed-pointer", label: "Dashed pointer" },
  { name: "bold-callout", label: "Bold callout" },
];

export default function PropertiesPanel({
  selectedWall,
  selectedFurniture,
  selectedLabel,
  selectedArrow,
  onRotate,
  onDelete,
  onDuplicate,
  onUpdateFurniture,
  onUpdateLabel,
  onUpdateArrow,
  units,
}: PropertiesPanelProps) {
  if (!selectedWall && !selectedFurniture && !selectedLabel && !selectedArrow) {
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
            <span className="font-medium">{formatDimension(lengthCm, units)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground ml-5">Thickness:</span>
            <span className="font-medium">{formatDimension(selectedWall.thickness, units)}</span>
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
              min={Math.round(cmToDisplay(minWidth, units))}
              value={Math.round(cmToDisplay(selectedFurniture.width, units) * 100) / 100}
              onChange={(e) => {
                const displayVal = parseFloat(e.target.value) || 0;
                const newCm = Math.max(minWidth, displayToCm(displayVal, units));
                const delta = newCm - selectedFurniture.width;
                onUpdateFurniture(selectedFurniture.id, {
                  width: newCm,
                  x: selectedFurniture.x - delta / 2,
                });
              }}
              className="h-9 w-24 text-sm md:h-7 md:w-20"
              data-testid="input-furniture-width"
            />
            <span className="text-muted-foreground text-xs">{dimensionSuffix(units)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{heightLabel}</span>
            <Input
              type="number"
              min={Math.round(cmToDisplay(minHeight, units))}
              value={Math.round(cmToDisplay(selectedFurniture.height, units) * 100) / 100}
              onChange={(e) => {
                const displayVal = parseFloat(e.target.value) || 0;
                const newCm = Math.max(minHeight, displayToCm(displayVal, units));
                const delta = newCm - selectedFurniture.height;
                onUpdateFurniture(selectedFurniture.id, {
                  height: newCm,
                  y: selectedFurniture.y - delta / 2,
                });
              }}
              className="h-9 w-24 text-sm md:h-7 md:w-20"
              data-testid="input-furniture-height"
            />
            <span className="text-muted-foreground text-xs">{dimensionSuffix(units)}</span>
          </div>
          {isWallCup && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Height from floor:</span>
              <Input
                type="number"
                min={0}
                value={Math.round(cmToDisplay(selectedFurniture.heightFromFloor ?? 145, units) * 100) / 100}
                onChange={(e) => {
                  const displayVal = parseFloat(e.target.value) || 0;
                  const newCm = Math.max(0, displayToCm(displayVal, units));
                  onUpdateFurniture(selectedFurniture.id, { heightFromFloor: newCm });
                }}
                className="h-9 w-24 text-sm md:h-7 md:w-20"
                data-testid="input-furniture-height-from-floor"
              />
              <span className="text-muted-foreground text-xs">{dimensionSuffix(units)}</span>
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

  if (selectedArrow) {
    return (
      <div className="p-4 space-y-3" data-testid="properties-arrow">
        <p className="text-sm font-semibold">Arrow</p>

        {/* Line type */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Line Type</p>
          <div className="flex gap-1 flex-wrap">
            {LINE_TYPES.map(({ type, label }) => (
              <Button
                key={type}
                size="sm"
                variant={selectedArrow.lineType === type ? "default" : "outline"}
                className="text-xs px-2 min-h-[32px]"
                onClick={() => {
                  const updates: Partial<ArrowItem> = { lineType: type };
                  if (type === "straight") updates.controlPoints = [];
                  if (type === "curved" && selectedArrow.controlPoints.length === 0) {
                    updates.controlPoints = [{
                      x: (selectedArrow.startPoint.x + selectedArrow.endPoint.x) / 2,
                      y: (selectedArrow.startPoint.y + selectedArrow.endPoint.y) / 2 - 50,
                    }];
                  }
                  onUpdateArrow(selectedArrow.id, updates);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Start head */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Start Head</p>
          <div className="flex gap-1 flex-wrap">
            {HEAD_TYPES.map(({ type, label, icon }) => (
              <Button
                key={type}
                size="sm"
                variant={selectedArrow.startHead === type ? "default" : "outline"}
                className="text-xs px-1.5 min-h-[32px] min-w-[32px]"
                title={label}
                onClick={() => onUpdateArrow(selectedArrow.id, { startHead: type })}
              >
                {icon}
              </Button>
            ))}
          </div>
        </div>

        {/* End head */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">End Head</p>
          <div className="flex gap-1 flex-wrap">
            {HEAD_TYPES.map(({ type, label, icon }) => (
              <Button
                key={type}
                size="sm"
                variant={selectedArrow.endHead === type ? "default" : "outline"}
                className="text-xs px-1.5 min-h-[32px] min-w-[32px]"
                title={label}
                onClick={() => onUpdateArrow(selectedArrow.id, { endHead: type })}
              >
                {icon}
              </Button>
            ))}
          </div>
        </div>

        {/* Stroke color */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Stroke Color</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={selectedArrow.strokeColor}
              onChange={(e) => onUpdateArrow(selectedArrow.id, { strokeColor: e.target.value })}
              className="w-8 h-8 rounded border border-border cursor-pointer"
            />
            <Input
              type="text"
              value={selectedArrow.strokeColor}
              onChange={(e) => onUpdateArrow(selectedArrow.id, { strokeColor: e.target.value })}
              className="h-8 w-24 text-xs font-mono"
            />
          </div>
        </div>

        {/* Stroke weight */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Stroke Weight: {selectedArrow.strokeWeight}px</p>
          <input
            type="range"
            min={1}
            max={12}
            value={selectedArrow.strokeWeight}
            onChange={(e) => onUpdateArrow(selectedArrow.id, { strokeWeight: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* Line style */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Line Style</p>
          <div className="flex gap-1">
            {LINE_STYLES.map(({ style, label }) => (
              <Button
                key={style}
                size="sm"
                variant={selectedArrow.lineStyle === style ? "default" : "outline"}
                className="flex-1 text-xs min-h-[32px]"
                onClick={() => onUpdateArrow(selectedArrow.id, { lineStyle: style })}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Dash pattern (only for dashed) */}
        {selectedArrow.lineStyle === "dashed" && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Dash Pattern</p>
            <div className="flex gap-1">
              {DASH_PATTERNS.map(({ pattern, label }) => (
                <Button
                  key={pattern}
                  size="sm"
                  variant={selectedArrow.dashPattern === pattern ? "default" : "outline"}
                  className="flex-1 text-xs min-h-[32px]"
                  onClick={() => onUpdateArrow(selectedArrow.id, { dashPattern: pattern })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Opacity */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Opacity: {Math.round(selectedArrow.opacity * 100)}%</p>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(selectedArrow.opacity * 100)}
            onChange={(e) => onUpdateArrow(selectedArrow.id, { opacity: parseInt(e.target.value) / 100 })}
            className="w-full"
          />
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Label</p>
          <Input
            type="text"
            value={selectedArrow.label || ""}
            onChange={(e) => onUpdateArrow(selectedArrow.id, { label: e.target.value || undefined })}
            placeholder="Arrow label..."
            className="h-8 text-sm"
          />
        </div>

        {selectedArrow.label && (
          <>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Label Size: {selectedArrow.labelFontSize || 14}px</p>
              <input
                type="range"
                min={10}
                max={28}
                value={selectedArrow.labelFontSize || 14}
                onChange={(e) => onUpdateArrow(selectedArrow.id, { labelFontSize: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Label Color</p>
              <input
                type="color"
                value={selectedArrow.labelColor || "#000000"}
                onChange={(e) => onUpdateArrow(selectedArrow.id, { labelColor: e.target.value })}
                className="w-8 h-8 rounded border border-border cursor-pointer"
              />
            </div>
          </>
        )}

        {/* Flip direction */}
        <Button
          size="sm"
          variant="outline"
          className="w-full min-h-[36px]"
          onClick={() => onUpdateArrow(selectedArrow.id, {
            startPoint: selectedArrow.endPoint,
            endPoint: selectedArrow.startPoint,
            startHead: selectedArrow.endHead,
            endHead: selectedArrow.startHead,
            startAttachment: selectedArrow.endAttachment,
            endAttachment: selectedArrow.startAttachment,
          })}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
          Flip Direction
        </Button>

        {/* Style Presets */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Presets</p>
          <div className="flex flex-col gap-1">
            {PRESET_LIST.map(({ name, label }) => (
              <Button
                key={name}
                size="sm"
                variant="outline"
                className="text-xs justify-start min-h-[32px]"
                onClick={() => onUpdateArrow(selectedArrow.id, ARROW_PRESETS[name])}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Delete */}
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive w-full mt-2 min-h-[44px] md:min-h-0">
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete Arrow
        </Button>
      </div>
    );
  }

  return null;
}
