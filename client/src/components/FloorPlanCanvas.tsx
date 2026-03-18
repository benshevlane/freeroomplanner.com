import { useRef, useEffect, useCallback, useState } from "react";
import { EditorState, Point, FurnitureTemplate, FurnitureItem, RoomLabel, TextBox, Arrow, UnitSystem, MeasureMode } from "../lib/types";
import RichTextBoxComponent from "./RichTextBox";
import {
  drawGrid,
  drawWalls,
  drawWallSegmentMeasurements,
  drawMeasurementIndicatorLines,
  drawFurniture,
  drawWallPreview,
  drawRoomAreas,
  drawResizeHandles,
  drawSnapIndicator,
  drawAlignmentGuides,
  drawDistanceMeasurements,
  collectDistanceMeasurementRects,
  drawEraserHighlight,
  collectComponentLabelRects,
  resolveAndDrawLabelCollisions,
  findParallelWallDiscrepancies,
  drawWallLabelsWithDiscrepancy,
  drawWallCupboardLegend,
  hitTestRotateHandle,
  hitTestRoomLabel,
  computeRoomLabelPositions,
  getRoomKey,
  snapAngle,
  computeWallAngle,
  findAdjoiningWallDirection,
  screenToWorld,
  snapToGrid,
  snapToWallEndpoints,
  snapToWallBody,
  snapFurnitureToWalls,
  snapFurnitureToNearest,
  SnappedWallEdge,
  SnappedComponentEdge,
  drawWallSnapIndicators,
  drawComponentSnapIndicators,
  drawSnapHighlight,
  hitTestWall,
  hitTestFurniture,
  hitTestLabel,
  hitTestResizeHandle,
  ResizeCorner,
  drawArrows,
  drawArrowPreview,
  hitTestArrow,
  hitTestArrowEndpoint,
  hitTestComponentLabel,
  hitTestLabelRotateHandle,
  hitTestLabelResizeHandle,
  ComponentLabelInfo,
} from "../lib/canvas-renderer";
import { isWallCupboard } from "../lib/types";
import { detectRooms } from "../lib/room-detection";

interface FloorPlanCanvasProps {
  state: EditorState;
  isDark: boolean;
  measureMode: MeasureMode;
  onAddWall: (start: Point, end: Point) => void;
  onSelectItem: (id: string | null) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
  onMoveLabel: (id: string, x: number, y: number) => void;
  onRemoveWall: (id: string) => void;
  onRemoveFurniture: (id: string) => void;
  onRemoveLabel: (id: string) => void;
  onSetZoom: (zoom: number) => void;
  onSetPan: (offset: Point) => void;
  onSetWallDrawing: (drawing: { start: Point } | null) => void;
  onAddLabel: (text: string, position: Point) => void;
  onUpdateLabel: (id: string, updates: Partial<RoomLabel>) => void;
  onPushUndo: () => void;
  droppingFurniture: FurnitureTemplate | null;
  onDropFurniture: (template: FurnitureTemplate, position: Point) => void;
  onUpdateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  onSplitWallAndConnect: (wallId: string, splitPoint: Point, newWallStart: Point) => void;
  onSetRoomName: (roomKey: string, name: string) => void;
  onMoveTextBox: (id: string, x: number, y: number) => void;
  onUpdateTextBox: (id: string, updates: Partial<TextBox>) => void;
  onRemoveTextBox: (id: string) => void;
  onPushUndoForTextBox: () => void;
  onAddArrow: (start: Point, end: Point) => string;
  onUpdateArrow: (id: string, updates: Partial<Arrow>) => void;
  onRemoveArrow: (id: string) => void;
  onSetLabelOffset: (id: string, offset: { x: number; y: number }) => void;
}

