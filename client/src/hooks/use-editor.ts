import { useState, useCallback, useRef, useEffect } from "react";
import { EditorState, RoomData, Wall, FurnitureItem, RoomLabel, TextBox, Arrow, Point, EditorTool, FurnitureTemplate, UnitSystem, DEFAULT_TEXT_BOX, DEFAULT_ARROW, FURNITURE_LIBRARY, DEFAULT_WALL_THICKNESS } from "../lib/types";

const DEFAULT_AUTOSAVE_KEY = "freeroomplanner-autosave";

function loadSavedState(storageKey: string): Partial<EditorState> | null {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // v2: multi-room format
    if (parsed && parsed.version === 2 && Array.isArray(parsed.rooms)) {
      return parsed;
    }
    // v1: single-room format — migrate to multi-room
    if (parsed && parsed.version === 1 && Array.isArray(parsed.walls)) {
      const roomId = generateId();
      const room: RoomData = {
        id: roomId,
        name: parsed.roomName || "Room 1",
        walls: parsed.walls || [],
        furniture: parsed.furniture || [],
        labels: parsed.labels || [],
        textBoxes: parsed.textBoxes || [],
        arrows: parsed.arrows || [],
        roomNames: parsed.roomNames || {},
        roomLabelOffsets: parsed.roomLabelOffsets || {},
        componentLabelsVisible: parsed.componentLabelsVisible ?? true,
      };
      return {
        ...parsed,
        rooms: [room],
        activeRoomId: roomId,
        roomOrder: [roomId],
      };
    }
  } catch {
    // Ignore corrupted data
  }
  return null;
}

