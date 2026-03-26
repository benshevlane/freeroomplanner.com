import { useState, useRef } from "react";
import { Wall, WallType, FurnitureItem, RoomLabel, TextBox, Arrow, ArrowStyle, ArrowHeadStyle, LabelSize, LabelColor, UnitSystem, isWallCupboard, cmToDisplay, displayToCm, dimensionSuffix, FURNITURE_LIBRARY } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RotateCw, Trash2, Ruler, Copy, Bold, Square, FlipHorizontal } from "lucide-react";

interface PropertiesPanelProps {
  selectedWall: Wall | null;
  selectedFurniture: FurnitureItem | null;
  selectedLabel: RoomLabel | null;
  selectedTextBox: TextBox | null;
  selectedArrow: Arrow | null;
  onRotate: () => void;
  onMirror?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  onUpdateLabel: (id: string, updates: Partial<RoomLabel>) => void;
  onUpdateTextBox?: (id: string, updates: Partial<TextBox>) => void;
  onUpdateWall?: (id: string, updates: Partial<Wall>) => void;
  onUpdateArrow?: (id: string, updates: Partial<Arrow>) => void;
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

export default function PropertiesPanel({
  selectedWall,
  selectedFurniture,
  selectedLabel,
  selectedTextBox,
  selectedArrow,
  onRotate,
  onMirror,
  onDelete,
  onDuplicate,
  onUpdateFurniture,
  onUpdateLabel,
  onUpdateTextBox,
  onUpdateWall,
  onUpdateArrow,
  units,
}: PropertiesPanelProps) {
  if (!selectedWall && !selectedFurniture && !selectedLabel && !selectedTextBox && !selectedArrow) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="properties-empty">
        <p className="font-medium text-foreground mb-1">Properties</p>
        <p>Select an item to view its properties</p>
      </div>
    );
  }

  const [lengthInput, setLengthInput] = useState("");
  const [thicknessInput, setThicknessInput] = useState("");
  const [editingLength, setEditingLength] = useState(false);
  const [editingThickness, setEditingThickness] = useState(false);
  const lengthRef = useRef<HTMLInputElement>(null);
  const thicknessRef = useRef<HTMLInputElement>(null);

  if (selectedWall) {
    const dx = selectedWall.end.x - selectedWall.start.x;
    const dy = selectedWall.end.y - selectedWall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);

    const commitLength = (val: string) => {
      setEditingLength(false);
      if (!onUpdateWall) return;
      const parsed = parseFloat(val.replace(/m$/i, ""));
      if (isNaN(parsed)) return;
      const newLengthCm = Math.max(10, parsed * 100); // min 0.10m = 10cm
      if (Math.abs(newLengthCm - lengthCm) < 0.01) return;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) return;
      const dirX = dx / len;
      const dirY = dy / len;
      onUpdateWall(selectedWall.id, {
        end: {
          x: Math.round(selectedWall.start.x + dirX * newLengthCm),
          y: Math.round(selectedWall.start.y + dirY * newLengthCm),
        },
      });
    };

    const commitThickness = (val: string) => {
      setEditingThickness(false);
      if (!onUpdateWall) return;
      const parsed = parseFloat(val.replace(/m$/i, ""));
      if (isNaN(parsed)) return;
      const newThickCm = Math.max(5, Math.min(60, parsed * 100)); // 0.05m–0.60m
      if (Math.abs(newThickCm - selectedWall.thickness) < 0.01) return;
      onUpdateWall(selectedWall.id, { thickness: Math.round(newThickCm) });
    };

    return (
      <div className="p-4 space-y-3" data-testid="properties-wall">
        <p className="text-sm font-semibold">Wall</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Length:</span>
            {editingLength ? (
              <input
                ref={lengthRef}
                type="text"
                value={lengthInput}
                onChange={(e) => setLengthInput(e.target.value)}
                onBlur={() => commitLength(lengthInput)}
                onKeyDown={(e) => { if (e.key === "Enter") commitLength(lengthInput); if (e.key === "Escape") setEditingLength(false); }}
                className="bg-transparent border-b-2 border-teal-500 outline-none font-medium w-20 text-sm px-0"
                autoFocus
              />
            ) : (
              <span
                className="font-medium cursor-pointer hover:border-b hover:border-teal-500/50 transition-colors"
                onClick={() => { setLengthInput((lengthCm / 100).toFixed(2)); setEditingLength(true); }}
              >
                {formatDimension(lengthCm, units)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground ml-5">Thickness:</span>
            {editingThickness ? (
              <input
                ref={thicknessRef}
                type="text"
                value={thicknessInput}
                onChange={(e) => setThicknessInput(e.target.value)}
                onBlur={() => commitThickness(thicknessInput)}
                onKeyDown={(e) => { if (e.key === "Enter") commitThickness(thicknessInput); if (e.key === "Escape") setEditingThickness(false); }}
                className="bg-transparent border-b-2 border-teal-500 outline-none font-medium w-20 text-sm px-0"
                autoFocus
              />
            ) : (
              <span
                className="font-medium cursor-pointer hover:border-b hover:border-teal-500/50 transition-colors"
                onClick={() => { setThicknessInput((selectedWall.thickness / 100).toFixed(2)); setEditingThickness(true); }}
              >
                {formatDimension(selectedWall.thickness, units)}
              </span>
            )}
          </div>
          {onUpdateWall && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground ml-5">Wall Type</p>
              <div className="flex gap-1 ml-5">
                {(["exterior", "interior"] as WallType[]).map((wt) => (
                  <Button
                    key={wt}
                    size="sm"
                    variant={(selectedWall.wallType || "exterior") === wt ? "default" : "outline"}
                    className="flex-1 text-xs min-h-[36px] md:min-h-0 capitalize"
                    onClick={() => {
                      const newThickness = wt === "exterior" ? 30 : 15;
                      onUpdateWall(selectedWall.id, { wallType: wt, thickness: newThickness });
                    }}
                    data-testid={`btn-wall-type-${wt}`}
                  >
                    {wt}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive w-full mt-2 min-h-[44px] md:min-h-0" data-testid="btn-delete-wall">
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete Wall
        </Button>
      </div>
    );
  }

  if (selectedFurniture) {
    const isStructural = selectedFurniture.type === "door" || selectedFurniture.type === "door_double" || selectedFurniture.type === "window" || selectedFurniture.type === "radiator";
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
          {onMirror && FURNITURE_LIBRARY.find((t) => t.type === selectedFurniture.type)?.mirrorable && (
            <Button size="sm" variant="secondary" onClick={onMirror} className="min-h-[44px] md:min-h-0" data-testid="btn-mirror-furniture">
              <FlipHorizontal className="h-3.5 w-3.5" />
            </Button>
          )}
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

  if (selectedTextBox && onUpdateTextBox) {
    const tb = selectedTextBox;
    return (
      <div className="p-4 space-y-3" data-testid="properties-textbox">
        <p className="text-sm font-semibold">Text Box</p>

        {/* Name */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Name</p>
          <Input
            type="text"
            value={tb.customName || ""}
            onChange={(e) => onUpdateTextBox(tb.id, { customName: e.target.value })}
            className="h-7 text-sm"
            placeholder="Text Box"
          />
        </div>

        {/* Rotation */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Rotation:</span>
          <span className="font-medium">{tb.rotation}°</span>
        </div>

        {/* Border */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Border</p>
            <Switch
              checked={tb.borderEnabled}
              onCheckedChange={(v) => onUpdateTextBox(tb.id, { borderEnabled: v })}
            />
          </div>
          {tb.borderEnabled && (
            <div className="space-y-2 pl-1">
              <div className="flex items-center gap-2">
                <label className="relative cursor-pointer">
                  <span className="block w-6 h-6 rounded border border-border" style={{ backgroundColor: tb.borderColor }} />
                  <input
                    type="color"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    value={tb.borderColor}
                    onChange={(e) => onUpdateTextBox(tb.id, { borderColor: e.target.value })}
                  />
                </label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={tb.borderWidth}
                  onChange={(e) => onUpdateTextBox(tb.id, { borderWidth: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="h-7 w-14 text-xs"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <div className="flex gap-1">
                {(["solid", "dashed", "dotted"] as const).map((style) => (
                  <Button
                    key={style}
                    size="sm"
                    variant={tb.borderStyle === style ? "default" : "outline"}
                    className="flex-1 text-xs h-7"
                    onClick={() => onUpdateTextBox(tb.id, { borderStyle: style })}
                  >
                    {style}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Corner Radius */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Corner Radius: {tb.cornerRadius}px</p>
          <Slider
            value={[tb.cornerRadius]}
            min={0}
            max={40}
            step={1}
            onValueChange={([v]) => onUpdateTextBox(tb.id, { cornerRadius: v })}
          />
        </div>

        {/* Background */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">Background</p>
            <label className="relative cursor-pointer">
              <span className="block w-6 h-6 rounded border border-border" style={{ backgroundColor: tb.backgroundColor }} />
              <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer"
                value={tb.backgroundColor}
                onChange={(e) => onUpdateTextBox(tb.id, { backgroundColor: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Opacity: {Math.round(tb.backgroundOpacity * 100)}%</p>
          <Slider
            value={[tb.backgroundOpacity * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => onUpdateTextBox(tb.id, { backgroundOpacity: v / 100 })}
          />
        </div>

        {/* Padding */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Padding: {tb.padding}px</p>
          <Slider
            value={[tb.padding]}
            min={4}
            max={40}
            step={1}
            onValueChange={([v]) => onUpdateTextBox(tb.id, { padding: v })}
          />
        </div>

        {/* Shadow */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Shadow</p>
            <Switch
              checked={tb.shadowEnabled}
              onCheckedChange={(v) => onUpdateTextBox(tb.id, { shadowEnabled: v })}
            />
          </div>
          {tb.shadowEnabled && (
            <div className="space-y-1.5 pl-1">
              <p className="text-xs text-muted-foreground">Blur: {tb.shadowBlur}px</p>
              <Slider
                value={[tb.shadowBlur]}
                min={0}
                max={30}
                step={1}
                onValueChange={([v]) => onUpdateTextBox(tb.id, { shadowBlur: v })}
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">X: {tb.shadowOffsetX}</p>
                  <Slider
                    value={[tb.shadowOffsetX]}
                    min={-20}
                    max={20}
                    step={1}
                    onValueChange={([v]) => onUpdateTextBox(tb.id, { shadowOffsetX: v })}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Y: {tb.shadowOffsetY}</p>
                  <Slider
                    value={[tb.shadowOffsetY]}
                    min={-20}
                    max={20}
                    step={1}
                    onValueChange={([v]) => onUpdateTextBox(tb.id, { shadowOffsetY: v })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="secondary" onClick={onDuplicate} className="flex-1 min-h-[44px] md:min-h-0" data-testid="btn-duplicate-textbox">
            <Copy className="h-3.5 w-3.5 mr-1" />
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive min-h-[44px] md:min-h-0" data-testid="btn-delete-textbox">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  if (selectedArrow && onUpdateArrow) {
    const arrow = selectedArrow;
    return (
      <div className="p-4 space-y-3" data-testid="properties-arrow">
        <p className="text-sm font-semibold">Arrow</p>

        {/* Label */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Label</p>
          <Input
            type="text"
            value={arrow.label}
            onChange={(e) => onUpdateArrow(arrow.id, { label: e.target.value })}
            className="h-7 text-sm"
            placeholder="Optional label"
          />
        </div>

        {/* Stroke Color */}
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Color</p>
          <label className="relative cursor-pointer">
            <span className="block w-6 h-6 rounded border border-border" style={{ backgroundColor: arrow.strokeColor }} />
            <input
              type="color"
              className="absolute inset-0 opacity-0 cursor-pointer"
              value={arrow.strokeColor}
              onChange={(e) => onUpdateArrow(arrow.id, { strokeColor: e.target.value })}
            />
          </label>
        </div>

        {/* Stroke Width */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Width: {arrow.strokeWidth}px</p>
          <Slider
            value={[arrow.strokeWidth]}
            min={1}
            max={8}
            step={1}
            onValueChange={([v]) => onUpdateArrow(arrow.id, { strokeWidth: v })}
          />
        </div>

        {/* Stroke Style */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Style</p>
          <div className="flex gap-1">
            {(["solid", "dashed"] as ArrowStyle[]).map((style) => (
              <Button
                key={style}
                size="sm"
                variant={arrow.strokeStyle === style ? "default" : "outline"}
                className="flex-1 text-xs h-7 capitalize"
                onClick={() => onUpdateArrow(arrow.id, { strokeStyle: style })}
              >
                {style}
              </Button>
            ))}
          </div>
        </div>

        {/* Head Style (end) */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Arrowhead (end)</p>
          <div className="flex gap-1">
            {(["filled", "open", "none"] as ArrowHeadStyle[]).map((style) => (
              <Button
                key={style}
                size="sm"
                variant={arrow.headStyle === style ? "default" : "outline"}
                className="flex-1 text-xs h-7 capitalize"
                onClick={() => onUpdateArrow(arrow.id, { headStyle: style })}
              >
                {style}
              </Button>
            ))}
          </div>
        </div>

        {/* Tail Style (start) */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Arrowhead (start)</p>
          <div className="flex gap-1">
            {(["filled", "open", "none"] as ArrowHeadStyle[]).map((style) => (
              <Button
                key={style}
                size="sm"
                variant={arrow.tailStyle === style ? "default" : "outline"}
                className="flex-1 text-xs h-7 capitalize"
                onClick={() => onUpdateArrow(arrow.id, { tailStyle: style })}
              >
                {style}
              </Button>
            ))}
          </div>
        </div>

        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive w-full mt-2 min-h-[44px] md:min-h-0" data-testid="btn-delete-arrow">
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete Arrow
        </Button>
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