export default function FloorPlanCanvas({
  state,
  isDark,
  measureMode,
  onAddWall,
  onSelectItem,
  onMoveFurniture,
  onMoveLabel,
  onRemoveWall,
  onRemoveFurniture,
  onRemoveLabel,
  onSetZoom,
  onSetPan,
  onSetWallDrawing,
  onAddLabel,
  onUpdateLabel,
  onPushUndo,
  droppingFurniture,
  onDropFurniture,
  onUpdateFurniture,
  onSplitWallAndConnect,
  onSetRoomName,
  onMoveTextBox,
  onUpdateTextBox,
  onRemoveTextBox,
  onPushUndoForTextBox,
  onAddArrow,
  onUpdateArrow,
  onRemoveArrow,
  onSetLabelOffset,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [dragItemOffset, setDragItemOffset] = useState<Point>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<ResizeCorner | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; itemX: number; itemY: number; itemW: number; itemH: number } | null>(null);
  const [wallSnapPoint, setWallSnapPoint] = useState<Point | null>(null);
  const [eraserHoverId, setEraserHoverId] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateStartAngle, setRotateStartAngle] = useState(0);
  const [rotateItemStartRot, setRotateItemStartRot] = useState(0);
  // Component label dragging state
  const [isDraggingLabel, setIsDraggingLabel] = useState(false);
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const [labelDragStart, setLabelDragStart] = useState<{ x: number; y: number; offsetX: number; offsetY: number }>({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const componentLabelInfosRef = useRef<ComponentLabelInfo[]>([]);

  // Label rotate/resize state
  const [isRotatingLabel, setIsRotatingLabel] = useState(false);
  const [labelRotateStartAngle, setLabelRotateStartAngle] = useState(0);
  const [labelRotateItemStartRot, setLabelRotateItemStartRot] = useState(0);
  const [rotatingLabelId, setRotatingLabelId] = useState<string | null>(null);
  const [isResizingLabel, setIsResizingLabel] = useState(false);
  const [resizingLabelId, setResizingLabelId] = useState<string | null>(null);
  const [labelResizeStart, setLabelResizeStart] = useState<{
    x: number; y: number;
    labelW: number; labelH: number;
    labelRotation: number;
  } | null>(null);

  // Wall snap indicator state (transient, only during drag)
  const [wallSnapEdges, setWallSnapEdges] = useState<SnappedWallEdge[]>([]);
  const [componentSnapEdges, setComponentSnapEdges] = useState<SnappedComponentEdge[]>([]);
  // Snap landing highlight: item id + timestamp
  const [snapHighlightId, setSnapHighlightId] = useState<string | null>(null);
  const snapHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDidSnap = useRef(false);

  // Inline label editing state
  const [editingLabel, setEditingLabel] = useState<{ id: string | null; x: number; y: number; text: string; isNew: boolean; isRoomLabel?: boolean; roomKey?: string }>({ id: null, x: 0, y: 0, text: "", isNew: false });
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Synchronous wall-drawing state to avoid stale closures on rapid mobile taps
  const wallDrawingRef = useRef(state.wallDrawing);
  wallDrawingRef.current = state.wallDrawing;

  // Track pending wall commit for touch (defer to pointerUp so user can drag to adjust)
  const wallPendingCommitRef = useRef(false);

  // Pinch-to-zoom and two-finger pan state
  const pointerCache = useRef<Map<number, PointerEvent>>(new Map());
  const prevPinchDist = useRef<number | null>(null);
  const prevPinchCenter = useRef<{ x: number; y: number } | null>(null);

  // Track selected room key for highlighting
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);

  // Text box editing state
  const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);
  const [textBoxDragging, setTextBoxDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [textBoxResizing, setTextBoxResizing] = useState<{ id: string; corner: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);
  const [textBoxRotating, setTextBoxRotating] = useState<{ id: string; startAngle: number; origRotation: number; centerX: number; centerY: number } | null>(null);

  // Arrow drawing state
  const [arrowDrawingStart, setArrowDrawingStart] = useState<Point | null>(null);
  const [arrowDraggingEndpoint, setArrowDraggingEndpoint] = useState<{ id: string; endpoint: "start" | "end"; } | null>(null);

  // Reset arrow drawing state when tool changes away from arrow
  useEffect(() => {
    if (state.selectedTool !== "arrow") {
      setArrowDrawingStart(null);
    }
  }, [state.selectedTool]);

  // Canvas resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear
    ctx.fillStyle = isDark ? "#171614" : "#f7f6f2";
    ctx.fillRect(0, 0, w, h);

    // Grid
    drawGrid(ctx, w, h, state.gridSize, state.zoom, state.panOffset, isDark);

    // Room areas with names
    const rooms = detectRooms(state.walls);
    const roomLabelPositions = rooms.length > 0
      ? computeRoomLabelPositions(ctx, rooms, state.furniture, state.gridSize, state.zoom, state.roomNames, state.units)
      : new Map<string, Point>();
    if (rooms.length > 0) {
      drawRoomAreas(ctx, rooms, state.gridSize, state.zoom, state.panOffset, isDark, state.units, state.roomNames, selectedRoomKey, roomLabelPositions);
    }

    // Walls
    drawWalls(ctx, state.walls, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId, state.units, measureMode, state.furniture, rooms);

    // Segment measurements for walls with doors/windows
    drawWallSegmentMeasurements(ctx, state.walls, state.furniture, state.gridSize, state.zoom, state.panOffset, isDark, state.units, measureMode);

    // Measurement indicator lines (on top of walls, below labels/furniture)
    drawMeasurementIndicatorLines(ctx, state.walls, rooms, state.gridSize, state.zoom, state.panOffset, measureMode);

    // Parallel wall discrepancy detection
    const flaggedWalls = findParallelWallDiscrepancies(state.walls);

    // Wall labels with crowding check at low zoom
    if (flaggedWalls.size > 0 || state.zoom < 0.6) {
      drawWallLabelsWithDiscrepancy(ctx, state.walls, state.gridSize, state.zoom, state.panOffset, isDark, state.units, measureMode, state.furniture, flaggedWalls, w, h);
    }

    // Wall preview with snapping, angle snap, alignment guides
    if (state.wallDrawing && state.selectedTool === "wall") {
      const worldMouse = screenToWorld(mousePos.x, mousePos.y, state.gridSize, state.zoom, state.panOffset);
      const gridSnapped = snapToGrid(worldMouse, 10);
      // Check snap against raw world position for accurate distance
      const { snapped: wallSnapped, didSnap: epSnap } = snapToWallEndpoints(worldMouse, state.walls, 15);
      const { snapped: bodySnapped, didSnap: bodySnap } = snapToWallBody(worldMouse, state.walls, 15);
      const didSnap = epSnap || bodySnap;
      let finalPoint = epSnap ? wallSnapped : (bodySnap ? bodySnapped : gridSnapped);

      // Angle snapping (15° increments, strong snap) — skip if already snapped to endpoint
      let angleDeg: number | undefined;
      let adjAngleRad: number | undefined;
      if (!didSnap) {
        const angleResult = snapAngle(state.wallDrawing.start, finalPoint, 15, 5);
        finalPoint = angleResult.snapped;
        // Also snap to alignment guides
        const guideSnap = drawAlignmentGuides(ctx, finalPoint, state.walls, state.gridSize, state.zoom, state.panOffset, w, h, isDark);
        if (guideSnap.snapX !== null) finalPoint = { ...finalPoint, x: guideSnap.snapX };
        if (guideSnap.snapY !== null) finalPoint = { ...finalPoint, y: guideSnap.snapY };
      } else {
        // Draw guides even when endpoint-snapped
        drawAlignmentGuides(ctx, finalPoint, state.walls, state.gridSize, state.zoom, state.panOffset, w, h, isDark);
      }

      // Compute relative angle to adjoining wall (or skip if no adjoining wall)
      adjAngleRad = findAdjoiningWallDirection(state.wallDrawing.start, state.walls);
      if (adjAngleRad !== undefined) {
        const newWallRad = Math.atan2(
          finalPoint.y - state.wallDrawing.start.y,
          finalPoint.x - state.wallDrawing.start.x
        );
        // Interior angle: PI - (newWall - adjWall)
        let relativeRad = Math.PI - (newWallRad - adjAngleRad);
        let relativeDeg = relativeRad * (180 / Math.PI);
        relativeDeg = ((relativeDeg % 360) + 360) % 360;
        angleDeg = relativeDeg;
      }

      // Compute distance to decide whether to show preview line or just start dot
      const previewDx = finalPoint.x - state.wallDrawing.start.x;
      const previewDy = finalPoint.y - state.wallDrawing.start.y;
      const previewDist = Math.sqrt(previewDx * previewDx + previewDy * previewDy);

      if (previewDist < 5) {
        // Near-zero length: show only start point indicator (e.g. after first tap on mobile)
        drawSnapIndicator(ctx, state.wallDrawing.start, state.gridSize, state.zoom, state.panOffset);
      } else {
        drawWallPreview(ctx, state.wallDrawing.start, finalPoint, state.gridSize, state.zoom, state.panOffset, isDark, angleDeg, state.units, measureMode, adjAngleRad);
        if (didSnap) {
          drawSnapIndicator(ctx, finalPoint, state.gridSize, state.zoom, state.panOffset);
        }
      }
    }

    // Furniture — draw floor items first, then wall cupboards on top, then doors/windows
    const floorFurniture = state.furniture.filter((f) => f.type !== "door" && f.type !== "window" && !isWallCupboard(f.type));
    drawFurniture(ctx, floorFurniture, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

    // Wall cupboards render above floor units
    const wallCupboards = state.furniture.filter((f) => isWallCupboard(f.type));
    drawFurniture(ctx, wallCupboards, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

    // Doors & windows render on top of walls so they overlay correctly
    const doorWindowItems = state.furniture.filter((f) => f.type === "door" || f.type === "door_double" || f.type === "window");
    drawFurniture(ctx, doorWindowItems, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

    // Wall snap indicator lines (during drag)
    if (isDragging && wallSnapEdges.length > 0) {
      drawWallSnapIndicators(ctx, wallSnapEdges, state.gridSize, state.zoom, state.panOffset);
    }

    // Component snap indicator lines (during drag)
    if (isDragging && componentSnapEdges.length > 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        drawComponentSnapIndicators(ctx, componentSnapEdges, canvas.width, canvas.height, state.gridSize, state.zoom, state.panOffset);
      }
    }

    // Snap landing highlight (brief teal glow on snap)
    if (snapHighlightId) {
      const highlightItem = state.furniture.find((f) => f.id === snapHighlightId);
      if (highlightItem) {
        drawSnapHighlight(ctx, highlightItem, state.gridSize, state.zoom, state.panOffset);
      }
    }

    // Collect component label positions (without drawing) for collision resolution
    const componentLabelInfos = state.componentLabelsVisible
      ? collectComponentLabelRects(ctx, state.furniture, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId, state.units, state.walls, rooms)
      : [];
    componentLabelInfosRef.current = componentLabelInfos;

    // Resize handles and distance measurements for selected furniture
    const selectedFurn = state.furniture.find((f) => f.id === state.selectedItemId);
    let distanceMeasurementRects: { centerX: number; centerY: number; halfW: number; halfH: number }[] = [];
    if (selectedFurn && state.selectedTool === "select") {
      drawResizeHandles(ctx, selectedFurn, state.gridSize, state.zoom, state.panOffset);
      drawDistanceMeasurements(ctx, selectedFurn, state.walls, state.furniture, state.gridSize, state.zoom, state.panOffset, isDark, state.units);
      distanceMeasurementRects = collectDistanceMeasurementRects(ctx, selectedFurn, state.walls, state.furniture, state.gridSize, state.zoom, state.panOffset, isDark, state.units);
    }

    // Resolve label collisions and draw all labels (component + freeform) at resolved positions
    resolveAndDrawLabelCollisions(
      ctx, rooms, state.walls, componentLabelInfos, state.labels,
      state.gridSize, state.zoom, state.panOffset, isDark,
      state.roomNames, state.componentLabelsVisible, state.selectedItemId,
      roomLabelPositions, distanceMeasurementRects
    );

    // Arrows
    drawArrows(ctx, state.arrows, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

    // Arrow preview while drawing
    if (state.selectedTool === "arrow" && arrowDrawingStart) {
      const worldMouse = screenToWorld(mousePos.x, mousePos.y, state.gridSize, state.zoom, state.panOffset);
      drawArrowPreview(ctx, arrowDrawingStart, worldMouse, state.gridSize, state.zoom, state.panOffset, isDark);
    }

    // Snap indicator and alignment guides when wall tool is active but not drawing yet
    if (state.selectedTool === "wall" && !state.wallDrawing) {
      const worldMouse = screenToWorld(mousePos.x, mousePos.y, state.gridSize, state.zoom, state.panOffset);
      const gridSnapped = snapToGrid(worldMouse, 10);
      // Check snap against raw world position for accurate distance
      const { snapped: epSnapped, didSnap: epSnapIdle } = snapToWallEndpoints(worldMouse, state.walls, 15);
      if (epSnapIdle) {
        drawSnapIndicator(ctx, epSnapped, state.gridSize, state.zoom, state.panOffset);
      } else {
        const { snapped: bodySnapIdle, didSnap: bodySnapIdleHit } = snapToWallBody(worldMouse, state.walls, 15);
        if (bodySnapIdleHit) {
          drawSnapIndicator(ctx, bodySnapIdle, state.gridSize, state.zoom, state.panOffset);
        }
      }
      // Show alignment guides even before drawing starts
      if (state.walls.length > 0) {
        drawAlignmentGuides(ctx, gridSnapped, state.walls, state.gridSize, state.zoom, state.panOffset, w, h, isDark);
      }
    }

    // Eraser hover highlight
    if (state.selectedTool === "eraser" && eraserHoverId) {
      drawEraserHighlight(ctx, eraserHoverId, state.walls, state.furniture, state.labels, state.gridSize, state.zoom, state.panOffset);
    }

    // Scale indicator
    drawScaleIndicator(ctx, w, h, state.gridSize, state.zoom, isDark, state.units);

    // Wall cupboard legend (only show if there are wall cupboards on the canvas)
    if (wallCupboards.length > 0) {
      drawWallCupboardLegend(ctx, w, h, isDark);
    }
  });

  function drawScaleIndicator(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    gridSize: number,
    zoom: number,
    isDark: boolean,
    units: UnitSystem
  ) {
    const meterPx = gridSize * zoom;
    const x = 16;
    const y = h - 24;

    // Choose scale bar length and label based on unit system
    let displayPx: number;
    let displayLabel: string;
    switch (units) {
      case "ft":
        displayPx = meterPx * 0.9144; // 3 feet
        displayLabel = "3 ft";
        break;
      case "cm":
        displayPx = meterPx; // 100cm = 1m
        displayLabel = "100cm";
        break;
      case "mm":
        displayPx = meterPx * 0.5; // 500mm = 0.5m
        displayLabel = "500mm";
        break;
      case "m":
      default:
        displayPx = meterPx;
        displayLabel = "1m";
        break;
    }

    ctx.strokeStyle = isDark ? "#797876" : "#7a7974";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + displayPx, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + displayPx, y - 4);
    ctx.lineTo(x + displayPx, y + 4);
    ctx.stroke();

    ctx.font = `500 12px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? "#797876" : "#7a7974";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(displayLabel, x + displayPx / 2, y - 6);
  }

  const getCanvasPos = useCallback((e: React.PointerEvent | PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const getCanvasPosMouse = useCallback((e: React.MouseEvent | React.DragEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Prevent browser text selection / iOS callout while interacting with canvas
      e.preventDefault();

      const pos = getCanvasPos(e);
      setMousePos(pos);

      // If editing a label, commit and close on any canvas click
      if (editingLabel.id !== null || editingLabel.isNew || editingLabel.isRoomLabel) {
        labelInputRef.current?.blur();
        return;
      }

      // Track pointer for pinch-to-zoom
      pointerCache.current.set(e.pointerId, e.nativeEvent);
      if (pointerCache.current.size === 2) {
        // Cancel any pending wall commit — user is pinching, not placing
        wallPendingCommitRef.current = false;
        // Start pinch — compute initial distance and center
        const pointers = Array.from(pointerCache.current.values());
        const dx = pointers[0].clientX - pointers[1].clientX;
        const dy = pointers[0].clientY - pointers[1].clientY;
        prevPinchDist.current = Math.sqrt(dx * dx + dy * dy);
        prevPinchCenter.current = {
          x: (pointers[0].clientX + pointers[1].clientX) / 2,
          y: (pointers[0].clientY + pointers[1].clientY) / 2,
        };
        return;
      }

      // Middle mouse or alt+click or pan tool for panning
      if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && state.selectedTool === "pan")) {
        setIsPanning(true);
        setDragStart({ x: pos.x - state.panOffset.x, y: pos.y - state.panOffset.y });
        return;
      }

      // Right-click to pan while drawing walls
      if (e.button === 2) {
        e.preventDefault();
        setIsPanning(true);
        setDragStart({ x: pos.x - state.panOffset.x, y: pos.y - state.panOffset.y });
        return;
      }

      if (e.button !== 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (state.selectedTool === "select") {
        // Check rotation handle first, then resize handles
        const selectedFurn = state.furniture.find((f) => f.id === state.selectedItemId);
        if (selectedFurn) {
          if (hitTestRotateHandle(pos.x, pos.y, selectedFurn, state.gridSize, state.zoom, state.panOffset)) {
            const pxPerCm = (state.gridSize * state.zoom) / 100;
            const centerX = selectedFurn.x * pxPerCm + (selectedFurn.width * pxPerCm) / 2 + state.panOffset.x;
            const centerY = selectedFurn.y * pxPerCm + (selectedFurn.height * pxPerCm) / 2 + state.panOffset.y;
            const startAngle = Math.atan2(pos.y - centerY, pos.x - centerX);
            setIsRotating(true);
            setRotateStartAngle(startAngle);
            setRotateItemStartRot(selectedFurn.rotation);
            onPushUndo();
            return;
          }
          const corner = hitTestResizeHandle(pos.x, pos.y, selectedFurn, state.gridSize, state.zoom, state.panOffset);
          if (corner) {
            setIsResizing(true);
            setResizeCorner(corner);
            setResizeStart({
              x: pos.x,
              y: pos.y,
              itemX: selectedFurn.x,
              itemY: selectedFurn.y,
              itemW: selectedFurn.width,
              itemH: selectedFurn.height,
            });
            onPushUndo();
            return;
          }
        }

        // Try to hit test label rotate/resize handles first (before label drag)
        if (state.componentLabelsVisible && state.selectedItemId) {
          const selectedLabelInfo = componentLabelInfosRef.current.find(
            (info) => info.item.id === state.selectedItemId && info.isSelected
          );
          if (selectedLabelInfo) {
            // Rotate handle
            if (hitTestLabelRotateHandle(pos.x, pos.y, selectedLabelInfo)) {
              const cx = selectedLabelInfo.centerX;
              const cy = selectedLabelInfo.labelY + selectedLabelInfo.pillH / 2 - 2;
              const startAngle = Math.atan2(pos.y - cy, pos.x - cx);
              setIsRotatingLabel(true);
              setRotatingLabelId(state.selectedItemId);
              setLabelRotateStartAngle(startAngle);
              setLabelRotateItemStartRot(selectedLabelInfo.labelRotation);
              onPushUndo();
              return;
            }
            // Resize handle
            if (hitTestLabelResizeHandle(pos.x, pos.y, selectedLabelInfo)) {
              setIsResizingLabel(true);
              setResizingLabelId(state.selectedItemId);
              setLabelResizeStart({
                x: pos.x,
                y: pos.y,
                labelW: selectedLabelInfo.pillW,
                labelH: selectedLabelInfo.pillH,
                labelRotation: selectedLabelInfo.labelRotation,
              });
              onPushUndo();
              return;
            }
          }
        }

        // Try to hit test component labels first (so label drag takes priority over item drag)
        if (state.componentLabelsVisible) {
          const hitLabelItem = hitTestComponentLabel(pos.x, pos.y, componentLabelInfosRef.current);
          if (hitLabelItem) {
            // If component is already selected, drag just the label
            if (state.selectedItemId === hitLabelItem.id) {
              const currentOffset = hitLabelItem.labelOffset || { x: 0, y: 0 };
              setIsDraggingLabel(true);
              setDraggingLabelId(hitLabelItem.id);
              setLabelDragStart({
                x: pos.x,
                y: pos.y,
                offsetX: currentOffset.x,
                offsetY: currentOffset.y,
              });
              return;
            }
            // If component not yet selected, move the whole component
            const pxPerCm = (state.gridSize * state.zoom) / 100;
            onSelectItem(hitLabelItem.id);
            setIsDragging(true);
            setDragItemOffset({
              x: pos.x - (hitLabelItem.x * pxPerCm + state.panOffset.x),
              y: pos.y - (hitLabelItem.y * pxPerCm + state.panOffset.y),
            });
            return;
          }
        }

        // Try to hit test furniture first, then walls, then labels
        const hitFurn = hitTestFurniture(pos.x, pos.y, state.furniture, state.gridSize, state.zoom, state.panOffset);
        if (hitFurn) {
          const pxPerCm = (state.gridSize * state.zoom) / 100;
          onSelectItem(hitFurn.id);
          setIsDragging(true);
          setDragItemOffset({
            x: pos.x - (hitFurn.x * pxPerCm + state.panOffset.x),
            y: pos.y - (hitFurn.y * pxPerCm + state.panOffset.y),
          });
          return;
        }

        const hitLbl = hitTestLabel(pos.x, pos.y, state.labels, state.gridSize, state.zoom, state.panOffset, ctx);
        if (hitLbl) {
          const pxPerCm = (state.gridSize * state.zoom) / 100;
          onSelectItem(hitLbl.id);
          setIsDragging(true);
          setDragItemOffset({
            x: pos.x - (hitLbl.x * pxPerCm + state.panOffset.x),
            y: pos.y - (hitLbl.y * pxPerCm + state.panOffset.y),
          });
          return;
        }

        // Check arrow endpoint drag handles first for selected arrow
        const selectedArrow = state.arrows.find((a) => a.id === state.selectedItemId);
        if (selectedArrow) {
          const epHit = hitTestArrowEndpoint(pos.x, pos.y, selectedArrow, state.gridSize, state.zoom, state.panOffset);
          if (epHit) {
            onPushUndo();
            setArrowDraggingEndpoint({ id: selectedArrow.id, endpoint: epHit });
            return;
          }
        }

        // Check arrow body hit
        const hitArrow = hitTestArrow(pos.x, pos.y, state.arrows, state.gridSize, state.zoom, state.panOffset);
        if (hitArrow) {
          onSelectItem(hitArrow.id);
          return;
        }

        const hitW = hitTestWall(pos.x, pos.y, state.walls, state.gridSize, state.zoom, state.panOffset);
        if (hitW) {
          onSelectItem(hitW.id);
          return;
        }

        onSelectItem(null);
        setSelectedRoomKey(null);
        setEditingTextBoxId(null);
      } else if (state.selectedTool === "wall") {
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const gridSnapped = snapToGrid(world, 10);
        // Check endpoint snap against RAW world position (not grid-snapped)
        // so that the threshold accurately reflects cursor distance
        const { snapped: wallSnapped, didSnap: endpointSnap } = snapToWallEndpoints(world, state.walls, 15);
        // Also check wall body snap (for mid-wall connections)
        const { snapped: bodySnapped, didSnap: bodySnap, wallId: bodyWallId } = snapToWallBody(world, state.walls, 15);

        const didSnap = endpointSnap || bodySnap;
        let finalPoint = endpointSnap ? wallSnapped : (bodySnap ? bodySnapped : gridSnapped);

        // Apply angle snapping when actively drawing (skip if snapped)
        const currentWallDrawing = wallDrawingRef.current;
        if (currentWallDrawing && !didSnap) {
          const angleResult = snapAngle(currentWallDrawing.start, finalPoint, 15, 5);
          finalPoint = angleResult.snapped;
          // Apply grid snap to the angle-snapped point
          finalPoint = snapToGrid(finalPoint, 10);
        }

        if (currentWallDrawing) {
          if (e.pointerType === "touch") {
            // Touch: defer wall commit to pointerUp so user can drag to adjust
            wallPendingCommitRef.current = true;
          } else {
            // Mouse: commit immediately (unchanged desktop behavior)
            if (bodySnap && !endpointSnap && bodyWallId) {
              onSplitWallAndConnect(bodyWallId, finalPoint, currentWallDrawing.start);
              onSetWallDrawing(null);
              wallDrawingRef.current = null;
            } else {
              onAddWall(currentWallDrawing.start, finalPoint);

              if (endpointSnap) {
                onSetWallDrawing(null);
                wallDrawingRef.current = null;
              } else {
                onSetWallDrawing({ start: finalPoint });
                wallDrawingRef.current = { start: finalPoint };
              }
            }
          }
        } else {
          onSetWallDrawing({ start: finalPoint });
          wallDrawingRef.current = { start: finalPoint };
        }
      } else if (state.selectedTool === "eraser") {
        const hitFurn = hitTestFurniture(pos.x, pos.y, state.furniture, state.gridSize, state.zoom, state.panOffset);
        if (hitFurn) { onRemoveFurniture(hitFurn.id); return; }

        const hitLbl = hitTestLabel(pos.x, pos.y, state.labels, state.gridSize, state.zoom, state.panOffset, ctx);
        if (hitLbl) { onRemoveLabel(hitLbl.id); return; }

        const hitArrowErase = hitTestArrow(pos.x, pos.y, state.arrows, state.gridSize, state.zoom, state.panOffset);
        if (hitArrowErase) { onRemoveArrow(hitArrowErase.id); return; }

        const hitW = hitTestWall(pos.x, pos.y, state.walls, state.gridSize, state.zoom, state.panOffset);
        if (hitW) { onRemoveWall(hitW.id); return; }
      } else if (state.selectedTool === "arrow") {
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const snapped = snapToGrid(world, 10);
        if (arrowDrawingStart) {
          // Second click: place the arrow
          onAddArrow(arrowDrawingStart, snapped);
          setArrowDrawingStart(null);
        } else {
          // First click: start drawing
          setArrowDrawingStart(snapped);
        }
      } else if (state.selectedTool === "label") {
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const snapped = snapToGrid(world, 10);
        // Show inline input instead of prompt
        const pxPerCm = (state.gridSize * state.zoom) / 100;
        const screenX = snapped.x * pxPerCm + state.panOffset.x;
        const screenY = snapped.y * pxPerCm + state.panOffset.y;
        setEditingLabel({ id: null, x: screenX, y: screenY, text: "", isNew: true });
        // We need to store the world position for when we commit
        editingLabelWorldPos.current = snapped;
        setTimeout(() => labelInputRef.current?.focus(), 0);
      }
    },
    [state, getCanvasPos, onSelectItem, onAddWall, onSetWallDrawing, onRemoveWall, onRemoveFurniture, onRemoveLabel, onRemoveArrow, onPushUndo, onUpdateFurniture, onSplitWallAndConnect, onAddArrow, arrowDrawingStart, onSetLabelOffset, editingLabel]
  );

  // Store world position for new labels
  const editingLabelWorldPos = useRef<Point>({ x: 0, y: 0 });

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pos = getCanvasPos(e);
      setMousePos(pos);

      // Update pointer in cache
      pointerCache.current.set(e.pointerId, e.nativeEvent);

      // Pinch-to-zoom + two-finger pan
      if (pointerCache.current.size === 2 && prevPinchDist.current !== null) {
        const pointers = Array.from(pointerCache.current.values());
        const dx = pointers[0].clientX - pointers[1].clientX;
        const dy = pointers[0].clientY - pointers[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / prevPinchDist.current;
        const newZoom = Math.max(0.3, Math.min(3, state.zoom * scale));

        // Current center of the two pointers
        const centerX = (pointers[0].clientX + pointers[1].clientX) / 2;
        const centerY = (pointers[0].clientY + pointers[1].clientY) / 2;

        // Two-finger pan delta
        const panDx = prevPinchCenter.current ? centerX - prevPinchCenter.current.x : 0;
        const panDy = prevPinchCenter.current ? centerY - prevPinchCenter.current.y : 0;

        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const cx = centerX - rect.left;
          const cy = centerY - rect.top;
          const zoomRatio = newZoom / state.zoom;
          const newPanX = cx - (cx - state.panOffset.x) * zoomRatio + panDx;
          const newPanY = cy - (cy - state.panOffset.y) * zoomRatio + panDy;
          onSetZoom(newZoom);
          onSetPan({ x: newPanX, y: newPanY });
        }

        prevPinchDist.current = dist;
        prevPinchCenter.current = { x: centerX, y: centerY };
        return;
      }

      if (isPanning) {
        onSetPan({
          x: pos.x - dragStart.x,
          y: pos.y - dragStart.y,
        });
        return;
      }

      // Handle arrow endpoint dragging
      if (arrowDraggingEndpoint) {
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const snapped = snapToGrid(world, 10);
        if (arrowDraggingEndpoint.endpoint === "start") {
          onUpdateArrow(arrowDraggingEndpoint.id, { startX: snapped.x, startY: snapped.y });
        } else {
          onUpdateArrow(arrowDraggingEndpoint.id, { endX: snapped.x, endY: snapped.y });
        }
        return;
      }

      // Handle label rotation
      if (isRotatingLabel && rotatingLabelId) {
        const labelInfo = componentLabelInfosRef.current.find(
          (info) => info.item.id === rotatingLabelId
        );
        if (labelInfo) {
          const cx = labelInfo.centerX;
          const cy = labelInfo.labelY + labelInfo.pillH / 2 - 2;
          const currentAngle = Math.atan2(pos.y - cy, pos.x - cx);
          let deltaDeg = ((currentAngle - labelRotateStartAngle) * 180) / Math.PI;
          let newRot = labelRotateItemStartRot + deltaDeg;
          // Snap to 15° increments when within 3° threshold
          const snapDeg = 15;
          const nearestSnap = Math.round(newRot / snapDeg) * snapDeg;
          if (Math.abs(newRot - nearestSnap) < 3) newRot = nearestSnap;
          newRot = ((newRot % 360) + 360) % 360;
          onUpdateFurniture(rotatingLabelId, { labelRotation: Math.round(newRot) });
        }
        return;
      }

      // Handle label resize
      if (isResizingLabel && resizingLabelId && labelResizeStart) {
        const dxPx = pos.x - labelResizeStart.x;
        const dyPx = pos.y - labelResizeStart.y;

        // Transform to label's local space using label rotation
        const rotRad = (labelResizeStart.labelRotation * Math.PI) / 180;
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const localDx = dxPx * cosR + dyPx * sinR;
        const localDy = -dxPx * sinR + dyPx * cosR;

        // Apply with minimum size constraint (60×20px)
        const newW = Math.max(60, labelResizeStart.labelW + localDx);
        const newH = Math.max(20, labelResizeStart.labelH + localDy);
        onUpdateFurniture(resizingLabelId, { labelWidth: newW, labelHeight: newH });
        return;
      }

      // Handle free rotation
      if (isRotating && state.selectedItemId) {
        const furn = state.furniture.find((f) => f.id === state.selectedItemId);
        if (furn) {
          const pxPerCm = (state.gridSize * state.zoom) / 100;
          const centerX = furn.x * pxPerCm + (furn.width * pxPerCm) / 2 + state.panOffset.x;
          const centerY = furn.y * pxPerCm + (furn.height * pxPerCm) / 2 + state.panOffset.y;
          const currentAngle = Math.atan2(pos.y - centerY, pos.x - centerX);
          let deltaDeg = ((currentAngle - rotateStartAngle) * 180) / Math.PI;
          let newRot = rotateItemStartRot + deltaDeg;
          // Snap to 15° increments when within 3° threshold
          const snapDeg = 15;
          const nearestSnap = Math.round(newRot / snapDeg) * snapDeg;
          if (Math.abs(newRot - nearestSnap) < 3) newRot = nearestSnap;
          // Normalize to 0-360
          newRot = ((newRot % 360) + 360) % 360;
          onUpdateFurniture(state.selectedItemId, { rotation: Math.round(newRot) });
        }
        return;
      }

      if (isResizing && resizeStart && resizeCorner && state.selectedItemId) {
        const pxPerCm = (state.gridSize * state.zoom) / 100;
        const dxPx = pos.x - resizeStart.x;
        const dyPx = pos.y - resizeStart.y;

        // Rotate screen-space delta into the item's local coordinate space
        // so resize handles work correctly regardless of item rotation
        const resizingItem = state.furniture.find((f) => f.id === state.selectedItemId);
        const rotRad = resizingItem ? (resizingItem.rotation * Math.PI) / 180 : 0;
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const localDxPx = dxPx * cosR + dyPx * sinR;
        const localDyPx = -dxPx * sinR + dyPx * cosR;
        const dxCm = localDxPx / pxPerCm;
        const dyCm = localDyPx / pxPerCm;

        // Doors/windows allow smaller height (thickness) than regular furniture
        const isStructural = resizingItem && (resizingItem.type === "door" || resizingItem.type === "door_double" || resizingItem.type === "window" || resizingItem.type === "radiator");
        const minW = 20;
        const minH = isStructural ? 5 : 20;

        let newW = resizeStart.itemW;
        let newH = resizeStart.itemH;

        // Compute new dimensions based on which handle is dragged
        if (resizeCorner === "br") {
          newW = Math.max(minW, resizeStart.itemW + dxCm);
          newH = Math.max(minH, resizeStart.itemH + dyCm);
        } else if (resizeCorner === "bl") {
          newW = Math.max(minW, resizeStart.itemW - dxCm);
          newH = Math.max(minH, resizeStart.itemH + dyCm);
        } else if (resizeCorner === "tr") {
          newW = Math.max(minW, resizeStart.itemW + dxCm);
          newH = Math.max(minH, resizeStart.itemH - dyCm);
        } else if (resizeCorner === "tl") {
          newW = Math.max(minW, resizeStart.itemW - dxCm);
          newH = Math.max(minH, resizeStart.itemH - dyCm);
        } else if (resizeCorner === "r") {
          newW = Math.max(minW, resizeStart.itemW + dxCm);
        } else if (resizeCorner === "l") {
          newW = Math.max(minW, resizeStart.itemW - dxCm);
        } else if (resizeCorner === "b") {
          newH = Math.max(minH, resizeStart.itemH + dyCm);
        } else if (resizeCorner === "t") {
          newH = Math.max(minH, resizeStart.itemH - dyCm);
        }

        newW = Math.round(newW);
        newH = Math.round(newH);

        // Anchor the opposite corner/edge in world space, accounting for rotation.
        // Anchor local offsets (from item center) for the fixed point:
        let aOldX = 0, aOldY = 0; // old anchor local offset
        let aNewX = 0, aNewY = 0; // new anchor local offset
        const ow = resizeStart.itemW, oh = resizeStart.itemH;
        if (resizeCorner === "br") {
          aOldX = -ow / 2; aOldY = -oh / 2; aNewX = -newW / 2; aNewY = -newH / 2;
        } else if (resizeCorner === "bl") {
          aOldX = ow / 2; aOldY = -oh / 2; aNewX = newW / 2; aNewY = -newH / 2;
        } else if (resizeCorner === "tr") {
          aOldX = -ow / 2; aOldY = oh / 2; aNewX = -newW / 2; aNewY = newH / 2;
        } else if (resizeCorner === "tl") {
          aOldX = ow / 2; aOldY = oh / 2; aNewX = newW / 2; aNewY = newH / 2;
        } else if (resizeCorner === "r") {
          aOldX = -ow / 2; aOldY = 0; aNewX = -newW / 2; aNewY = 0;
        } else if (resizeCorner === "l") {
          aOldX = ow / 2; aOldY = 0; aNewX = newW / 2; aNewY = 0;
        } else if (resizeCorner === "b") {
          aOldX = 0; aOldY = -oh / 2; aNewX = 0; aNewY = -newH / 2;
        } else if (resizeCorner === "t") {
          aOldX = 0; aOldY = oh / 2; aNewX = 0; aNewY = newH / 2;
        }

        // Old anchor world position
        const oldCx = resizeStart.itemX + ow / 2;
        const oldCy = resizeStart.itemY + oh / 2;
        const anchorWx = oldCx + aOldX * cosR - aOldY * sinR;
        const anchorWy = oldCy + aOldX * sinR + aOldY * cosR;

        // Solve for newX, newY so new anchor stays at same world position
        const newX = Math.round(anchorWx - newW / 2 - aNewX * cosR + aNewY * sinR);
        const newY = Math.round(anchorWy - newH / 2 - aNewX * sinR - aNewY * cosR);

        onUpdateFurniture(state.selectedItemId, { width: newW, height: newH, x: newX, y: newY });
        return;
      }

      // Handle component label dragging
      if (isDraggingLabel && draggingLabelId) {
        const pxPerCm = (state.gridSize * state.zoom) / 100;
        let dxCm = (pos.x - labelDragStart.x) / pxPerCm;
        let dyCm = (pos.y - labelDragStart.y) / pxPerCm;

        // For inside labels, the offset is applied in the component's local (rotated) space,
        // so counter-rotate the screen delta to match
        const labelInfo = componentLabelInfosRef.current.find(
          (info) => info.item.id === draggingLabelId
        );
        if (labelInfo?.isInside) {
          if (labelInfo.item.rotation) {
            const rad = -(labelInfo.item.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rdx = dxCm * cos - dyCm * sin;
            const rdy = dxCm * sin + dyCm * cos;
            dxCm = rdx;
            dyCm = rdy;
          }
          if (labelInfo.item.mirrored) {
            dxCm = -dxCm;
          }
        }

        onSetLabelOffset(draggingLabelId, {
          x: labelDragStart.offsetX + dxCm,
          y: labelDragStart.offsetY + dyCm,
        });
        return;
      }

      if (isDragging && state.selectedItemId) {
        const pxPerCm = (state.gridSize * state.zoom) / 100;
        const worldX = (pos.x - dragItemOffset.x - state.panOffset.x) / pxPerCm;
        const worldY = (pos.y - dragItemOffset.y - state.panOffset.y) / pxPerCm;
        const snappedX = Math.round(worldX / 5) * 5;
        const snappedY = Math.round(worldY / 5) * 5;

        // Check if it's furniture or label
        const furn = state.furniture.find((f) => f.id === state.selectedItemId);
        if (furn) {
          // Try to snap furniture to wall edges
          const tempItem = { ...furn, x: snappedX, y: snappedY };
          const otherFurniture = state.furniture.filter(f => f.id !== state.selectedItemId);
          const snapResult = snapFurnitureToNearest(tempItem, state.walls, otherFurniture);
          onMoveFurniture(state.selectedItemId, snapResult.x, snapResult.y);
          // Track snap indicator state
          setWallSnapEdges(snapResult.snappedWallEdges);
          setComponentSnapEdges(snapResult.snappedComponentEdges);
          // Trigger snap landing highlight on transition to snapped
          if (snapResult.didSnap && !prevDidSnap.current) {
            setSnapHighlightId(state.selectedItemId);
            if (snapHighlightTimer.current) clearTimeout(snapHighlightTimer.current);
            snapHighlightTimer.current = setTimeout(() => setSnapHighlightId(null), 150);
          }
          prevDidSnap.current = snapResult.didSnap;
          // Snap opening thickness to wall thickness
          const isOpening = furn.type === "door" || furn.type === "door_double" || furn.type === "window" || furn.type === "radiator";
          if (isOpening && snapResult.didSnap && snapResult.snappedWallThickness != null && furn.height !== snapResult.snappedWallThickness) {
            onUpdateFurniture(state.selectedItemId, { height: snapResult.snappedWallThickness });
          }
          return;
        }
        const lbl = state.labels.find((l) => l.id === state.selectedItemId);
        if (lbl) {
          onMoveLabel(state.selectedItemId, snappedX, snappedY);
        }
      }

      // Update wall snap indicator (check raw world position for accurate snap distance)
      if (state.selectedTool === "wall") {
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const { snapped: epSnapped, didSnap: epSnap } = snapToWallEndpoints(world, state.walls, 15);
        if (epSnap) {
          setWallSnapPoint(epSnapped);
        } else {
          const { snapped: bodySnapped, didSnap: bodySnap } = snapToWallBody(world, state.walls, 15);
          setWallSnapPoint(bodySnap ? bodySnapped : null);
        }
      }

      // Eraser hover detection
      if (state.selectedTool === "eraser") {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const hitFurn = hitTestFurniture(pos.x, pos.y, state.furniture, state.gridSize, state.zoom, state.panOffset);
        if (hitFurn) {
          setEraserHoverId(hitFurn.id);
        } else if (ctx) {
          const hitLbl = hitTestLabel(pos.x, pos.y, state.labels, state.gridSize, state.zoom, state.panOffset, ctx);
          if (hitLbl) {
            setEraserHoverId(hitLbl.id);
          } else {
            const hitArrowHover = hitTestArrow(pos.x, pos.y, state.arrows, state.gridSize, state.zoom, state.panOffset);
            if (hitArrowHover) {
              setEraserHoverId(hitArrowHover.id);
            } else {
              const hitW = hitTestWall(pos.x, pos.y, state.walls, state.gridSize, state.zoom, state.panOffset);
              setEraserHoverId(hitW ? hitW.id : null);
            }
          }
        } else {
          setEraserHoverId(null);
        }
      } else if (eraserHoverId) {
        setEraserHoverId(null);
      }
    },
    [state, isPanning, isDragging, isDraggingLabel, draggingLabelId, labelDragStart, isResizing, isRotating, rotateStartAngle, rotateItemStartRot, resizeStart, resizeCorner, dragStart, dragItemOffset, eraserHoverId, arrowDraggingEndpoint, isRotatingLabel, rotatingLabelId, labelRotateStartAngle, labelRotateItemStartRot, isResizingLabel, resizingLabelId, labelResizeStart, getCanvasPos, onSetPan, onSetZoom, onMoveFurniture, onMoveLabel, onUpdateFurniture, onUpdateArrow, onSetLabelOffset]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointerCache.current.delete(e.pointerId);
      if (pointerCache.current.size < 2) {
        prevPinchDist.current = null;
        prevPinchCenter.current = null;
      }

      // Commit pending wall on touch release (mobile drag-to-adjust)
      if (wallPendingCommitRef.current && state.selectedTool === "wall") {
        wallPendingCommitRef.current = false;
        const currentWallDrawing = wallDrawingRef.current;
        if (currentWallDrawing) {
          const pos = getCanvasPos(e);
          const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
          const gridSnapped = snapToGrid(world, 10);
          const { snapped: wallSnapped, didSnap: endpointSnap } = snapToWallEndpoints(world, state.walls, 15);
          const { snapped: bodySnapped, didSnap: bodySnap, wallId: bodyWallId } = snapToWallBody(world, state.walls, 15);
          const didSnap = endpointSnap || bodySnap;
          let finalPoint = endpointSnap ? wallSnapped : (bodySnap ? bodySnapped : gridSnapped);

          if (!didSnap) {
            const angleResult = snapAngle(currentWallDrawing.start, finalPoint, 15, 5);
            finalPoint = angleResult.snapped;
            finalPoint = snapToGrid(finalPoint, 10);
          }

          // Skip near-zero-length walls (accidental double-tap)
          const dx = finalPoint.x - currentWallDrawing.start.x;
          const dy = finalPoint.y - currentWallDrawing.start.y;
          if (Math.sqrt(dx * dx + dy * dy) < 2) {
            return;
          }

          if (bodySnap && !endpointSnap && bodyWallId) {
            onSplitWallAndConnect(bodyWallId, finalPoint, currentWallDrawing.start);
            onSetWallDrawing(null);
            wallDrawingRef.current = null;
          } else {
            onAddWall(currentWallDrawing.start, finalPoint);
            if (endpointSnap) {
              onSetWallDrawing(null);
              wallDrawingRef.current = null;
            } else {
              onSetWallDrawing({ start: finalPoint });
              wallDrawingRef.current = { start: finalPoint };
            }
          }
        }
        return;
      }

      if (isDragging) {
        onPushUndo();
        setWallSnapEdges([]);
        setComponentSnapEdges([]);
        prevDidSnap.current = false;
      }
      if (isDraggingLabel) {
        onPushUndo();
      }
      setIsDragging(false);
      setIsPanning(false);
      setIsResizing(false);
      setIsRotating(false);
      setResizeCorner(null);
      setResizeStart(null);
      setArrowDraggingEndpoint(null);
      setIsDraggingLabel(false);
      setDraggingLabelId(null);
      setIsRotatingLabel(false);
      setRotatingLabelId(null);
      setIsResizingLabel(false);
      setResizingLabelId(null);
      setLabelResizeStart(null);
    },
    [isDragging, isDraggingLabel, onPushUndo, state.selectedTool, state.gridSize, state.zoom, state.panOffset, state.walls, getCanvasPos, onAddWall, onSetWallDrawing, onSplitWallAndConnect]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // If Shift is held or actively drawing walls, pan instead of zoom
      if (e.shiftKey || (state.selectedTool === "wall" && state.wallDrawing)) {
        onSetPan({
          x: state.panOffset.x - e.deltaX - (e.shiftKey ? 0 : e.deltaY),
          y: state.panOffset.y - e.deltaY,
        });
        return;
      }

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.3, Math.min(3, state.zoom * delta));

      // Zoom towards mouse
      const pos = getCanvasPosMouse(e);
      const zoomRatio = newZoom / state.zoom;
      const newPanX = pos.x - (pos.x - state.panOffset.x) * zoomRatio;
      const newPanY = pos.y - (pos.y - state.panOffset.y) * zoomRatio;

      onSetZoom(newZoom);
      onSetPan({ x: newPanX, y: newPanY });
    },
    [state.zoom, state.panOffset, state.selectedTool, state.wallDrawing, getCanvasPosMouse, onSetZoom, onSetPan]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (state.selectedTool === "wall" && wallDrawingRef.current) {
        onSetWallDrawing(null);
        wallDrawingRef.current = null;
        wallPendingCommitRef.current = false;
        return;
      }

      // Double-click on label to edit inline
      if (state.selectedTool === "select") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        // Check room labels first
        const rooms = detectRooms(state.walls);
        const roomLabelPos = rooms.length > 0
          ? computeRoomLabelPositions(ctx, rooms, state.furniture, state.gridSize, state.zoom, state.roomNames, state.units)
          : new Map<string, Point>();
        const hitRoom = hitTestRoomLabel(pos.x, pos.y, rooms, state.gridSize, state.zoom, state.panOffset, state.roomNames, roomLabelPos);
        if (hitRoom) {
          const pxPerCm = (state.gridSize * state.zoom) / 100;
          const screenX = hitRoom.centroid.x * pxPerCm + state.panOffset.x;
          const screenY = hitRoom.centroid.y * pxPerCm + state.panOffset.y;
          const currentName = state.roomNames[hitRoom.roomKey] || "Room";
          setEditingLabel({ id: null, x: screenX, y: screenY, text: currentName, isNew: false, isRoomLabel: true, roomKey: hitRoom.roomKey });
          setSelectedRoomKey(hitRoom.roomKey);
          editingLabelWorldPos.current = hitRoom.centroid;
          setTimeout(() => labelInputRef.current?.focus(), 0);
          return;
        }

        // Check freeform labels
        const hitLbl = hitTestLabel(pos.x, pos.y, state.labels, state.gridSize, state.zoom, state.panOffset, ctx);
        if (hitLbl) {
          const pxPerCm = (state.gridSize * state.zoom) / 100;
          const screenX = hitLbl.x * pxPerCm + state.panOffset.x;
          const screenY = hitLbl.y * pxPerCm + state.panOffset.y;
          setEditingLabel({ id: hitLbl.id, x: screenX, y: screenY, text: hitLbl.text, isNew: false });
          editingLabelWorldPos.current = { x: hitLbl.x, y: hitLbl.y };
          setTimeout(() => labelInputRef.current?.focus(), 0);
          return;
        }

        // Check component labels (double-click to reset offset or rename)
        if (state.componentLabelsVisible) {
          // First check if double-clicking on a label — reset its offset
          const hitLabelItem = hitTestComponentLabel(pos.x, pos.y, componentLabelInfosRef.current);
          if (hitLabelItem) {
            const hasOffset = hitLabelItem.labelOffset && (hitLabelItem.labelOffset.x !== 0 || hitLabelItem.labelOffset.y !== 0);
            const hasCustomLabel = hitLabelItem.labelRotation || hitLabelItem.labelWidth || hitLabelItem.labelHeight;
            if (hasOffset || hasCustomLabel) {
              // Reset label to default position, rotation, and size
              onSetLabelOffset(hitLabelItem.id, { x: 0, y: 0 });
              onUpdateFurniture(hitLabelItem.id, { labelRotation: undefined, labelWidth: undefined, labelHeight: undefined });
              return;
            }
            // If no offset, fall through to rename behavior
            const pxPerCm = (state.gridSize * state.zoom) / 100;
            const centerX = (hitLabelItem.x + hitLabelItem.width / 2) * pxPerCm + state.panOffset.x;
            const labelY = (hitLabelItem.y + hitLabelItem.height) * pxPerCm + state.panOffset.y + 14 * state.zoom;
            const displayName = hitLabelItem.customName || hitLabelItem.label;
            setEditingLabel({ id: hitLabelItem.id, x: centerX, y: labelY, text: displayName, isNew: false });
            editingLabelWorldPos.current = { x: hitLabelItem.x + hitLabelItem.width / 2, y: hitLabelItem.y + hitLabelItem.height };
            setTimeout(() => labelInputRef.current?.focus(), 0);
            return;
          }

          const hitFurn = hitTestFurniture(pos.x, pos.y, state.furniture, state.gridSize, state.zoom, state.panOffset);
          if (hitFurn) {
            const pxPerCm = (state.gridSize * state.zoom) / 100;
            const centerX = (hitFurn.x + hitFurn.width / 2) * pxPerCm + state.panOffset.x;
            const labelY = (hitFurn.y + hitFurn.height) * pxPerCm + state.panOffset.y + 14 * state.zoom;
            const displayName = hitFurn.customName || hitFurn.label;
            setEditingLabel({ id: hitFurn.id, x: centerX, y: labelY, text: displayName, isNew: false });
            editingLabelWorldPos.current = { x: hitFurn.x + hitFurn.width / 2, y: hitFurn.y + hitFurn.height };
            setTimeout(() => labelInputRef.current?.focus(), 0);
            return;
          }
        }
      }
    },
    [state.selectedTool, state.wallDrawing, state.labels, state.walls, state.gridSize, state.zoom, state.panOffset, state.roomNames, state.componentLabelsVisible, state.furniture, onSetWallDrawing, onSetLabelOffset]
  );

  // Inline label editing handlers
  const commitLabel = useCallback(() => {
    const text = editingLabel.text.trim();
    if (editingLabel.isRoomLabel && editingLabel.roomKey) {
      // Renaming a room label
      if (text) {
        onSetRoomName(editingLabel.roomKey, text);
      }
      setSelectedRoomKey(null);
    } else if (editingLabel.isNew) {
      // New freeform label
      if (text) {
        onAddLabel(text, editingLabelWorldPos.current);
      }
    } else if (editingLabel.id) {
      // Check if this is a furniture rename
      const furn = state.furniture.find((f) => f.id === editingLabel.id);
      if (furn) {
        if (text) {
          onUpdateFurniture(editingLabel.id, { customName: text });
        }
      } else {
        // Freeform label update
        if (text) {
          onUpdateLabel(editingLabel.id, { text });
        }
      }
    }
    setEditingLabel({ id: null, x: 0, y: 0, text: "", isNew: false });
  }, [editingLabel, onAddLabel, onUpdateLabel, onSetRoomName, onUpdateFurniture, state.furniture]);

  const cancelLabel = useCallback(() => {
    setEditingLabel({ id: null, x: 0, y: 0, text: "", isNew: false });
    setSelectedRoomKey(null);
  }, []);

  const handleLabelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitLabel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelLabel();
    }
  }, [commitLabel, cancelLabel]);

  // Text box handlers
  const handleTextBoxSelect = useCallback((id: string) => {
    onSelectItem(id);
  }, [onSelectItem]);

  const handleTextBoxStartDrag = useCallback((id: string, offsetX: number, offsetY: number) => {
    setTextBoxDragging({ id, offsetX, offsetY });
  }, []);

  const handleTextBoxDoubleClick = useCallback((id: string) => {
    setEditingTextBoxId(id);
    onSelectItem(id);
  }, [onSelectItem]);

  const handleTextBoxExitEdit = useCallback(() => {
    setEditingTextBoxId(null);
  }, []);

  const handleTextBoxContentChange = useCallback((id: string, html: string) => {
    onUpdateTextBox(id, { content: html });
  }, [onUpdateTextBox]);

  const handleTextBoxStartResize = useCallback((id: string, corner: string, e: React.PointerEvent) => {
    const tb = state.textBoxes.find((t) => t.id === id);
    if (!tb) return;
    onPushUndoForTextBox();
    setTextBoxResizing({
      id,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      origX: tb.x,
      origY: tb.y,
      origW: tb.width,
      origH: tb.height,
    });
  }, [state.textBoxes, onPushUndoForTextBox]);

  const handleTextBoxStartRotate = useCallback((id: string, e: React.PointerEvent) => {
    const tb = state.textBoxes.find((t) => t.id === id);
    if (!tb) return;
    onPushUndoForTextBox();
    const pxPerCm = (state.gridSize * state.zoom) / 100;
    const centerX = (tb.x + tb.width / 2) * pxPerCm + state.panOffset.x;
    const centerY = (tb.y + tb.height / 2) * pxPerCm + state.panOffset.y;
    const canvasRect = containerRef.current?.getBoundingClientRect();
    const clientCenterX = centerX + (canvasRect?.left || 0);
    const clientCenterY = centerY + (canvasRect?.top || 0);
    const startAngle = Math.atan2(e.clientY - clientCenterY, e.clientX - clientCenterX);
    setTextBoxRotating({ id, startAngle, origRotation: tb.rotation, centerX: clientCenterX, centerY: clientCenterY });
  }, [state.textBoxes, state.gridSize, state.zoom, state.panOffset, onPushUndoForTextBox]);

  // Global pointer move/up for text box drag/resize/rotate
  useEffect(() => {
    if (!textBoxDragging && !textBoxResizing && !textBoxRotating) return;

    const pxPerCm = (state.gridSize * state.zoom) / 100;

    const handleMove = (e: PointerEvent) => {
      if (textBoxDragging) {
        const canvasRect = containerRef.current?.getBoundingClientRect();
        if (!canvasRect) return;
        const canvasX = e.clientX - canvasRect.left - textBoxDragging.offsetX;
        const canvasY = e.clientY - canvasRect.top - textBoxDragging.offsetY;
        const worldX = (canvasX - state.panOffset.x) / pxPerCm;
        const worldY = (canvasY - state.panOffset.y) / pxPerCm;
        const snappedX = Math.round(worldX / 5) * 5;
        const snappedY = Math.round(worldY / 5) * 5;
        onMoveTextBox(textBoxDragging.id, snappedX, snappedY);
      }

      if (textBoxResizing) {
        const dxPx = e.clientX - textBoxResizing.startX;
        const dyPx = e.clientY - textBoxResizing.startY;
        const dxCm = dxPx / pxPerCm;
        const dyCm = dyPx / pxPerCm;
        const corner = textBoxResizing.corner;
        const minW = 50;
        const minH = 30;
        let newW = textBoxResizing.origW;
        let newH = textBoxResizing.origH;
        let newX = textBoxResizing.origX;
        let newY = textBoxResizing.origY;

        if (corner === "br") { newW = Math.max(minW, textBoxResizing.origW + dxCm); newH = Math.max(minH, textBoxResizing.origH + dyCm); }
        else if (corner === "bl") { newW = Math.max(minW, textBoxResizing.origW - dxCm); newH = Math.max(minH, textBoxResizing.origH + dyCm); newX = textBoxResizing.origX + textBoxResizing.origW - newW; }
        else if (corner === "tr") { newW = Math.max(minW, textBoxResizing.origW + dxCm); newH = Math.max(minH, textBoxResizing.origH - dyCm); newY = textBoxResizing.origY + textBoxResizing.origH - newH; }
        else if (corner === "tl") { newW = Math.max(minW, textBoxResizing.origW - dxCm); newH = Math.max(minH, textBoxResizing.origH - dyCm); newX = textBoxResizing.origX + textBoxResizing.origW - newW; newY = textBoxResizing.origY + textBoxResizing.origH - newH; }
        else if (corner === "r") { newW = Math.max(minW, textBoxResizing.origW + dxCm); }
        else if (corner === "l") { newW = Math.max(minW, textBoxResizing.origW - dxCm); newX = textBoxResizing.origX + textBoxResizing.origW - newW; }
        else if (corner === "b") { newH = Math.max(minH, textBoxResizing.origH + dyCm); }
        else if (corner === "t") { newH = Math.max(minH, textBoxResizing.origH - dyCm); newY = textBoxResizing.origY + textBoxResizing.origH - newH; }

        onUpdateTextBox(textBoxResizing.id, { width: Math.round(newW), height: Math.round(newH), x: Math.round(newX), y: Math.round(newY) });
      }

      if (textBoxRotating) {
        const currentAngle = Math.atan2(e.clientY - textBoxRotating.centerY, e.clientX - textBoxRotating.centerX);
        let deltaDeg = ((currentAngle - textBoxRotating.startAngle) * 180) / Math.PI;
        let newRot = textBoxRotating.origRotation + deltaDeg;
        const snapDeg = 15;
        const nearestSnap = Math.round(newRot / snapDeg) * snapDeg;
        if (Math.abs(newRot - nearestSnap) < 3) newRot = nearestSnap;
        newRot = ((newRot % 360) + 360) % 360;
        onUpdateTextBox(textBoxRotating.id, { rotation: Math.round(newRot) });
      }
    };

    const handleUp = () => {
      if (textBoxDragging) {
        onPushUndoForTextBox();
      }
      setTextBoxDragging(null);
      setTextBoxResizing(null);
      setTextBoxRotating(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [textBoxDragging, textBoxResizing, textBoxRotating, state.gridSize, state.zoom, state.panOffset, onMoveTextBox, onUpdateTextBox, onPushUndoForTextBox]);

  // Handle furniture drop from library
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const data = e.dataTransfer.getData("application/json");
        if (!data) return;
        let template: FurnitureTemplate = JSON.parse(data);
        const pos = getCanvasPosMouse(e);
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const gridSnapped = snapToGrid(world, 10);
        // Try to snap to walls on drop (all items, not just openings)
        const tempItem: FurnitureItem = {
          id: "", type: template.type, label: template.label,
          x: gridSnapped.x - template.width / 2, y: gridSnapped.y - template.height / 2,
          width: template.width, height: template.height, rotation: 0, category: template.category,
        };
        const snapResult = snapFurnitureToNearest(tempItem, state.walls, state.furniture);
        const snapped = snapResult.didSnap
          ? { x: snapResult.x + template.width / 2, y: snapResult.y + template.height / 2 }
          : gridSnapped;
        // Snap opening thickness to wall thickness on drop
        const isOpening = template.type === "door" || template.type === "door_double" || template.type === "window" || template.type === "radiator";
        if (isOpening && snapResult.didSnap && snapResult.snappedWallThickness != null) {
          template = { ...template, height: snapResult.snappedWallThickness };
        }
        onDropFurniture(template, snapped);
      } catch {}
    },
    [state, getCanvasPosMouse, onDropFurniture]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Skip shortcuts when editing a contenteditable text box (except Escape)
      const isContentEditable = e.target instanceof HTMLElement && e.target.isContentEditable;
      if (isContentEditable && e.key !== "Escape") return;

      if (e.key === "Escape") {
        if (editingTextBoxId) {
          setEditingTextBoxId(null);
          return;
        }
        onSetWallDrawing(null);
        wallDrawingRef.current = null;
        wallPendingCommitRef.current = false;
        setArrowDrawingStart(null);
        onSelectItem(null);
        setSelectedRoomKey(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingTextBoxId) return; // Don't delete while editing text
        if (state.selectedItemId) {
          const furn = state.furniture.find((f) => f.id === state.selectedItemId);
          if (furn) onRemoveFurniture(state.selectedItemId);
          const wall = state.walls.find((w) => w.id === state.selectedItemId);
          if (wall) onRemoveWall(state.selectedItemId);
          const lbl = state.labels.find((l) => l.id === state.selectedItemId);
          if (lbl) onRemoveLabel(state.selectedItemId);
          const tb = state.textBoxes.find((t) => t.id === state.selectedItemId);
          if (tb) onRemoveTextBox(state.selectedItemId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedItemId, state.furniture, state.walls, state.labels, state.textBoxes, editingTextBoxId, onRemoveFurniture, onRemoveWall, onRemoveLabel, onRemoveTextBox, onSetWallDrawing, onSelectItem]);

  // Prevent native context menu so right-click can pan
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const cursorStyle = (() => {
    if (isPanning) return "grabbing";
    if (isRotatingLabel) return "grab";
    if (isResizingLabel) return "nwse-resize";
    if (isRotating) return "grab";
    if (isResizing) {
      if (resizeCorner === "t" || resizeCorner === "b") return "ns-resize";
      if (resizeCorner === "l" || resizeCorner === "r") return "ew-resize";
      if (resizeCorner === "tr" || resizeCorner === "bl") return "nesw-resize";
      return "nwse-resize";
    }
    if (state.selectedTool === "pan") return "grab";
    if (state.selectedTool === "wall") return "crosshair";
    if (state.selectedTool === "arrow") return "crosshair";
    if (state.selectedTool === "eraser") return "crosshair";
    if (state.selectedTool === "label") return "text";
    if (isDraggingLabel) return "grabbing";
    if (state.selectedTool === "select") return isDragging ? "grabbing" : "default";
    return "default";
  })();

  const isEditingLabel = editingLabel.id !== null || editingLabel.isNew || editingLabel.isRoomLabel;

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden select-none"
      data-testid="canvas-container"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: cursorStyle, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        data-testid="floor-plan-canvas"
      />
      {/* Text box overlays */}
      {state.textBoxes.map((tb) => (
        <RichTextBoxComponent
          key={tb.id}
          textBox={tb}
          isSelected={state.selectedItemId === tb.id}
          isEditMode={editingTextBoxId === tb.id}
          pxPerCm={(state.gridSize * state.zoom) / 100}
          panOffset={state.panOffset}
          zoom={state.zoom}
          containerRef={containerRef}
          onSelect={handleTextBoxSelect}
          onStartDrag={handleTextBoxStartDrag}
          onDoubleClick={handleTextBoxDoubleClick}
          onExitEdit={handleTextBoxExitEdit}
          onContentChange={handleTextBoxContentChange}
          onStartResize={handleTextBoxStartResize}
          onStartRotate={handleTextBoxStartRotate}
        />
      ))}
      {/* Inline label editing overlay */}
      {isEditingLabel && (
        <input
          ref={labelInputRef}
          type="text"
          value={editingLabel.text}
          onChange={(e) => setEditingLabel((prev) => ({ ...prev, text: e.target.value }))}
          onKeyDown={handleLabelKeyDown}
          onBlur={commitLabel}
          className="absolute bg-background border border-primary rounded px-2 py-1 text-sm outline-none shadow-md z-10"
          style={{
            left: editingLabel.x - 60,
            top: editingLabel.y - 14,
            width: 120,
            transform: "translateY(-50%)",
          }}
          placeholder={editingLabel.isRoomLabel ? "Room name..." : "Enter label..."}
        />
      )}
    </div>
  );
}