function saveStateToStorage(state: EditorState, storageKey: string): void {
  try {
    // Build rooms array: update the active room with current working state
    const updatedRooms = state.rooms.map((r) =>
      r.id === state.activeRoomId
        ? {
            ...r,
            name: state.roomName,
            walls: state.walls,
            furniture: state.furniture,
            labels: state.labels,
            textBoxes: state.textBoxes,
            arrows: state.arrows,
            roomNames: state.roomNames,
            roomLabelOffsets: state.roomLabelOffsets,
            componentLabelsVisible: state.componentLabelsVisible,
          }
        : r
    );
    const data = {
      version: 2,
      rooms: updatedRooms,
      activeRoomId: state.activeRoomId,
      roomOrder: state.roomOrder,
      units: state.units,
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
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
    roomLabelOffsets: { ...s.roomLabelOffsets },
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

function makeDefaultRoom(): RoomData {
  const id = generateId();
  return {
    id,
    name: "Room 1",
    walls: [],
    furniture: [],
    labels: [],
    textBoxes: [],
    arrows: [],
    roomNames: {},
    roomLabelOffsets: {},
    componentLabelsVisible: true,
  };
}

function makeDefaultState(): EditorState {
  const room = makeDefaultRoom();
  return {
    walls: [],
    furniture: [],
    labels: [],
    textBoxes: [],
    arrows: [],
    gridSize: 80,
    zoom: 1,
    panOffset: { x: 200, y: 100 },
    selectedTool: "wall",
    selectedItemId: null,
    wallDrawing: null,
    wallChainStart: null,
    roomName: room.name,
    units: "m" as UnitSystem,
    roomNames: {},
    roomLabelOffsets: {},
    componentLabelsVisible: true,
    rooms: [room],
    activeRoomId: room.id,
    roomOrder: [room.id],
  };
}

function normalizeWalls(walls: any[]): Wall[] {
  return walls.map((w: any) => ({
    ...w,
    thickness: w.thickness ?? DEFAULT_WALL_THICKNESS,
  }));
}

function normalizeFurniture(furniture: any[]): FurnitureItem[] {
  return furniture.map((f: any) => ({
    ...f,
    labelOffset: f.labelOffset ?? { x: 0, y: 0 },
    labelInside: f.labelInside ?? LABEL_INSIDE_TYPES.has(f.type),
  }));
}

function roomHasContent(room: RoomData): boolean {
  return room.walls.length > 0 || room.furniture.length > 0 ||
    room.labels.length > 0 || room.textBoxes.length > 0 || room.arrows.length > 0;
}

function getInitialState(storageKey: string): EditorState {
  const saved = loadSavedState(storageKey);
  if (!saved) return makeDefaultState();

  const defaultState = makeDefaultState();

  // Multi-room state (v2 migration already done in loadSavedState)
  const rooms: RoomData[] = (saved.rooms ?? defaultState.rooms).map((r: any) => ({
    ...r,
    furniture: normalizeFurniture(r.furniture ?? []),
    walls: normalizeWalls(r.walls ?? []),
    labels: r.labels ?? [],
    textBoxes: r.textBoxes ?? [],
    arrows: r.arrows ?? [],
    roomNames: r.roomNames ?? {},
    roomLabelOffsets: r.roomLabelOffsets ?? {},
    componentLabelsVisible: r.componentLabelsVisible ?? true,
  }));
  const activeRoomId = saved.activeRoomId ?? rooms[0]?.id ?? defaultState.activeRoomId;
  const roomOrder = saved.roomOrder ?? rooms.map((r: RoomData) => r.id);
  const activeRoom = rooms.find((r: RoomData) => r.id === activeRoomId) ?? rooms[0];
  const hasContent = activeRoom ? roomHasContent(activeRoom) : false;

  return {
    ...defaultState,
    selectedTool: hasContent ? "select" : "wall",
    roomName: activeRoom?.name ?? defaultState.roomName,
    walls: activeRoom?.walls ?? [],
    furniture: normalizeFurniture(activeRoom?.furniture ?? []),
    labels: activeRoom?.labels ?? [],
    textBoxes: activeRoom?.textBoxes ?? [],
    arrows: activeRoom?.arrows ?? [],
    roomNames: activeRoom?.roomNames ?? {},
    roomLabelOffsets: activeRoom?.roomLabelOffsets ?? {},
    componentLabelsVisible: activeRoom?.componentLabelsVisible ?? true,
    rooms,
    activeRoomId,
    roomOrder,
    units: (saved as any).units ?? defaultState.units,
  };
}

export function useEditor(storageKey: string = DEFAULT_AUTOSAVE_KEY) {
  const [state, setState] = useState<EditorState>(() => getInitialState(storageKey));
  // Per-room undo/redo stacks keyed by room ID
  const undoStacks = useRef<Record<string, EditorState[]>>({});
  const redoStacks = useRef<Record<string, EditorState[]>>({});

  const getUndoStack = useCallback((roomId?: string) => {
    const id = roomId ?? state.activeRoomId;
    if (!undoStacks.current[id]) undoStacks.current[id] = [];
    return undoStacks.current[id];
  }, [state.activeRoomId]);

  const getRedoStack = useCallback((roomId?: string) => {
    const id = roomId ?? state.activeRoomId;
    if (!redoStacks.current[id]) redoStacks.current[id] = [];
    return redoStacks.current[id];
  }, [state.activeRoomId]);

  const pushUndo = useCallback(() => {
    setState((s) => {
      const stack = undoStacks.current[s.activeRoomId] ?? [];
      stack.push(deepCopyState(s));
      if (stack.length > 50) stack.shift();
      undoStacks.current[s.activeRoomId] = stack;
      redoStacks.current[s.activeRoomId] = [];
      return s;
    });
  }, []);

  const undo = useCallback(() => {
    const stack = getUndoStack();
    if (stack.length === 0) return;
    const prev = stack.pop()!;
    setState((s) => {
      const redoStack = redoStacks.current[s.activeRoomId] ?? [];
      redoStack.push(deepCopyState(s));
      redoStacks.current[s.activeRoomId] = redoStack;
      return prev;
    });
  }, [getUndoStack]);

  const redo = useCallback(() => {
    const stack = getRedoStack();
    if (stack.length === 0) return;
    const next = stack.pop()!;
    setState((s) => {
      const undoStack = undoStacks.current[s.activeRoomId] ?? [];
      undoStack.push(deepCopyState(s));
      undoStacks.current[s.activeRoomId] = undoStack;
      return next;
    });
  }, [getRedoStack]);

  // Auto-save plan data to localStorage whenever it changes
  useEffect(() => {
    saveStateToStorage(state, storageKey);
  }, [state.walls, state.furniture, state.labels, state.textBoxes, state.arrows, state.roomName, state.roomNames, state.componentLabelsVisible, state.rooms, state.activeRoomId, state.roomOrder, storageKey]);

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
      thickness: DEFAULT_WALL_THICKNESS,
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

  const moveWall = useCallback((id: string, updates: Partial<Wall>) => {
    setState((s) => ({
      ...s,
      walls: s.walls.map((w) => w.id === id ? { ...w, ...updates } : w),
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
        return {
          ...f,
          rotation: newRotation,
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
    setState((s) => ({ ...s, labels: [...s.labels, label], selectedItemId: label.id, selectedTool: "select" }));
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
    try { localStorage.removeItem(storageKey); } catch {}
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
      newWalls.push({ id: generateId(), start: newWallStart, end: splitPoint, thickness: DEFAULT_WALL_THICKNESS });
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

  const setRoomLabelOffset = useCallback((roomKey: string, offset: Point) => {
    setState((s) => ({
      ...s,
      roomLabelOffsets: { ...s.roomLabelOffsets, [roomKey]: offset },
    }));
  }, []);

  const toggleComponentLabels = useCallback(() => {
    setState((s) => ({ ...s, componentLabelsVisible: !s.componentLabelsVisible }));
  }, []);

  /** Update wall measurement label offset — cosmetic preference, NOT added to undo stack */
  const updateWallLabelOffset = useCallback((id: string, offset: number, pinned: boolean) => {
    setState((s) => ({
      ...s,
      walls: s.walls.map((w) => w.id === id
        ? { ...w, measurementLabelOffset: offset, measurementLabelPinned: pinned }
        : w),
    }));
  }, []);

  // --- Room tab management ---

  /** Save the current working state back into the rooms array */
  const syncActiveRoomToRooms = (s: EditorState): RoomData[] => {
    return s.rooms.map((r) =>
      r.id === s.activeRoomId
        ? {
            ...r,
            name: s.roomName,
            walls: s.walls,
            furniture: s.furniture,
            labels: s.labels,
            textBoxes: s.textBoxes,
            arrows: s.arrows,
            roomNames: s.roomNames,
            roomLabelOffsets: s.roomLabelOffsets,
            componentLabelsVisible: s.componentLabelsVisible,
          }
        : r
    );
  };

  const addRoom = useCallback(() => {
    setState((s) => {
      const syncedRooms = syncActiveRoomToRooms(s);
      // Auto-increment name: find max "Room N" number
      let maxNum = 0;
      for (const r of syncedRooms) {
        const match = r.name.match(/^Room (\d+)$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const newRoom: RoomData = {
        id: generateId(),
        name: `Room ${maxNum + 1}`,
        walls: [],
        furniture: [],
        labels: [],
        textBoxes: [],
        arrows: [],
        roomNames: {},
        roomLabelOffsets: {},
        componentLabelsVisible: true,
      };
      const newRooms = [...syncedRooms, newRoom];
      return {
        ...s,
        rooms: newRooms,
        activeRoomId: newRoom.id,
        roomOrder: [...s.roomOrder, newRoom.id],
        // Load new room into working state
        roomName: newRoom.name,
        walls: [],
        furniture: [],
        labels: [],
        textBoxes: [],
        arrows: [],
        roomNames: {},
        roomLabelOffsets: {},
        componentLabelsVisible: true,
        selectedTool: "wall" as EditorTool,
        selectedItemId: null,
        wallDrawing: null,
        wallChainStart: null,
        panOffset: { x: 200, y: 100 },
        zoom: 1,
      };
    });
  }, []);

  const switchRoom = useCallback((roomId: string) => {
    setState((s) => {
      if (roomId === s.activeRoomId) return s;
      const syncedRooms = syncActiveRoomToRooms(s);
      const targetRoom = syncedRooms.find((r) => r.id === roomId);
      if (!targetRoom) return s;
      const hasContent = roomHasContent(targetRoom);
      return {
        ...s,
        rooms: syncedRooms,
        activeRoomId: roomId,
        roomName: targetRoom.name,
        walls: normalizeWalls(targetRoom.walls),
        furniture: normalizeFurniture(targetRoom.furniture),
        labels: targetRoom.labels,
        textBoxes: targetRoom.textBoxes,
        arrows: targetRoom.arrows,
        roomNames: targetRoom.roomNames,
        roomLabelOffsets: targetRoom.roomLabelOffsets,
        componentLabelsVisible: targetRoom.componentLabelsVisible,
        selectedTool: hasContent ? "select" as EditorTool : "wall" as EditorTool,
        selectedItemId: null,
        wallDrawing: null,
        wallChainStart: null,
      };
    });
  }, []);

  const renameRoom = useCallback((roomId: string, name: string) => {
    setState((s) => {
      const newRooms = s.rooms.map((r) => r.id === roomId ? { ...r, name } : r);
      return {
        ...s,
        rooms: newRooms,
        ...(roomId === s.activeRoomId ? { roomName: name } : {}),
      };
    });
  }, []);

  const deleteRoom = useCallback((roomId: string) => {
    setState((s) => {
      if (s.roomOrder.length <= 1) return s; // Can't delete last room
      const syncedRooms = syncActiveRoomToRooms(s);
      const newRooms = syncedRooms.filter((r) => r.id !== roomId);
      const newOrder = s.roomOrder.filter((id) => id !== roomId);
      // Clean up undo/redo for deleted room
      delete undoStacks.current[roomId];
      delete redoStacks.current[roomId];
      // If we're deleting the active room, switch to adjacent
      if (roomId === s.activeRoomId) {
        const oldIdx = s.roomOrder.indexOf(roomId);
        const newActiveId = newOrder[Math.min(oldIdx, newOrder.length - 1)];
        const newActive = newRooms.find((r) => r.id === newActiveId)!;
        const hasContent = roomHasContent(newActive);
        return {
          ...s,
          rooms: newRooms,
          roomOrder: newOrder,
          activeRoomId: newActiveId,
          roomName: newActive.name,
          walls: newActive.walls,
          furniture: normalizeFurniture(newActive.furniture),
          labels: newActive.labels,
          textBoxes: newActive.textBoxes,
          arrows: newActive.arrows,
          roomNames: newActive.roomNames,
          roomLabelOffsets: newActive.roomLabelOffsets,
          componentLabelsVisible: newActive.componentLabelsVisible,
          selectedTool: hasContent ? "select" as EditorTool : "wall" as EditorTool,
          selectedItemId: null,
          wallDrawing: null,
          wallChainStart: null,
        };
      }
      return { ...s, rooms: newRooms, roomOrder: newOrder };
    });
  }, []);

  const duplicateRoom = useCallback((roomId?: string) => {
    setState((s) => {
      const syncedRooms = syncActiveRoomToRooms(s);
      const sourceId = roomId ?? s.activeRoomId;
      const sourceRoom = syncedRooms.find((r) => r.id === sourceId);
      if (!sourceRoom) return s;

      const newRoom: RoomData = {
        id: generateId(),
        name: `${sourceRoom.name} (copy)`,
        walls: sourceRoom.walls.map((w) => ({ ...w, id: generateId(), start: { ...w.start }, end: { ...w.end } })),
        furniture: sourceRoom.furniture.map((f) => ({ ...f, id: generateId(), labelOffset: f.labelOffset ? { ...f.labelOffset } : undefined })),
        labels: sourceRoom.labels.map((l) => ({ ...l, id: generateId() })),
        textBoxes: sourceRoom.textBoxes.map((t) => ({ ...t, id: generateId() })),
        arrows: sourceRoom.arrows.map((a) => ({ ...a, id: generateId() })),
        roomNames: { ...sourceRoom.roomNames },
        roomLabelOffsets: Object.fromEntries(
          Object.entries(sourceRoom.roomLabelOffsets).map(([k, v]) => [k, { ...v }])
        ),
        componentLabelsVisible: sourceRoom.componentLabelsVisible,
      };

      const newRooms = [...syncedRooms, newRoom];
      const newOrder = [...s.roomOrder];
      const sourceIdx = newOrder.indexOf(sourceId);
      newOrder.splice(sourceIdx + 1, 0, newRoom.id);

      return {
        ...s,
        rooms: newRooms,
        activeRoomId: newRoom.id,
        roomOrder: newOrder,
        roomName: newRoom.name,
        walls: newRoom.walls,
        furniture: normalizeFurniture(newRoom.furniture),
        labels: newRoom.labels,
        textBoxes: newRoom.textBoxes,
        arrows: newRoom.arrows,
        roomNames: newRoom.roomNames,
        roomLabelOffsets: newRoom.roomLabelOffsets,
        componentLabelsVisible: newRoom.componentLabelsVisible,
        selectedTool: "select" as EditorTool,
        selectedItemId: null,
        wallDrawing: null,
        wallChainStart: null,
      };
    });
  }, []);

  const reorderRooms = useCallback((newOrder: string[]) => {
    setState((s) => ({ ...s, roomOrder: newOrder }));
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
      roomLabelOffsets: state.roomLabelOffsets,
      componentLabelsVisible: state.componentLabelsVisible,
    };
  }, [state.roomName, state.walls, state.furniture, state.labels, state.textBoxes, state.arrows, state.roomNames, state.roomLabelOffsets, state.componentLabelsVisible]);

  const exportAllRooms = useCallback(() => {
    const syncedRooms = syncActiveRoomToRooms(state);
    return {
      version: 2,
      units: state.units,
      tabs: syncedRooms.map((r) => ({
        name: r.name,
        state: {
          version: 1,
          roomName: r.name,
          walls: r.walls,
          furniture: r.furniture,
          labels: r.labels,
          textBoxes: r.textBoxes,
          arrows: r.arrows,
          roomNames: r.roomNames,
          roomLabelOffsets: r.roomLabelOffsets,
          componentLabelsVisible: r.componentLabelsVisible,
        },
      })),
    };
  }, [state]);

  const importState = useCallback((plan: any) => {
    // Multi-tab import: { version: 2, tabs: [{ name, state }] }
    if (plan.version === 2 && Array.isArray(plan.tabs) && plan.tabs.length > 0) {
      const rooms: RoomData[] = plan.tabs.map((tab: any) => {
        const s = tab.state || {};
        return {
          id: generateId(),
          name: tab.name || s.roomName || "Room",
          walls: normalizeWalls(s.walls || []),
          furniture: normalizeFurniture(s.furniture || []),
          labels: s.labels || [],
          textBoxes: s.textBoxes || [],
          arrows: s.arrows || [],
          roomNames: s.roomNames || {},
          roomLabelOffsets: s.roomLabelOffsets || {},
          componentLabelsVisible: s.componentLabelsVisible ?? true,
        };
      });
      const activeRoom = rooms[0];
      const roomOrder = rooms.map((r) => r.id);
      setState((s) => ({
        ...s,
        rooms,
        activeRoomId: activeRoom.id,
        roomOrder,
        roomName: activeRoom.name,
        walls: activeRoom.walls,
        furniture: activeRoom.furniture,
        labels: activeRoom.labels,
        textBoxes: activeRoom.textBoxes,
        arrows: activeRoom.arrows,
        roomNames: activeRoom.roomNames,
        roomLabelOffsets: activeRoom.roomLabelOffsets,
        componentLabelsVisible: activeRoom.componentLabelsVisible,
        units: plan.units || s.units,
        selectedTool: roomHasContent(activeRoom) ? "select" as EditorTool : "wall" as EditorTool,
        selectedItemId: null,
        wallDrawing: null,
        wallChainStart: null,
      }));
      return;
    }

    // Single-room v1 import
    if (plan.version && plan.walls && plan.furniture) {
      pushUndo();
      setState((s) => ({
        ...s,
        roomName: plan.roomName || s.roomName,
        walls: normalizeWalls(plan.walls),
        furniture: normalizeFurniture(plan.furniture),
        labels: plan.labels || [],
        textBoxes: plan.textBoxes || [],
        arrows: plan.arrows || [],
        roomNames: plan.roomNames || {},
        roomLabelOffsets: plan.roomLabelOffsets || {},
        componentLabelsVisible: plan.componentLabelsVisible ?? true,
        selectedItemId: null,
        wallDrawing: null,
      }));
    }
  }, [pushUndo]);

  return {
    state,
    setTool,
    setSelectedItem,
    addWall,
    removeWall,
    updateWall,
    addFurniture,
    moveWall,
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
    canUndo: getUndoStack().length > 0,
    canRedo: getRedoStack().length > 0,
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
    exportAllRooms,
    importState,
    splitWallAndConnect,
    setRoomNameForRoom,
    setRoomLabelOffset,
    toggleComponentLabels,
    updateWallLabelOffset,
    // Room tab management
    addRoom,
    duplicateRoom,
    switchRoom,
    renameRoom,
    deleteRoom,
    reorderRooms,
  };
}
