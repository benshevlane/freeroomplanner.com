export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number; // in cm
}

export interface FurnitureItem {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number; // in cm
  height: number; // in cm
  rotation: number; // degrees
  category: string;
  customName?: string; // user-renamed label, persists across sessions
  heightFromFloor?: number; // in cm, used for wall cupboards (default 145)
}

export type LabelSize = "small" | "medium" | "large";
export type LabelColor = "black" | "teal" | "red" | "grey";

export interface RoomLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  // Freeform label formatting
  size?: LabelSize;
  bold?: boolean;
  color?: LabelColor;
  background?: boolean; // white pill background
}

export type EditorTool = "select" | "wall" | "furniture" | "label" | "eraser" | "pan" | "arrow";

// Arrow types
export type ArrowLineType = "straight" | "curved" | "orthogonal" | "polyline";
export type ArrowHeadType = "none" | "filled-triangle" | "open-chevron" | "circle" | "diamond-filled" | "diamond-outline" | "square";
export type ArrowLineStyle = "solid" | "dashed" | "dotted";
export type ArrowDashPattern = "short" | "long" | "dash-dot";

export interface ArrowAttachment {
  componentId: string;
  // Relative position on the component (0-1 range) for center, corners, edge midpoints
  anchorX: number;
  anchorY: number;
}

export interface ArrowItem {
  id: string;
  startPoint: Point;
  endPoint: Point;
  lineType: ArrowLineType;
  controlPoints: Point[]; // bezier control point for curved, waypoints for polyline, bend points for orthogonal
  startHead: ArrowHeadType;
  endHead: ArrowHeadType;
  strokeColor: string;
  strokeWeight: number; // 1-12
  lineStyle: ArrowLineStyle;
  dashPattern: ArrowDashPattern;
  opacity: number; // 0.1 - 1.0
  label?: string;
  labelFontSize?: number;
  labelColor?: string;
  startAttachment?: ArrowAttachment;
  endAttachment?: ArrowAttachment;
}

export type ArrowPresetName = "annotation" | "double-headed" | "dashed-pointer" | "bold-callout";

export const ARROW_PRESETS: Record<ArrowPresetName, Partial<ArrowItem>> = {
  "annotation": {
    strokeColor: "#000000",
    strokeWeight: 2,
    startHead: "none",
    endHead: "filled-triangle",
    lineStyle: "solid",
    opacity: 1,
  },
  "double-headed": {
    strokeColor: "#888888",
    strokeWeight: 3,
    startHead: "filled-triangle",
    endHead: "filled-triangle",
    lineStyle: "solid",
    opacity: 1,
  },
  "dashed-pointer": {
    strokeColor: "#000000",
    strokeWeight: 2,
    startHead: "none",
    endHead: "open-chevron",
    lineStyle: "dashed",
    dashPattern: "short",
    opacity: 1,
  },
  "bold-callout": {
    strokeColor: "#000000",
    strokeWeight: 6,
    startHead: "none",
    endHead: "filled-triangle",
    lineStyle: "solid",
    opacity: 1,
  },
};

export type UnitSystem = "m" | "cm" | "mm" | "ft";

/** Display labels for each unit system */
export const UNIT_LABELS: Record<UnitSystem, string> = {
  m: "Metres",
  cm: "Centimetres",
  mm: "Millimetres",
  ft: "Feet & Inches",
};

/** Short suffix shown on the toolbar button */
export const UNIT_SHORT: Record<UnitSystem, string> = {
  m: "m",
  cm: "cm",
  mm: "mm",
  ft: "ft",
};

/** Convert cm (internal) to a display value for the given unit */
export function cmToDisplay(cm: number, units: UnitSystem): number {
  switch (units) {
    case "m": return cm / 100;
    case "cm": return cm;
    case "mm": return cm * 10;
    case "ft": return cm / 2.54; // display as inches
  }
}

/** Convert a display value back to cm (internal) */
export function displayToCm(val: number, units: UnitSystem): number {
  switch (units) {
    case "m": return val * 100;
    case "cm": return val;
    case "mm": return val / 10;
    case "ft": return val * 2.54; // input is inches
  }
}

/** Unit suffix for dimension inputs (properties panel) */
export function dimensionSuffix(units: UnitSystem): string {
  switch (units) {
    case "m": return "m";
    case "cm": return "cm";
    case "mm": return "mm";
    case "ft": return "in";
  }
}

export type MeasureMode = "full" | "inside";

