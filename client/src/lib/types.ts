export interface Point {
  x: number;
  y: number;
}

export type WallType = "exterior" | "interior";

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number; // in cm
  wallType?: WallType; // defaults to "exterior" (30cm) when creating new walls
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
  numberOfSteps?: number; // for stair types
  spiralDirection?: "cw" | "ccw"; // for spiral stairs
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
  padding: number; // px 4–40
  shadowEnabled: boolean;
  shadowBlur: number; // px
  shadowOffsetX: number; // px
  shadowOffsetY: number; // px
  // Text defaults
  fontSize: number; // px
  fontFamily: string;
  zIndex: number;
}

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
  padding: 12,
  shadowEnabled: false,
  shadowBlur: 8,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  fontSize: 14,
  fontFamily: "sans-serif",
  zIndex: 0,
};

export type EditorTool = "select" | "wall" | "furniture" | "label" | "eraser" | "pan";

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
  textBoxes: TextBox[];
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
  /** Grouping key for variant picker — items with the same variantGroup are shown together */
  variantGroup?: string;
  defaultNumberOfSteps?: number;
  defaultSpiralDirection?: "cw" | "ccw";
}

export const WALL_CUPBOARD_TYPES = ["wall_cupboard_single", "wall_cupboard_double", "wall_cupboard_corner"];

export function isWallCupboard(type: string): boolean {
  return WALL_CUPBOARD_TYPES.includes(type);
}

/** Get the variant group for a furniture type */
export function getVariantGroup(type: string): string | undefined {
  const template = FURNITURE_LIBRARY.find(t => t.type === type);
  return template?.variantGroup;
}

/** Get all variants in the same group as the given type */
export function getVariantsForType(type: string): FurnitureTemplate[] {
  const group = getVariantGroup(type);
  if (!group) return [];
  return FURNITURE_LIBRARY.filter(t => t.variantGroup === group);
}

