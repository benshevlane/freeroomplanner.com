import { useState, useCallback, useRef, useEffect } from "react";
import { EditorState, Wall, FurnitureItem, RoomLabel, TextBox, Arrow, Point, EditorTool, FurnitureTemplate, UnitSystem, DEFAULT_TEXT_BOX, DEFAULT_ARROW, FURNITURE_LIBRARY } from "../lib/types";

const AUTOSAVE_KEY = "freeroomplanner-autosave";

function loadSavedState(): Partial<EditorState> | null {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.walls)) {
      return parsed;
    }
  } catch {
    // Ignore corrupted data
  }
  return null;
}

function saveStateToStorage(state: EditorState): void {
  try {
    const data = {
      version: 1,
      roomName: state.roomName,
      walls: state.walls,
      furniture: state.furniture,
      labels: state.labels,
      textBoxes: state.textBoxes,
      arrows: state.arrows,
      roomNames: state.roomNames,
      componentLabelsVisible: state.componentLabelsVisible,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Deep copy editor state so undo/redo stacks don't share object references */
function deepCopyState(s: EditorState): EditorState {
  return {
    ...s,
    walls: s.walls.map(w => ({ ...w, start: { ...w.start }, end: { ...w.end } })),
    furniture: s.furniture.map(f => ({ ...f, labelOffset: f.labelOffset ? { ...f.labelOffset } : undefined })),
    labels: s.labels.map(l => ({ ...l })),
    textBoxes: s.textBoxes.map(t => ({ ...t })),
    arrows: s.arrows.map(a => ({ ...a })),
    roomNames: { ...s.roomNames },
    panOffset: { ...s.panOffset },
  };
}

/** Component types whose labels should render inside the component rectangle */
const LABEL_INSIDE_TYPES = new Set([
  "worktop", "island", "fridge", "dishwasher",
  "tumble_dryer", "washing_machine", "kitchen_sink_d",
  "bed_king", "bed_superking",
  "sofa_3", "sofa_2", "sofa_l",
  "dining_table_4", "dining_table_6",
]);

const DEFAULT_STATE: EditorState = {
  walls: [],
  furniture: [],
  labels: [],
  textBoxes: [],
  arrows: [],
  gridSize: 80, // 80px = 1m at default zoom
  zoom: 1,
  panOffset: { x: 200, y: 100 },
  selectedTool: "wall",
  selectedItemId: null,
  wallDrawing: null,
  wallChainStart: null,
  roomName: "My Room",
  units: "m" as UnitSystem,
  roomNames: {},
  componentLabelsVisible: true,
};

function getInitialState(): EditorState {
  const saved = loadSavedState();
  if (!saved) return DEFAULT_STATE;
  return {
    ...DEFAULT_STATE,
    roomName: saved.roomName ?? DEFAULT_STATE.roomName,
    walls: saved.walls ?? [],
    furniture: (saved.furniture ?? []).map((f: any) => ({
      ...f,
      labelOffset: f.labelOffset ?? { x: 0, y: 0 },
      labelInside: f.labelInside ?? LABEL_INSIDE_TYPES.has(f.type),
    })),
    labels: saved.labels ?? [],
    textBoxes: saved.textBoxes ?? [],
    arrows: saved.arrows ?? [],
    roomNames: saved.roomNames ?? {},
    componentLabelsVisible: saved.componentLabelsVisible ?? true,
  };
}

export function useEditor() {
  const [state, setState] = useState<EditorState>(getInitialState);
  const undoStack = useRef<EditorState[]>([]);
  const redoStack = useRef<EditorState[]>([]);

  const pushUndo = useCallback(() => {
    setState((s) => {
      undoStack.current.push(deepCopyState(s));
      redoStack.current = [];
      if (undoStack.current.length > 50) undoStack.current.shift();
      return s;
    });
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    setState((s) => {
      redoStack.current.push(deepCopyState(s));
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    setState((s) => {
      undoStack.current.push(deepCopyState(s));
      return next;
    });
  }, []);

  // Auto-save plan data to localStorage whenever it changes
  useEffect(() => {
    saveStateToStorage(state);
  }, [state.walls, state.furniture, state.labels, state.textBoxes, state.arrows, state.roomName, state.roomNames, state.componentLabelsVisible]);

  const setTool = useCallback((tool: EditorTool) => {
    setState((s) => ({ ...s, selectedTool: tool, selectedItemId: null, wallDrawing: null, wallChainStart: null }));
  }, []);

  const setSelectedItem = useCallback((id: string | null) => {
    setState((s) => ({ ...s, selectedItemId: id }));
  }, []);

  const addWall = useCallback((start: Point, end: Point) => {
    pushUndo();
    const wall: Wall = {
      id: generateId(),
      start,
      end,
      thickness: 15,
    };
    setState((s) => ({ ...s, walls: [...s.walls, wall] }));
  }, [pushUndo]);

  const removeWall = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({ ...s, walls: s.walls.filter((w) => w.id !== id), selectedItemId: null }));
  }, [pushUndo]);

  const updateWall = useCallback((id: string, updates: Partial<Wall>) => {
    pushUndo();
    setState((s) => ({
      ...s,
      walls: s.walls.map((w) => w.id === id ? { ...w, ...updates } : w),
    }));
  }, [pushUndo]);

  const addFurniture = useCallback((template: FurnitureTemplate, position: Point) => {
    pushUndo();
    const item: FurnitureItem = {
      id: generateId(),
      type: template.type,
      label: template.label,
      x: position.x - template.width / 2,
      y: position.y - template.height / 2,
      width: template.width,
      height: template.height,
      rotation: 0,
      category: template.category,
      ...(template.isWallCupboard ? { heightFromFloor: template.defaultHeightFromFloor ?? 145 } : {}),
      labelOffset: { x: 0, y: 0 },
      labelInside: LABEL_INSIDE_TYPES.has(template.type),
    };
    setState((s) => ({ ...s, furniture: [...s.furniture, item], selectedItemId: item.id }));
  }, [pushUndo]);

  const moveFurniture = useCallback((id: string, x: number, y: number) => {
    setState((s) => ({
      ...s,
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, x, y } : f
      ),
    }));
  }, []);

  const rotateFurniture = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      furniture: s.furniture.map((f) => {
        if (f.id !== id) return f;
        const template = FURNITURE_LIBRARY.find((t) => t.type === f.type);
        const snap = template?.rotationSnap ?? 90;
        const newRotation = (f.rotation + snap) % 360;
        // Only swap width/height for 90° increments
        const swapDims = snap === 90;
        return {
          ...f,
          rotation: newRotation,
          ...(swapDims ? { width: f.height, height: f.width } : {}),
        };
      }),
    }));
  }, [pushUndo]);

  const mirrorFurniture = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, mirrored: !f.mirrored } : f
      ),
    }));
  }, [pushUndo]);

  const removeFurniture = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      furniture: s.furniture.filter((f) => f.id !== id),
      selectedItemId: null,
    }));
  }, [pushUndo]);

  const addLabel = useCallback((text: string, position: Point) => {
    pushUndo();
    const label: RoomLabel = {
      id: generateId(),
      text,
      x: position.x,
      y: position.y,
      fontSize: 16,
    };
    setState((s) => ({ ...s, labels: [...s.labels, label] }));
  }, [pushUndo]);

  const moveLabel = useCallback((id: string, x: number, y: number) => {
    setState((s) => ({
      ...s,
      labels: s.labels.map((l) => (l.id === id ? { ...l, x, y } : l)),
    }));
  }, []);

  const removeLabel = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      labels: s.labels.filter((l) => l.id !== id),
      selectedItemId: null,
    }));
  }, [pushUndo]);

  const setZoom = useCallback((zoom: number) => {
    setState((s) => ({ ...s, zoom: Math.max(0.3, Math.min(3, zoom)) }));
  }, []);

  const setPan = useCallback((offset: Point) => {
    setState((s) => ({ ...s, panOffset: offset }));
  }, []);

  const setWallDrawing = useCallback((drawing: { start: Point } | null) => {
    setState((s) => ({
      ...s,
      wallDrawing: drawing,
      // Track the first point of the chain
      wallChainStart: drawing === null ? null : (s.wallChainStart ?? drawing.start),
    }));
  }, []);

  const setUnits = useCallback((units: UnitSystem) => {
    setState((s) => ({ ...s, units }));
  }, []);

  const setRoomName = useCallback((name: string) => {
    setState((s) => ({ ...s, roomName: name }));
  }, []);

  const clearAll = useCallback(() => {
    pushUndo();
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch {}
    setState((s) => ({
      ...s,
      walls: [],
      furniture: [],
      labels: [],
      textBoxes: [],
      arrows: [],
      roomNames: {},
      selectedItemId: null,
      wallDrawing: null,
    }));
  }, [pushUndo]);

  const splitWallAndConnect = useCallback((wallId: string, splitPoint: Point, newWallStart: Point) => {
    pushUndo();
    setState((s) => {
      const wall = s.walls.find(w => w.id === wallId);
      if (!wall) return s;
      const newWalls = s.walls.filter(w => w.id !== wallId);
      // Split the existing wall at the split point
      newWalls.push({ id: generateId(), start: wall.start, end: splitPoint, thickness: wall.thickness });
      newWalls.push({ id: generateId(), start: splitPoint, end: wall.end, thickness: wall.thickness });
      // Add the connecting wall from the drawing start to the split point
      newWalls.push({ id: generateId(), start: newWallStart, end: splitPoint, thickness: 15 });
      return { ...s, walls: newWalls };
    });
  }, [pushUndo]);

  const updateFurniture = useCallback((id: string, updates: Partial<FurnitureItem>) => {
    setState((s) => ({
      ...s,
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    }));
  }, []);

  const setLabelOffset = useCallback((id: string, offset: { x: number; y: number }) => {
    setState((s) => ({
      ...s,
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, labelOffset: offset } : f
      ),
    }));
  }, []);

  const updateLabel = useCallback((id: string, updates: Partial<RoomLabel>) => {
    setState((s) => ({
      ...s,
      labels: s.labels.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }));
  }, []);

  const addTextBox = useCallback((position: Point) => {
    pushUndo();
    const textBox: TextBox = {
      ...DEFAULT_TEXT_BOX,
      id: generateId(),
      x: position.x - DEFAULT_TEXT_BOX.width / 2,
      y: position.y - DEFAULT_TEXT_BOX.height / 2,
    };
    setState((s) => ({ ...s, textBoxes: [...s.textBoxes, textBox], selectedItemId: textBox.id, selectedTool: "select" }));
    return textBox.id;
  }, [pushUndo]);

  const moveTextBox = useCallback((id: string, x: number, y: number) => {
    setState((s) => ({
      ...s,
      textBoxes: s.textBoxes.map((t) => t.id === id ? { ...t, x, y } : t),
    }));
  }, []);

  const updateTextBox = useCallback((id: string, updates: Partial<TextBox>) => {
    setState((s) => ({
      ...s,
      textBoxes: s.textBoxes.map((t) => t.id === id ? { ...t, ...updates } : t),
    }));
  }, []);

  const removeTextBox = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      textBoxes: s.textBoxes.filter((t) => t.id !== id),
      selectedItemId: null,
    }));
  }, [pushUndo]);

  const addArrow = useCallback((start: Point, end: Point) => {
    pushUndo();
    const arrow: Arrow = {
      ...DEFAULT_ARROW,
      id: generateId(),
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    };
    setState((s) => ({ ...s, arrows: [...s.arrows, arrow], selectedItemId: arrow.id }));
    return arrow.id;
  }, [pushUndo]);

  const updateArrow = useCallback((id: string, updates: Partial<Arrow>) => {
    setState((s) => ({
      ...s,
      arrows: s.arrows.map((a) => a.id === id ? { ...a, ...updates } : a),
    }));
  }, []);

  const removeArrow = useCallback((id: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      arrows: s.arrows.filter((a) => a.id !== id),
      selectedItemId: null,
    }));
  }, [pushUndo]);

  const setRoomNameForRoom = useCallback((roomKey: string, name: string) => {
    pushUndo();
    setState((s) => ({
      ...s,
      roomNames: { ...s.roomNames, [roomKey]: name },
    }));
  }, [pushUndo]);

  const toggleComponentLabels = useCallback(() => {
    setState((s) => ({ ...s, componentLabelsVisible: !s.componentLabelsVisible }));
  }, []);

  const exportState = useCallback(() => {
    return {
      version: 1,
      roomName: state.roomName,
      walls: state.walls,
      furniture: state.furniture,
      labels: state.labels,
      textBoxes: state.textBoxes,
      arrows: state.arrows,
      roomNames: state.roomNames,
      componentLabelsVisible: state.componentLabelsVisible,
    };
  }, [state.roomName, state.walls, state.furniture, state.labels, state.textBoxes, state.arrows, state.roomNames, state.componentLabelsVisible]);

  const importState = useCallback((plan: { version: number; roomName: string; walls: Wall[]; furniture: FurnitureItem[]; labels: RoomLabel[]; textBoxes?: TextBox[]; arrows?: Arrow[]; roomNames?: Record<string, string>; componentLabelsVisible?: boolean }) => {
    pushUndo();
    setState((s) => ({
      ...s,
      roomName: plan.roomName,
      walls: plan.walls,
      furniture: plan.furniture.map((f) => ({
        ...f,
        labelOffset: f.labelOffset ?? { x: 0, y: 0 },
        labelInside: f.labelInside ?? LABEL_INSIDE_TYPES.has(f.type),
      })),
      labels: plan.labels,
      textBoxes: plan.textBoxes || [],
      arrows: plan.arrows || [],
      roomNames: plan.roomNames || {},
      componentLabelsVisible: plan.componentLabelsVisible ?? true,
      selectedItemId: null,
      wallDrawing: null,
    }));
  }, [pushUndo]);

  return {
    state,
    setTool,
    setSelectedItem,
    addWall,
    removeWall,
    updateWall,
    addFurniture,
    moveFurniture,
    rotateFurniture,
    mirrorFurniture,
    removeFurniture,
    addLabel,
    moveLabel,
    removeLabel,
    setZoom,
    setPan,
    setWallDrawing,
    setRoomName,
    clearAll,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    pushUndo,
    updateFurniture,
    setLabelOffset,
    updateLabel,
    addTextBox,
    moveTextBox,
    updateTextBox,
    removeTextBox,
    addArrow,
    updateArrow,
    removeArrow,
    setUnits,
    exportState,
    importState,
    splitWallAndConnect,
    setRoomNameForRoom,
    toggleComponentLabels,
  };
}
