import { useState, useRef } from "react";
import { Wall, WallType, FurnitureItem, RoomLabel, TextBox, Arrow, ArrowStyle, ArrowHeadStyle, LabelSize, LabelColor, UnitSystem, isWallCupboard, cmToDisplay, displayToCm, dimensionSuffix, FURNITURE_LIBRARY } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RotateCw, Trash2, Ruler, Copy, Bold, Square, FlipHorizontal, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";

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
  onNudge?: (dx: number, dy: number) => void;
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
      if (inches === 12) return `${feet + 1}'0\"`;
      if (feet === 0) return `${inches}\"`;
      return `${feet}'${inches}\"`;
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

export default function PropertiesPanel(props: PropertiesPanelProps) {
  const {
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
    onNudge,
    units,
  } = props;
  return <PropertiesPanelInner
    selectedWall={selectedWall}
    selectedFurniture={selectedFurniture}
    selectedLabel={selectedLabel}
    selectedTextBox={selectedTextBox}
    selectedArrow={selectedArrow}
    onRotate={onRotate}
    onMirror={onMirror}
    onDelete={onDelete}
    onDuplicate={onDuplicate}
    onUpdateFurniture={onUpdateFurniture}
    onUpdateLabel={onUpdateLabel}
    onUpdateTextBox={onUpdateTextBox}
    onUpdateWall={onUpdateWall}
    onUpdateArrow={onUpdateArrow}
    onNudge={onNudge}
    units={units}
  />;
}
