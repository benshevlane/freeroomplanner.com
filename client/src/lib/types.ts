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
}

export interface RoomLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

export type EditorTool = "select" | "wall" | "furniture" | "label" | "eraser" | "pan";

export type UnitSystem = "metric" | "imperial";

export type MeasureMode = "full" | "inside";

export interface EditorState {
  walls: Wall[];
  furniture: FurnitureItem[];
  labels: RoomLabel[];
  gridSize: number; // px per meter
  zoom: number;
  panOffset: Point;
  selectedTool: EditorTool;
  selectedItemId: string | null;
  wallDrawing: { start: Point } | null;
  wallChainStart: Point | null; // first click of current wall chain (for auto-close)
  roomName: string;
  units: UnitSystem;
}

export interface FurnitureTemplate {
  type: string;
  label: string;
  width: number;
  height: number;
  category: string;
  icon: string;
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
];