export interface EditorState {
  walls: Wall[];
  furniture: FurnitureItem[];
  labels: RoomLabel[];
  arrows: ArrowItem[];
  gridSize: number; // px per meter
  zoom: number;
  panOffset: Point;
  selectedTool: EditorTool;
  selectedItemId: string | null;
  wallDrawing: { start: Point } | null;
  wallChainStart: Point | null; // first click of current wall chain (for auto-close)
  arrowDrawing: { start: Point } | null;
  roomName: string;
  units: UnitSystem;
  // Room name overrides keyed by room vertex signature
  roomNames: Record<string, string>;
  // Toggle for component labels visibility
  componentLabelsVisible: boolean;
}

export interface FurnitureTemplate {
  type: string;
  label: string;
  width: number;
  height: number;
  category: string;
  icon: string;
  isWallCupboard?: boolean;
  defaultHeightFromFloor?: number; // in cm
}

export const WALL_CUPBOARD_TYPES = ["wall_cupboard_single", "wall_cupboard_double", "wall_cupboard_corner"];

export function isWallCupboard(type: string): boolean {
  return WALL_CUPBOARD_TYPES.includes(type);
}

export const FURNITURE_LIBRARY: FurnitureTemplate[] = [
  // Living Room
  { type: "sofa_3", label: "3-Seat Sofa", width: 220, height: 90, category: "Living", icon: "sofa" },
  { type: "sofa_2", label: "2-Seat Sofa", width: 160, height: 85, category: "Living", icon: "sofa" },
  { type: "armchair", label: "Armchair", width: 85, height: 85, category: "Living", icon: "armchair" },
  { type: "coffee_table", label: "Coffee Table", width: 120, height: 60, category: "Living", icon: "square" },
  { type: "tv_unit", label: "TV Unit", width: 160, height: 45, category: "Living", icon: "tv" },
  { type: "bookshelf", label: "Bookshelf", width: 120, height: 35, category: "Living", icon: "book-open" },
  // Kitchen
  { type: "counter", label: "Counter", width: 60, height: 60, category: "Kitchen", icon: "chef-hat" },
  { type: "sink_k", label: "Kitchen Sink", width: 60, height: 60, category: "Kitchen", icon: "droplets" },
  { type: "cooker", label: "Cooker/Hob", width: 60, height: 60, category: "Kitchen", icon: "flame" },
  { type: "fridge", label: "Fridge", width: 60, height: 65, category: "Kitchen", icon: "refrigerator" },
  { type: "dishwasher", label: "Dishwasher", width: 60, height: 60, category: "Kitchen", icon: "waves" },
  { type: "island", label: "Kitchen Island", width: 180, height: 90, category: "Kitchen", icon: "layout-grid" },
  { type: "wall_cupboard_single", label: "Wall Cupboard (single)", width: 60, height: 35, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "wall_cupboard_double", label: "Wall Cupboard (double)", width: 100, height: 35, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "wall_cupboard_corner", label: "Corner Wall Cupboard", width: 90, height: 90, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  // Bedroom
  { type: "bed_double", label: "Double Bed", width: 140, height: 200, category: "Bedroom", icon: "bed-double" },
  { type: "bed_single", label: "Single Bed", width: 90, height: 200, category: "Bedroom", icon: "bed-single" },
  { type: "bed_king", label: "King Bed", width: 160, height: 200, category: "Bedroom", icon: "bed-double" },
  { type: "wardrobe", label: "Wardrobe", width: 120, height: 60, category: "Bedroom", icon: "shirt" },
  { type: "nightstand", label: "Nightstand", width: 50, height: 40, category: "Bedroom", icon: "lamp" },
  { type: "desk", label: "Desk", width: 120, height: 60, category: "Bedroom", icon: "monitor" },
  // Bathroom
  { type: "bathtub", label: "Bathtub", width: 170, height: 75, category: "Bathroom", icon: "bath" },
  { type: "shower", label: "Shower Encl.", width: 90, height: 90, category: "Bathroom", icon: "shower-head" },
  { type: "toilet", label: "Toilet", width: 40, height: 65, category: "Bathroom", icon: "circle" },
  { type: "basin", label: "Basin", width: 55, height: 45, category: "Bathroom", icon: "droplets" },
  // Dining
  { type: "dining_table_4", label: "Dining Table (4)", width: 120, height: 80, category: "Dining", icon: "utensils" },
  { type: "dining_table_6", label: "Dining Table (6)", width: 180, height: 90, category: "Dining", icon: "utensils" },
  { type: "dining_chair", label: "Dining Chair", width: 45, height: 45, category: "Dining", icon: "armchair" },
  // Structure
  { type: "door", label: "Door", width: 90, height: 15, category: "Structure", icon: "door-open" },
  { type: "window", label: "Window", width: 100, height: 15, category: "Structure", icon: "square" },
  // Annotation
  { type: "arrow", label: "Arrow", width: 150, height: 0, category: "Annotation", icon: "arrow-right" },
];