export const FURNITURE_LIBRARY: FurnitureTemplate[] = [
  // ─── SINKS (Kitchen) ───────────────────────────────────────────
  { type: "sink_single", label: "Single Bowl", width: 60, height: 50, category: "Kitchen", icon: "droplets", variantGroup: "sink" },
  { type: "sink_single_right", label: "Single + Right Drainer", width: 100, height: 50, category: "Kitchen", icon: "droplets", variantGroup: "sink" },
  { type: "sink_single_left", label: "Single + Left Drainer", width: 100, height: 50, category: "Kitchen", icon: "droplets", variantGroup: "sink" },
  { type: "sink_double", label: "Double Bowl", width: 90, height: 50, category: "Kitchen", icon: "droplets", variantGroup: "sink" },
  { type: "sink_belfast", label: "Belfast Sink", width: 60, height: 46, category: "Kitchen", icon: "droplets", variantGroup: "sink" },
  { type: "sink_round", label: "Round Vessel Sink", width: 45, height: 45, category: "Kitchen", icon: "droplets", variantGroup: "sink" },

  // ─── HOBS / COOKTOPS ──────────────────────────────────────────
  { type: "hob_4_gas", label: "4-Burner Gas", width: 60, height: 52, category: "Kitchen", icon: "flame", variantGroup: "hob" },
  { type: "hob_5_gas", label: "5-Burner Gas", width: 70, height: 52, category: "Kitchen", icon: "flame", variantGroup: "hob" },
  { type: "hob_4_induction", label: "4-Zone Induction", width: 60, height: 52, category: "Kitchen", icon: "flame", variantGroup: "hob" },
  { type: "hob_2_compact", label: "2-Burner Compact", width: 30, height: 52, category: "Kitchen", icon: "flame", variantGroup: "hob" },
  { type: "hob_6_range", label: "Range 6-Burner", width: 90, height: 60, category: "Kitchen", icon: "flame", variantGroup: "hob" },

  // ─── KITCHEN UNITS ─────────────────────────────────────────────
  { type: "counter", label: "Counter", width: 60, height: 60, category: "Kitchen", icon: "chef-hat", variantGroup: "kitchen_unit" },
  { type: "base_unit", label: "Base Unit", width: 60, height: 60, category: "Kitchen", icon: "chef-hat", variantGroup: "kitchen_unit" },
  { type: "wall_unit", label: "Wall Unit", width: 60, height: 35, category: "Kitchen", icon: "chef-hat", variantGroup: "kitchen_unit", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "corner_base_unit", label: "Corner Base Unit", width: 90, height: 90, category: "Kitchen", icon: "chef-hat", variantGroup: "kitchen_unit" },
  { type: "island", label: "Kitchen Island", width: 180, height: 90, category: "Kitchen", icon: "layout-grid", variantGroup: "kitchen_unit" },

  // ─── OTHER KITCHEN ─────────────────────────────────────────────
  { type: "fridge", label: "Fridge", width: 60, height: 65, category: "Kitchen", icon: "refrigerator" },
  { type: "dishwasher", label: "Dishwasher", width: 60, height: 60, category: "Kitchen", icon: "waves" },
  { type: "wall_cupboard_single", label: "Wall Cupboard (single)", width: 60, height: 35, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "wall_cupboard_double", label: "Wall Cupboard (double)", width: 100, height: 35, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },
  { type: "wall_cupboard_corner", label: "Corner Wall Cupboard", width: 90, height: 90, category: "Kitchen", icon: "square", isWallCupboard: true, defaultHeightFromFloor: 145 },

  // ─── TOILETS ───────────────────────────────────────────────────
  { type: "toilet_close", label: "Close-Coupled Toilet", width: 38, height: 66, category: "Bathroom", icon: "circle", variantGroup: "toilet" },
  { type: "toilet_wall_hung", label: "Wall-Hung Toilet", width: 36, height: 52, category: "Bathroom", icon: "circle", variantGroup: "toilet" },
  { type: "toilet_btw", label: "Back-to-Wall Toilet", width: 36, height: 58, category: "Bathroom", icon: "circle", variantGroup: "toilet" },
  { type: "toilet_corner", label: "Corner Toilet", width: 50, height: 65, category: "Bathroom", icon: "circle", variantGroup: "toilet" },

  // ─── BATHS ─────────────────────────────────────────────────────
  { type: "bath_standard", label: "Standard Bath", width: 170, height: 75, category: "Bathroom", icon: "bath", variantGroup: "bath" },
  { type: "bath_p_left", label: "P-Shape Bath (Left)", width: 170, height: 85, category: "Bathroom", icon: "bath", variantGroup: "bath" },
  { type: "bath_p_right", label: "P-Shape Bath (Right)", width: 170, height: 85, category: "Bathroom", icon: "bath", variantGroup: "bath" },
  { type: "bath_freestanding", label: "Freestanding Slipper", width: 170, height: 75, category: "Bathroom", icon: "bath", variantGroup: "bath" },
  { type: "bath_corner", label: "Corner Bath", width: 150, height: 150, category: "Bathroom", icon: "bath", variantGroup: "bath" },

  // ─── SHOWERS ───────────────────────────────────────────────────
  { type: "shower_square", label: "Square Enclosure", width: 90, height: 90, category: "Bathroom", icon: "shower-head", variantGroup: "shower" },
  { type: "shower_rect", label: "Rectangular Enclosure", width: 120, height: 80, category: "Bathroom", icon: "shower-head", variantGroup: "shower" },
  { type: "shower_quadrant", label: "Quadrant Enclosure", width: 90, height: 90, category: "Bathroom", icon: "shower-head", variantGroup: "shower" },
  { type: "shower_walkin", label: "Walk-In Wet Room", width: 140, height: 90, category: "Bathroom", icon: "shower-head", variantGroup: "shower" },

  // ─── BASINS ────────────────────────────────────────────────────
  { type: "basin", label: "Basin", width: 55, height: 45, category: "Bathroom", icon: "droplets", variantGroup: "basin" },
  { type: "basin_pedestal", label: "Pedestal Basin", width: 55, height: 45, category: "Bathroom", icon: "droplets", variantGroup: "basin" },

  // ─── BEDS ──────────────────────────────────────────────────────
  { type: "bed_single", label: "Single Bed", width: 90, height: 200, category: "Bedroom", icon: "bed-single", variantGroup: "bed" },
  { type: "bed_double", label: "Double Bed", width: 140, height: 200, category: "Bedroom", icon: "bed-double", variantGroup: "bed" },
  { type: "bed_king", label: "King Bed", width: 160, height: 200, category: "Bedroom", icon: "bed-double", variantGroup: "bed" },
  { type: "bed_superking", label: "Super King Bed", width: 180, height: 200, category: "Bedroom", icon: "bed-double", variantGroup: "bed" },
  { type: "bed_bunk", label: "Bunk Bed", width: 90, height: 200, category: "Bedroom", icon: "bed-double", variantGroup: "bed" },

  // ─── STORAGE / WARDROBES ───────────────────────────────────────
  { type: "wardrobe_single", label: "Single Wardrobe", width: 60, height: 60, category: "Bedroom", icon: "shirt", variantGroup: "wardrobe" },
  { type: "wardrobe_double", label: "Double Wardrobe", width: 120, height: 60, category: "Bedroom", icon: "shirt", variantGroup: "wardrobe" },
  { type: "wardrobe_sliding", label: "Sliding Wardrobe", width: 180, height: 65, category: "Bedroom", icon: "shirt", variantGroup: "wardrobe" },
  { type: "wardrobe_walkin", label: "Walk-In Wardrobe", width: 200, height: 150, category: "Bedroom", icon: "shirt", variantGroup: "wardrobe" },
  { type: "chest_of_drawers", label: "Chest of Drawers", width: 80, height: 45, category: "Bedroom", icon: "shirt", variantGroup: "wardrobe" },
  { type: "nightstand", label: "Nightstand", width: 50, height: 40, category: "Bedroom", icon: "lamp" },
  { type: "desk", label: "Desk", width: 120, height: 60, category: "Bedroom", icon: "monitor" },

  // ─── SOFAS ─────────────────────────────────────────────────────
  { type: "sofa_2", label: "2-Seater Sofa", width: 160, height: 85, category: "Living", icon: "sofa", variantGroup: "sofa" },
  { type: "sofa_3", label: "3-Seater Sofa", width: 220, height: 90, category: "Living", icon: "sofa", variantGroup: "sofa" },
  { type: "sofa_l_left", label: "L-Shape (Left Chaise)", width: 260, height: 160, category: "Living", icon: "sofa", variantGroup: "sofa" },
  { type: "sofa_l_right", label: "L-Shape (Right Chaise)", width: 260, height: 160, category: "Living", icon: "sofa", variantGroup: "sofa" },
  { type: "sofa_corner", label: "Corner Sofa", width: 250, height: 250, category: "Living", icon: "sofa", variantGroup: "sofa" },
  { type: "armchair", label: "Armchair", width: 85, height: 85, category: "Living", icon: "armchair", variantGroup: "sofa" },

  // ─── OTHER LIVING ──────────────────────────────────────────────
  { type: "coffee_table", label: "Coffee Table", width: 120, height: 60, category: "Living", icon: "square" },
  { type: "tv_unit", label: "TV Unit", width: 160, height: 45, category: "Living", icon: "tv" },
  { type: "bookshelf", label: "Bookshelf", width: 120, height: 35, category: "Living", icon: "book-open" },

  // ─── TABLES (Dining) ──────────────────────────────────────────
  { type: "table_rect_2", label: "Rect. Table (2)", width: 80, height: 60, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "table_rect_4", label: "Rect. Table (4)", width: 120, height: 80, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "table_rect_6", label: "Rect. Table (6)", width: 180, height: 90, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "table_round_2", label: "Round Table (2)", width: 70, height: 70, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "table_round_4", label: "Round Table (4)", width: 100, height: 100, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "table_round_6", label: "Round Table (6)", width: 130, height: 130, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "table_oval", label: "Oval Table", width: 160, height: 90, category: "Dining", icon: "utensils", variantGroup: "table" },
  { type: "dining_chair", label: "Dining Chair", width: 45, height: 45, category: "Dining", icon: "armchair" },

  // ─── DOORS ─────────────────────────────────────────────────────
  { type: "door_single_left", label: "Door (Left Swing)", width: 90, height: 15, category: "Structure", icon: "door-open", variantGroup: "door" },
  { type: "door_single_right", label: "Door (Right Swing)", width: 90, height: 15, category: "Structure", icon: "door-open", variantGroup: "door" },
  { type: "door_double", label: "Double Doors", width: 160, height: 15, category: "Structure", icon: "door-open", variantGroup: "door" },
  { type: "door_sliding", label: "Sliding Door", width: 90, height: 15, category: "Structure", icon: "door-open", variantGroup: "door" },
  { type: "door_bifold", label: "Bifold Door", width: 90, height: 15, category: "Structure", icon: "door-open", variantGroup: "door" },
  { type: "door_pocket", label: "Pocket Door", width: 90, height: 15, category: "Structure", icon: "door-open", variantGroup: "door" },

  // ─── WINDOWS ───────────────────────────────────────────────────
  { type: "window", label: "Window", width: 100, height: 15, category: "Structure", icon: "square" },
  { type: "bay_window", label: "Bay Window", width: 180, height: 60, category: "Structure", icon: "square" },

  // ─── STAIRS ────────────────────────────────────────────────────
  { type: "stair_straight", label: "Straight Staircase", width: 90, height: 300, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 13 },
  { type: "stair_l_left", label: "L-Shaped (Left Turn)", width: 180, height: 270, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 13 },
  { type: "stair_l_right", label: "L-Shaped (Right Turn)", width: 180, height: 270, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 13 },
  { type: "stair_u", label: "U-Shaped (Half-Turn)", width: 180, height: 270, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 13 },
  { type: "stair_spiral_cw", label: "Spiral (Clockwise)", width: 160, height: 160, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 12, defaultSpiralDirection: "cw" },
  { type: "stair_spiral_ccw", label: "Spiral (Anti-CW)", width: 160, height: 160, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 12, defaultSpiralDirection: "ccw" },
  { type: "stair_winder", label: "Winder Stairs", width: 90, height: 260, category: "Structure", icon: "arrow-up", variantGroup: "stair", defaultNumberOfSteps: 13 },

  // ─── OTHER STRUCTURE ────────────────────────────────────────────
  { type: "radiator", label: "Radiator", width: 100, height: 15, category: "Structure", icon: "thermometer" },
  { type: "boiler", label: "Boiler", width: 60, height: 60, category: "Kitchen", icon: "flame" },
];

/** Check if a type is a stair type */
export function isStairType(type: string): boolean {
  return type.startsWith("stair_");
}

/** Check if a type is a door type */
export function isDoorType(type: string): boolean {
  return type.startsWith("door_");
}

// Legacy compat: map old types to new types for saved plans
export const LEGACY_TYPE_MAP: Record<string, string> = {
  "door": "door_single_left",
  "sink_k": "sink_single_right",
  "cooker": "hob_4_gas",
  "bathtub": "bath_standard",
  "shower": "shower_square",
  "toilet": "toilet_close",
  "sofa_3": "sofa_3",
  "sofa_2": "sofa_2",
  "bed_double": "bed_double",
  "bed_single": "bed_single",
  "bed_king": "bed_king",
  "wardrobe": "wardrobe_double",
  "dining_table_4": "table_rect_4",
  "dining_table_6": "table_rect_6",
  "stairs": "stair_straight",
};
