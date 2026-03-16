import { useState, useCallback, useRef } from "react";
import { EditorState, Wall, FurnitureItem, RoomLabel, Point, EditorTool, FurnitureTemplate, UnitSystem } from "../lib/types";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const INITIAL_STATE: EditorState = {
  walls: [],
  furniture: [],
  labels: [],
  gridSize: 80, // 80px = 1m at default zoom
  zoom: 1,
  panOffset: { x: 200, y: 100 },
  selectedTool: "wall",
  selectedItemId: null,
  wallDrawing: null,
  wallChainStart: null,
  roomName: "My Room",
  units: "metric" as UnitSystem,
};

export function useEditor() {
  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const undoStack = useRef<EditorState[]>([]);
  const redoStack = useRef<EditorState[]>([]);

  const pushUndo = useCallback(() => {
    undoStack.current.push({ ...state, walls: [...state.walls], furniture: [...state.furniture], labels: [...state.labels] });
    redoStack.current = [];
    if (undoStack.current.length > 50) undoStack.current.shift();
  }, [state]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push({ ...state, walls: [...state.walls], furniture: [...state.furniture], labels: [...state.labels] });
    setState(prev);
  }, [state]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push({ ...state, walls: [...state.walls], furniture: [...state.furniture], labels: [...state.labels] });
    setState(next);
  }, [state]);

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
      furniture: s.furniture.map((f) =>
        f.id === id
          ? { ...f, rotation: (f.rotation + 90) % 360, width: f.height, height: f.width }
          : f
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
    setState((s) => ({
      ...s,
      walls: [],
      furniture: [],
      labels: [],
      selectedItemId: null,
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

  const updateLabel = useCallback((id: string, updates: Partial<RoomLabel>) => {
    setState((s) => ({
      ...s,
      labels: s.labels.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }));
  }, []);

  const exportState = useCallback(() => {
    return {
      version: 1,
      roomName: state.roomName,
      walls: state.walls,
      furniture: state.furniture,
      labels: state.labels,
    };
  }, [state.roomName, state.walls, state.furniture, state.labels]);

  const importState = useCallback((plan: { version: number; roomName: string; walls: Wall[]; furniture: FurnitureItem[]; labels: RoomLabel[] }) => {
    pushUndo();
    setState((s) => ({
      ...s,
      roomName: plan.roomName,
      walls: plan.walls,
      furniture: plan.furniture,
      labels: plan.labels,
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
    addFurniture,
    moveFurniture,
    rotateFurniture,
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
    updateLabel,
    setUnits,
    exportState,
    importState,
    splitWallAndConnect,
  };
}
