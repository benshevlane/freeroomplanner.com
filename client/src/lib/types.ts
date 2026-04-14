export interface Point {
  x: number;
  y: number;
}

export type WallType = "exterior" | "interior";

export const DEFAULT_WALL_THICKNESS = 5; // cm (50mm)

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number; // in cm
  wallType?: WallType; // defaults to "exterior" (30cm) when creating new walls
  measurementLabelOffset?: number;    // legacy: cm along wall axis from midpoint
  measurementLabelPinned?: boolean;   // true = user manually dragged
  measurementLabelPosition?: { x: number; y: number }; // absolute world-space position (cm) — overrides offset when set
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
  mirrored?: boolean; // horizontally flipped (for mirrorable items like L-Shape Sofa)
  labelOffset?: { x: number; y: number }; // offset in cm from default label position
  labelInside?: boolean; // true = render label inside rect, false = below
  labelRotation?: number; // degrees, independent rotation for the component label
  labelWidth?: number;    // cm override for auto-computed label pill width
  labelHeight?: number;   // cm override for auto-computed label pill height
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

export interface TextBox {
  id: string;
  x: number; // world cm
  y: number; // world cm
  width: number; // world cm
  height: number; // world cm
  rotation: number; // degrees
  content: string; // HTML string
  customName?: string; // editable name for layers panel
  // Box styling
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number; // px
  borderStyle: "solid" | "dashed" | "dotted";
  cornerRadius: number; // px 0–40
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
  padding: number; // px 0–20
  shadowEnabled: boolean;
  shadowBlur: number; // px
  shadowOffsetX: number; // px
  shadowOffsetY: number; // px
  // Text defaults
  fontSize: number; // px
  fontFamily: string;
  zIndex: number;
}

export type ArrowStyle = "solid" | "dashed";
export type ArrowHeadStyle = "filled" | "open" | "none";

export interface Arrow {
  id: string;
  startX: number;  // world cm
  startY: number;  // world cm
  endX: number;    // world cm
  endY: number;    // world cm
  strokeColor: string;
  strokeWidth: number;    // px (1–8)
  strokeStyle: ArrowStyle;
  headStyle: ArrowHeadStyle;  // arrowhead at end
  tailStyle: ArrowHeadStyle;  // arrowhead at start
  label: string;              // optional text label along the arrow
}

export const DEFAULT_ARROW: Omit<Arrow, "id" | "startX" | "startY" | "endX" | "endY"> = {
  strokeColor: "#3a3938",
  strokeWidth: 2,
  strokeStyle: "solid",
  headStyle: "filled",
  tailStyle: "none",
  label: "",
};

export const DEFAULT_TEXT_BOX: Omit<TextBox, "id" | "x" | "y"> = {
  width: 200,
  height: 100,
  rotation: 0,
  content: "",
  borderEnabled: false,
  borderColor: "#000000",
  borderWidth: 1,
  borderStyle: "solid",
  cornerRadius: 0,
  backgroundColor: "#ffffff",
  backgroundOpacity: 1,
  padding: 2,
  shadowEnabled: false,
  shadowBlur: 8,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  fontSize: 14,
  fontFamily: "sans-serif",
  zIndex: 0,
};

export type EditorTool = "select" | "wall" | "arrow" | "furniture" | "label" | "eraser";

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

/** Data for a single room tab */
export interface RoomData {
  id: string;
  name: string;
  walls: Wall[];
  furniture: FurnitureItem[];
  labels: RoomLabel[];
  textBoxes: TextBox[];
  arrows: Arrow[];
  roomNames: Record<string, string>;
  roomLabelOffsets: Record<string, Point>;
  componentLabelsVisible: boolean;
}

export interface EditorState {
  walls: Wall[];
  furniture: FurnitureItem[];
  labels: RoomLabel[];
  textBoxes: TextBox[];
  arrows: Arrow[];
  gridSize: number; // px per meter
  zoom: number;
  panOffset: Point;
  selectedTool: EditorTool;
  selectedItemId: string | null;
  wallDrawing: { start: Point } | null;
  wallChainStart: Point | null; // first click of current wall chain (for auto-close)
  roomName: string;
  units: UnitSystem;
  // Room name overrides keyed by room vertex signature
  roomNames: Record<string, string>;
  // Room label position offsets keyed by room vertex signature (delta from auto-computed position)
  roomLabelOffsets: Record<string, Point>;
  // Toggle for component labels visibility
  componentLabelsVisible: boolean;
  // Multi-room tabs
  rooms: RoomData[];
  activeRoomId: string;
  roomOrder: string[];
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
  mirrorable?: boolean; // can be horizontally flipped (e.g. L-Shape Sofa)
  rotationSnap?: number; // rotation increment in degrees (default 90)
}

