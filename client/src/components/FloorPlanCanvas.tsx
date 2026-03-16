import { useRef, useEffect, useCallback, useState } from "react";
import { EditorState, Point, FurnitureTemplate, FurnitureItem, RoomLabel, UnitSystem, MeasureMode } from "../lib/types";
import {
  drawGrid,
  drawWalls,
  drawMeasurementIndicatorLines,
  drawFurniture,
  drawLabels,
  drawWallPreview,
  drawRoomAreas,
  drawResizeHandles,
  drawSnapIndicator,
  drawAlignmentGuides,
  drawDistanceMeasurements,
  drawEraserHighlight,
  hitTestRotateHandle,
  snapAngle,
  computeWallAngle,
  screenToWorld,
  snapToGrid,
  snapToWallEndpoints,
  snapToWallBody,
  snapFurnitureToWalls,
  hitTestWall,
  hitTestFurniture,
  hitTestLabel,
  hitTestResizeHandle,
  ResizeCorner,
} from "../lib/canvas-renderer";
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

  // Inline label editing state
  const [editingLabel, setEditingLabel] = useState<{ id: string | null; x: number; y: number; text: string; isNew: boolean }>({ id: null, x: 0, y: 0, text: "", isNew: false });
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

    // Room areas
    const rooms = detectRooms(state.walls);
    if (rooms.length > 0) {
      drawRoomAreas(ctx, rooms, state.gridSize, state.zoom, state.panOffset, isDark, state.units);
    }

    // Walls
    drawWalls(ctx, state.walls, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId, state.units, measureMode, state.furniture);

    // Measurement indicator lines (on top of walls, below labels/furniture)
    drawMeasurementIndicatorLines(ctx, state.walls, rooms, state.gridSize, state.zoom, state.panOffset, measureMode);

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
      if (!didSnap) {
        const angleResult = snapAngle(state.wallDrawing.start, finalPoint, 15, 5);
        finalPoint = angleResult.snapped;
        // Also snap to alignment guides
        const guideSnap = drawAlignmentGuides(ctx, finalPoint, state.walls, state.gridSize, state.zoom, state.panOffset, w, h, isDark);
        if (guideSnap.snapX !== null) finalPoint = { ...finalPoint, x: guideSnap.snapX };
        if (guideSnap.snapY !== null) finalPoint = { ...finalPoint, y: guideSnap.snapY };
        // Recompute angle after guide snap
        angleDeg = computeWallAngle(state.wallDrawing.start, finalPoint);
      } else {
        // Draw guides even when endpoint-snapped
        drawAlignmentGuides(ctx, finalPoint, state.walls, state.gridSize, state.zoom, state.panOffset, w, h, isDark);
        angleDeg = computeWallAngle(state.wallDrawing.start, finalPoint);
      }

      // Compute distance to decide whether to show preview line or just start dot
      const previewDx = finalPoint.x - state.wallDrawing.start.x;
      const previewDy = finalPoint.y - state.wallDrawing.start.y;
      const previewDist = Math.sqrt(previewDx * previewDx + previewDy * previewDy);

      if (previewDist < 5) {
        // Near-zero length: show only start point indicator (e.g. after first tap on mobile)
        drawSnapIndicator(ctx, state.wallDrawing.start, state.gridSize, state.zoom, state.panOffset);
      } else {
        drawWallPreview(ctx, state.wallDrawing.start, finalPoint, state.gridSize, state.zoom, state.panOffset, isDark, angleDeg, state.units);
        if (didSnap) {
          drawSnapIndicator(ctx, finalPoint, state.gridSize, state.zoom, state.panOffset);
        }
      }
    }

    // Furniture — draw non-door/window items first
    const regularFurniture = state.furniture.filter((f) => f.type !== "door" && f.type !== "window");
    drawFurniture(ctx, regularFurniture, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

    // Doors & windows render on top of walls so they overlay correctly
    const doorWindowItems = state.furniture.filter((f) => f.type === "door" || f.type === "window");
    drawFurniture(ctx, doorWindowItems, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

    // Resize handles and distance measurements for selected furniture
    const selectedFurn = state.furniture.find((f) => f.id === state.selectedItemId);
    if (selectedFurn && state.selectedTool === "select") {
      drawResizeHandles(ctx, selectedFurn, state.gridSize, state.zoom, state.panOffset);
      drawDistanceMeasurements(ctx, selectedFurn, state.walls, state.furniture, state.gridSize, state.zoom, state.panOffset, isDark, state.units);
    }

    // Labels
    drawLabels(ctx, state.labels, state.gridSize, state.zoom, state.panOffset, isDark, state.selectedItemId);

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

    // In imperial, show 1ft (0.3048m) instead of 1m
    const barPx = units === "imperial" ? meterPx * 0.3048 : meterPx;
    const barLabel = units === "imperial" ? "1 ft" : "1m";

    // For imperial, use 3ft bar for better visibility
    const displayPx = units === "imperial" ? meterPx * 0.9144 : meterPx;
    const displayLabel = units === "imperial" ? "3 ft" : "1m";

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

        const hitW = hitTestWall(pos.x, pos.y, state.walls, state.gridSize, state.zoom, state.panOffset);
        if (hitW) {
          onSelectItem(hitW.id);
          return;
        }

        onSelectItem(null);
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

        const hitW = hitTestWall(pos.x, pos.y, state.walls, state.gridSize, state.zoom, state.panOffset);
        if (hitW) { onRemoveWall(hitW.id); return; }
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
    [state, getCanvasPos, onSelectItem, onAddWall, onSetWallDrawing, onRemoveWall, onRemoveFurniture, onRemoveLabel, onPushUndo, onUpdateFurniture, onSplitWallAndConnect]
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
        const dxCm = dxPx / pxPerCm;
        const dyCm = dyPx / pxPerCm;

        // Doors/windows allow smaller height (thickness) than regular furniture
        const resizingItem = state.furniture.find((f) => f.id === state.selectedItemId);
        const isStructural = resizingItem && (resizingItem.type === "door" || resizingItem.type === "window");
        const minW = 20;
        const minH = isStructural ? 5 : 20;

        let newW = resizeStart.itemW;
        let newH = resizeStart.itemH;
        let newX = resizeStart.itemX;
        let newY = resizeStart.itemY;

        if (resizeCorner === "br") {
          newW = Math.max(minW, resizeStart.itemW + dxCm);
          newH = Math.max(minH, resizeStart.itemH + dyCm);
        } else if (resizeCorner === "bl") {
          newW = Math.max(minW, resizeStart.itemW - dxCm);
          newH = Math.max(minH, resizeStart.itemH + dyCm);
          newX = resizeStart.itemX + resizeStart.itemW - newW;
        } else if (resizeCorner === "tr") {
          newW = Math.max(minW, resizeStart.itemW + dxCm);
          newH = Math.max(minH, resizeStart.itemH - dyCm);
          newY = resizeStart.itemY + resizeStart.itemH - newH;
        } else if (resizeCorner === "tl") {
          newW = Math.max(minW, resizeStart.itemW - dxCm);
          newH = Math.max(minH, resizeStart.itemH - dyCm);
          newX = resizeStart.itemX + resizeStart.itemW - newW;
          newY = resizeStart.itemY + resizeStart.itemH - newH;
        }

        newW = Math.round(newW);
        newH = Math.round(newH);
        newX = Math.round(newX);
        newY = Math.round(newY);

        onUpdateFurniture(state.selectedItemId, { width: newW, height: newH, x: newX, y: newY });
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
          const wallSnap = snapFurnitureToWalls(tempItem, state.walls);
          onMoveFurniture(state.selectedItemId, wallSnap.x, wallSnap.y);
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
            const hitW = hitTestWall(pos.x, pos.y, state.walls, state.gridSize, state.zoom, state.panOffset);
            setEraserHoverId(hitW ? hitW.id : null);
          }
        } else {
          setEraserHoverId(null);
        }
      } else if (eraserHoverId) {
        setEraserHoverId(null);
      }
    },
    [state, isPanning, isDragging, isResizing, isRotating, rotateStartAngle, rotateItemStartRot, resizeStart, resizeCorner, dragStart, dragItemOffset, eraserHoverId, getCanvasPos, onSetPan, onSetZoom, onMoveFurniture, onMoveLabel, onUpdateFurniture]
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
      }
      setIsDragging(false);
      setIsPanning(false);
      setIsResizing(false);
      setIsRotating(false);
      setResizeCorner(null);
      setResizeStart(null);
    },
    [isDragging, onPushUndo, state.selectedTool, state.gridSize, state.zoom, state.panOffset, state.walls, getCanvasPos, onAddWall, onSetWallDrawing, onSplitWallAndConnect]
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

        const hitLbl = hitTestLabel(pos.x, pos.y, state.labels, state.gridSize, state.zoom, state.panOffset, ctx);
        if (hitLbl) {
          const pxPerCm = (state.gridSize * state.zoom) / 100;
          const screenX = hitLbl.x * pxPerCm + state.panOffset.x;
          const screenY = hitLbl.y * pxPerCm + state.panOffset.y;
          setEditingLabel({ id: hitLbl.id, x: screenX, y: screenY, text: hitLbl.text, isNew: false });
          editingLabelWorldPos.current = { x: hitLbl.x, y: hitLbl.y };
          setTimeout(() => labelInputRef.current?.focus(), 0);
        }
      }
    },
    [state.selectedTool, state.wallDrawing, state.labels, state.gridSize, state.zoom, state.panOffset, onSetWallDrawing]
  );

  // Inline label editing handlers
  const commitLabel = useCallback(() => {
    const text = editingLabel.text.trim();
    if (text) {
      if (editingLabel.isNew) {
        onAddLabel(text, editingLabelWorldPos.current);
      } else if (editingLabel.id) {
        onUpdateLabel(editingLabel.id, { text });
      }
    }
    setEditingLabel({ id: null, x: 0, y: 0, text: "", isNew: false });
  }, [editingLabel, onAddLabel, onUpdateLabel]);

  const cancelLabel = useCallback(() => {
    setEditingLabel({ id: null, x: 0, y: 0, text: "", isNew: false });
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
        const template: FurnitureTemplate = JSON.parse(data);
        const pos = getCanvasPosMouse(e);
        const world = screenToWorld(pos.x, pos.y, state.gridSize, state.zoom, state.panOffset);
        const snapped = snapToGrid(world, 10);
        onDropFurniture(template, snapped);
      } catch {}
    },
    [state, getCanvasPosMouse, onDropFurniture]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        onSetWallDrawing(null);
        wallDrawingRef.current = null;
        wallPendingCommitRef.current = false;
        onSelectItem(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedItemId) {
          const furn = state.furniture.find((f) => f.id === state.selectedItemId);
          if (furn) onRemoveFurniture(state.selectedItemId);
          const wall = state.walls.find((w) => w.id === state.selectedItemId);
          if (wall) onRemoveWall(state.selectedItemId);
          const lbl = state.labels.find((l) => l.id === state.selectedItemId);
          if (lbl) onRemoveLabel(state.selectedItemId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedItemId, state.furniture, state.walls, state.labels, onRemoveFurniture, onRemoveWall, onRemoveLabel, onSetWallDrawing, onSelectItem]);

  // Prevent native context menu so right-click can pan
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const cursorStyle = (() => {
    if (isPanning) return "grabbing";
    if (isRotating) return "grab";
    if (isResizing) return "nwse-resize";
    if (state.selectedTool === "pan") return "grab";
    if (state.selectedTool === "wall") return "crosshair";
    if (state.selectedTool === "eraser") return "crosshair";
    if (state.selectedTool === "label") return "text";
    if (state.selectedTool === "select") return isDragging ? "grabbing" : "default";
    return "default";
  })();

  const isEditingLabel = editingLabel.id !== null || editingLabel.isNew;

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
          placeholder="Enter label..."
        />
      )}
    </div>
  );
}