export const WALL_CUPBOARD_TYPES = ["wall_cupboard_single", "wall_cupboard_double", "wall_cupboard_corner"];

export function isWallCupboard(type: string): boolean {
  return WALL_CUPBOARD_TYPES.includes(type);
}

export const FURNITURE_LIBRARY: FurnitureTemplate[] = [
  // Kitchen (ordered: Worktop → Sink(s) → Sink(d) → Cooker/Hob → Range Cooker → Fridge → Dishwasher → Oven → Island → Extractor Hood → Washing Machine → Tumble Dryer → Wall Cupboards → Boiler)
  { type: "worktop", label: "Worktop", width: 200, height: 60, category: "Kitchen", icon: "chef-hat" },
  { type: "kitchen_sink_s", label: "Kitchen Sink (single)", width: 60, height: 60, category: "Kitchen", icon: "droplets" },
  { type: "kitchen_sink_d", label: "Kitchen Sink (double)", width: 120, height: 60, category: "Kitchen", icon: "droplets" },
  { type: "cooker", label: "Cooker/Hob", width: 60, height: 60, category: "Kitchen", icon: "flame" },
  { type: "range_cooker", label: "Range Cooker", width: 100, height: 60, category: "Kitchen", icon: "flame" },
  { type: "fridge", label: "Fridge", width: 60, height: 65, category: "Kitchen", icon: "refrigerator" },
  { type: "dishwasher", label: "Dishwasher", width: 60, height: 60, category: "Kitchen", icon: "waves" },
  { type: "oven_builtin", label: "Oven (built-in)", width: 60, height: 60, category: "Kitchen", icon: "flame" },
  { type: "island", label: "Kitchen Island", width: 180, height: 90, category: "Kitchen", icon: "layout-grid" },
  { type: "extractor_hood", label: "Extractor Hood", width: 60, height: 50, category: "Kitchen", icon: "chef-hat" },
  { type: "washing_machine", label: "Washing Machine", width: 60, height: 60, category: "Kitchen", icon: "waves" },
  { type: "tumble_dryer", label: "Tumble Dryer", width: 60, height: 60, category: "Kitchen", icon: "waves" },
  { type: "wall_cupboard_single", label: "Wall Cupboard (single)", width: 60, height: 35, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "wall_cupboard_double", label: "Wall Cupboard (double)", width: 100, height: 35, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "wall_cupboard_corner", label: "Corner Wall Cupboard", width: 90, height: 90, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "boiler", label: "Boiler", width: 60, height: 60, category: "Kitchen", icon: "flame" },
  // Living (ordered: 3-Seat Sofa → 2-Seat Sofa → L-Shape Sofa → Armchair → Coffee Table → Side Table → TV Unit → Bookshelf → Fireplace)
  { type: "sofa_3", label: "3-Seat Sofa", width: 220, height: 90, category: "Living", icon: "sofa" },
  { type: "sofa_2", label: "2-Seat Sofa", width: 160, height: 85, category: "Living", icon: "sofa" },
  { type: "sofa_l", label: "L-Shape Sofa", width: 260, height: 170, category: "Living", icon: "sofa", mirrorable: true },
  { type: "armchair", label: "Armchair", width: 85, height: 85, category: "Living", icon: "armchair" },
  { type: "coffee_table", label: "Coffee Table", width: 120, height: 60, category: "Living", icon: "square" },
  { type: "side_table", label: "Side Table", width: 50, height: 50, category: "Living", icon: "square" },
  { type: "tv_unit", label: "TV Unit", width: 160, height: 45, category: "Living", icon: "tv" },
  { type: "bookshelf", label: "Bookshelf", width: 120, height: 35, category: "Living", icon: "book-open" },
  { type: "fireplace", label: "Fireplace / Stove", width: 120, height: 40, category: "Living", icon: "flame" },
  // Bedroom (ordered: Super King Bed → King Bed → Double Bed → Single Bed → Wardrobe)
  { type: "bed_superking", label: "Super King Bed", width: 200, height: 200, category: "Bedroom", icon: "bed-double" },
  { type: "bed_king", label: "King Bed", width: 180, height: 200, category: "Bedroom", icon: "bed-double" },
  { type: "bed_double", label: "Double Bed", width: 140, height: 200, category: "Bedroom", icon: "bed-double" },
  { type: "bed_single", label: "Single Bed", width: 90, height: 200, category: "Bedroom", icon: "bed-single" },
  { type: "wardrobe", label: "Wardrobe", width: 120, height: 60, category: "Bedroom", icon: "shirt" },
  // Bathroom (ordered: Bath → Corner Bath → Freestanding Bath → P-Shape Bath → Toilet → WC Wall Hung → WC Back to Wall → Shower → Corner Shower → Walk-in Shower → Shower Screen → Basin/Pedestal → Basin Wall Hung → Vanity Single → Vanity Double → Bidet → Towel Rail → Storage Unit)
  { type: "bathtub", label: "Bathtub", width: 170, height: 75, category: "Bathroom", icon: "bath" },
  { type: "corner_bath", label: "Corner Bath", width: 120, height: 120, category: "Bathroom", icon: "bath" },
  { type: "freestanding_bath", label: "Freestanding Bath", width: 170, height: 80, category: "Bathroom", icon: "bath" },
  { type: "p_shape_bath", label: "P-Shape Bath", width: 170, height: 80, category: "Bathroom", icon: "bath" },
  { type: "toilet", label: "Toilet", width: 40, height: 65, category: "Bathroom", icon: "circle" },
  { type: "wc_wallhung", label: "Toilet (Wall Hung)", width: 36, height: 52, category: "Bathroom", icon: "circle" },
  { type: "wc_back_to_wall", label: "Toilet (Back to Wall)", width: 36, height: 56, category: "Bathroom", icon: "circle" },
  { type: "shower", label: "Shower Encl.", width: 90, height: 90, category: "Bathroom", icon: "shower-head" },
  { type: "corner_shower", label: "Corner Shower", width: 90, height: 90, category: "Bathroom", icon: "shower-head" },
  { type: "walkin_shower", label: "Walk-in Shower", width: 120, height: 90, category: "Bathroom", icon: "shower-head" },
  { type: "shower_screen", label: "Shower Screen", width: 80, height: 4, category: "Bathroom", icon: "shower-head" },
  { type: "shower_drain_round", label: "Shower Drain (Round)", width: 10, height: 10, category: "Bathroom", icon: "circle" },
  { type: "shower_drain_linear", label: "Shower Drain (Linear)", width: 80, height: 6, category: "Bathroom", icon: "grip-horizontal" },
  { type: "shower_head", label: "Shower Head", width: 20, height: 20, category: "Bathroom", icon: "shower-head" },
  { type: "shower_mixer", label: "Shower Mixer", width: 15, height: 10, category: "Bathroom", icon: "circle" },
  { type: "basin_pedestal", label: "Basin / Pedestal", width: 60, height: 45, category: "Bathroom", icon: "droplets" },
  { type: "basin_wallhung", label: "Basin (Wall Hung)", width: 60, height: 45, category: "Bathroom", icon: "droplets" },
  { type: "vanity_single", label: "Vanity Unit (Single)", width: 80, height: 48, category: "Bathroom", icon: "droplets" },
  { type: "vanity_double", label: "Vanity Unit (Double)", width: 120, height: 48, category: "Bathroom", icon: "droplets" },
  { type: "bidet", label: "Bidet", width: 40, height: 60, category: "Bathroom", icon: "droplets" },
  { type: "towel_rail", label: "Towel Rail", width: 60, height: 14, category: "Bathroom", icon: "grip-horizontal" },
  { type: "storage_unit", label: "Storage Unit", width: 90, height: 50, category: "Bathroom", icon: "square" },
  // Dining (ordered: Dining Table (4) → Dining Table (6) → Dining Chair)
  { type: "dining_table_4", label: "Dining Table (4)", width: 120, height: 80, category: "Dining", icon: "utensils" },
  { type: "dining_table_6", label: "Dining Table (6)", width: 180, height: 90, category: "Dining", icon: "utensils" },
  { type: "dining_chair", label: "Dining Chair", width: 45, height: 45, category: "Dining", icon: "armchair", rotationSnap: 45 },
  // Office (ordered: Desk → Office Chair)
  { type: "desk", label: "Desk", width: 140, height: 70, category: "Office", icon: "monitor" },
  { type: "office_chair", label: "Office Chair", width: 60, height: 60, category: "Office", icon: "armchair" },
  // Structure (ordered: Staircase → Radiator → Window → Door → Double Door)
  { type: "stairs", label: "Staircase", width: 90, height: 250, category: "Structure", icon: "arrow-up" },
  { type: "radiator", label: "Radiator", width: 120, height: 60, category: "Structure", icon: "thermometer" },
  { type: "window", label: "Window", width: 100, height: 15, category: "Structure", icon: "square" },
  { type: "door", label: "Door", width: 90, height: 15, category: "Structure", icon: "door-open", mirrorable: true },
  { type: "door_double", label: "Double Door", width: 150, height: 15, category: "Structure", icon: "door-open", mirrorable: true },
  { type: "bay_window", label: "Bay Window", width: 180, height: 60, category: "Structure", icon: "square" },
  { type: "internal_wall", label: "Internal Wall", width: 100, height: 10, category: "Structure", icon: "square" },
];
