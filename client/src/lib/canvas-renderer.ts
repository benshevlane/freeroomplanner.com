import { Wall, FurnitureItem, RoomLabel, Point } from "./types";

const GRID_COLOR_LIGHT = "#e8e5e0";
const GRID_COLOR_DARK = "#2a2928";
const GRID_ACCENT_LIGHT = "#d4d1ca";
const GRID_ACCENT_DARK = "#3a3938";
const WALL_COLOR_LIGHT = "#28251d";
const WALL_COLOR_DARK = "#cdccca";
const FURNITURE_FILL_LIGHT = "#f0ece6";
const FURNITURE_FILL_DARK = "#2a2826";
const FURNITURE_STROKE_LIGHT = "#7a7974";
const FURNITURE_STROKE_DARK = "#797876";
const DIMENSION_COLOR_LIGHT = "#01696f";
const DIMENSION_COLOR_DARK = "#4f98a3";
const SELECT_COLOR = "#01696f";

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean
) {
  const gridColor = isDark ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;
  const accentColor = isDark ? GRID_ACCENT_DARK : GRID_ACCENT_LIGHT;
  const step = gridSize * zoom;
  const smallStep = step / 10;

  const offsetX = panOffset.x % step;
  const offsetY = panOffset.y % step;
  const smallOffsetX = panOffset.x % smallStep;
  const smallOffsetY = panOffset.y % smallStep;

  // Small grid (10cm)
  if (smallStep > 8) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = smallOffsetX; x < width; x += smallStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = smallOffsetY; y < height; y += smallStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  // Major grid (1m)
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offsetX; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = offsetY; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null
) {
  const pxPerCm = (gridSize * zoom) / 100;

  walls.forEach((wall) => {
    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;

    const isSelected = wall.id === selectedId;

    ctx.strokeStyle = isSelected ? SELECT_COLOR : (isDark ? WALL_COLOR_DARK : WALL_COLOR_LIGHT);
    ctx.lineWidth = wall.thickness * pxPerCm;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Dimension label
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);
    if (lengthCm > 10) {
      const lengthM = (lengthCm / 100).toFixed(2);
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const angle = Math.atan2(ey - sy, ex - sx);
      const wallLengthPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);

      // Measure text width to decide placement strategy
      const baseFontSize = Math.max(11, 12 * zoom);
      const text = `${lengthM}m`;
      ctx.font = `500 ${baseFontSize}px 'General Sans', 'DM Sans', sans-serif`;
      const textWidth = ctx.measureText(text).width;
      const pad = 4;

      ctx.save();
      ctx.translate(mx, my);
      let textAngle = angle;
      if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
        textAngle += Math.PI;
      }
      ctx.rotate(textAngle);

      if (textWidth + pad * 2 < wallLengthPx - 4) {
        // Label fits inside the wall — draw centered on wall
        ctx.fillStyle = isDark ? "#1c1b19" : "#f9f8f5";
        ctx.fillRect(
          -textWidth / 2 - pad,
          -8 * zoom - pad,
          textWidth + pad * 2,
          16 * zoom + pad
        );
        ctx.fillStyle = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 0, 0);
      } else if (wallLengthPx > 15) {
        // Label doesn't fit — draw offset above/outside the wall
        const offsetY = -(wall.thickness * pxPerCm / 2) - baseFontSize - 2;
        ctx.fillStyle = isDark ? "#1c1b19" : "#f9f8f5";
        ctx.fillRect(
          -textWidth / 2 - pad,
          offsetY - baseFontSize * 0.4 - pad,
          textWidth + pad * 2,
          baseFontSize + pad * 2
        );
        ctx.fillStyle = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 0, offsetY);
      }
      // else: wall too tiny to label at all

      ctx.restore();
    }
  });
}

export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null
) {
  const pxPerCm = (gridSize * zoom) / 100;

  furniture.forEach((item) => {
    const x = item.x * pxPerCm + panOffset.x;
    const y = item.y * pxPerCm + panOffset.y;
    const w = item.width * pxPerCm;
    const h = item.height * pxPerCm;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((item.rotation * Math.PI) / 180);

    const isSelected = item.id === selectedId;

    // Fill
    ctx.fillStyle = isDark ? FURNITURE_FILL_DARK : FURNITURE_FILL_LIGHT;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Stroke
    ctx.strokeStyle = isSelected ? SELECT_COLOR : (isDark ? FURNITURE_STROKE_DARK : FURNITURE_STROKE_LIGHT);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash(isSelected ? [] : [4, 2]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);

    // Draw specific details based on type
    drawFurnitureDetail(ctx, item.type, w, h, isDark);

    // Label
    const fontSize = Math.max(9, Math.min(12 * zoom, w * 0.15));
    ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? "#9a9994" : "#5a5954";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const label = item.label;
    if (ctx.measureText(label).width < w - 8) {
      ctx.fillText(label, 0, 0);
    }

    // Dimensions below label
    const dimText = `${item.width}×${item.height}`;
    const dimFontSize = Math.max(8, fontSize * 0.8);
    ctx.font = `400 ${dimFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    if (ctx.measureText(dimText).width < w - 8) {
      ctx.fillText(dimText, 0, fontSize * 0.7);
    }

    ctx.restore();
  });
}

function drawFurnitureDetail(
  ctx: CanvasRenderingContext2D,
  type: string,
  w: number,
  h: number,
  isDark: boolean
) {
  const stroke = isDark ? "#5a5957" : "#bab9b4";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;

  switch (type) {
    case "bathtub":
      ctx.beginPath();
      const rx = w * 0.42;
      const ry = h * 0.4;
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "shower":
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      // Shower head dot
      ctx.beginPath();
      ctx.arc(-w * 0.25, -h * 0.25, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "toilet":
      ctx.beginPath();
      ctx.ellipse(0, h * 0.1, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = stroke;
      ctx.fillRect(-w * 0.35, -h * 0.45, w * 0.7, h * 0.15);
      break;
    case "basin":
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "bed_double":
    case "bed_king":
    case "bed_single":
      // Pillow(s)
      const pw = type === "bed_single" ? w * 0.7 : w * 0.38;
      const ph = h * 0.1;
      const py = -h * 0.38;
      if (type === "bed_single") {
        ctx.strokeRect(-pw / 2, py, pw, ph);
      } else {
        ctx.strokeRect(-w * 0.42, py, pw, ph);
        ctx.strokeRect(w * 0.42 - pw, py, pw, ph);
      }
      break;
    case "cooker":
      // Four burners
      const br = Math.min(w, h) * 0.14;
      ctx.beginPath();
      ctx.arc(-w * 0.2, -h * 0.2, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w * 0.2, -h * 0.2, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-w * 0.2, h * 0.2, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w * 0.2, h * 0.2, br, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "sink_k":
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "sofa_3":
    case "sofa_2":
      // Back
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(-w * 0.48, -h * 0.48, w * 0.96, h * 0.2);
      ctx.globalAlpha = 1;
      // Arms
      ctx.strokeRect(-w * 0.48, -h * 0.28, w * 0.1, h * 0.7);
      ctx.strokeRect(w * 0.38, -h * 0.28, w * 0.1, h * 0.7);
      break;
    case "dining_table_4":
    case "dining_table_6":
      // Table outline already drawn, just add line details
      ctx.beginPath();
      ctx.moveTo(-w * 0.4, 0);
      ctx.lineTo(w * 0.4, 0);
      ctx.stroke();
      break;
    case "door":
      // Draw door as a line with a 90° arc showing swing direction
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 2);
      ctx.stroke();
      // Arc for swing
      ctx.beginPath();
      ctx.arc(-w / 2, -h / 2, w, 0, Math.PI / 2);
      ctx.stroke();
      break;
    case "window":
      // Draw window as a line with glass rectangle indicator
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.stroke();
      // Glass pane indicator
      ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.15)" : "rgba(1, 105, 111, 0.1)";
      ctx.fillRect(-w * 0.4, -h * 0.35, w * 0.8, h * 0.7);
      ctx.strokeRect(-w * 0.4, -h * 0.35, w * 0.8, h * 0.7);
      // Center divider
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.35);
      ctx.lineTo(0, h * 0.35);
      ctx.stroke();
      break;
  }
}

export function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: RoomLabel[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null
) {
  const pxPerCm = (gridSize * zoom) / 100;

  labels.forEach((label) => {
    const x = label.x * pxPerCm + panOffset.x;
    const y = label.y * pxPerCm + panOffset.y;
    const isSelected = label.id === selectedId;

    ctx.font = `600 ${label.fontSize * zoom}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isSelected
      ? SELECT_COLOR
      : isDark ? "#797876" : "#7a7974";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, x, y);
  });
}

export function drawRoomAreas(
  ctx: CanvasRenderingContext2D,
  rooms: { vertices: Point[]; area: number; centroid: Point }[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean
) {
  const pxPerCm = (gridSize * zoom) / 100;

  rooms.forEach((room) => {
    // Draw semi-transparent fill
    ctx.beginPath();
    const firstVert = room.vertices[0];
    ctx.moveTo(
      firstVert.x * pxPerCm + panOffset.x,
      firstVert.y * pxPerCm + panOffset.y
    );
    for (let i = 1; i < room.vertices.length; i++) {
      ctx.lineTo(
        room.vertices[i].x * pxPerCm + panOffset.x,
        room.vertices[i].y * pxPerCm + panOffset.y
      );
    }
    ctx.closePath();
    ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.06)" : "rgba(1, 105, 111, 0.04)";
    ctx.fill();

    // Draw area text at centroid
    const cx = room.centroid.x * pxPerCm + panOffset.x;
    const cy = room.centroid.y * pxPerCm + panOffset.y;

    const text = `${room.area.toFixed(1)} m²`;
    const fontSize = Math.max(11, 13 * zoom);
    ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.6)" : "rgba(1, 105, 111, 0.5)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy);
  });
}

export function drawWallPreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const sx = start.x * pxPerCm + panOffset.x;
  const sy = start.y * pxPerCm + panOffset.y;
  const ex = end.x * pxPerCm + panOffset.x;
  const ey = end.y * pxPerCm + panOffset.y;

  ctx.strokeStyle = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
  ctx.lineWidth = 15 * pxPerCm; // 15cm wall
  ctx.lineCap = "round";
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  // Preview dimension
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthCm = Math.sqrt(dx * dx + dy * dy);
  if (lengthCm > 5) {
    const lengthM = (lengthCm / 100).toFixed(2);
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    ctx.font = `600 ${Math.max(12, 13 * zoom)}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${lengthM}m`, mx, my - 10);
  }
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  gridSize: number,
  zoom: number,
  panOffset: Point
): Point {
  const pxPerCm = (gridSize * zoom) / 100;
  return {
    x: (screenX - panOffset.x) / pxPerCm,
    y: (screenY - panOffset.y) / pxPerCm,
  };
}

export function snapToGrid(point: Point, snapSize: number): Point {
  return {
    x: Math.round(point.x / snapSize) * snapSize,
    y: Math.round(point.y / snapSize) * snapSize,
  };
}

export function snapToWallEndpoints(
  point: Point,
  walls: Wall[],
  threshold: number = 15
): { snapped: Point; didSnap: boolean } {
  let closest: Point | null = null;
  let closestDist = threshold;

  for (const wall of walls) {
    for (const ep of [wall.start, wall.end]) {
      const dx = point.x - ep.x;
      const dy = point.y - ep.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = ep;
      }
    }
  }

  if (closest) {
    return { snapped: { x: closest.x, y: closest.y }, didSnap: true };
  }
  return { snapped: point, didSnap: false };
}

export function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  point: Point,
  gridSize: number,
  zoom: number,
  panOffset: Point
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const sx = point.x * pxPerCm + panOffset.x;
  const sy = point.y * pxPerCm + panOffset.y;

  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.strokeStyle = "#01696f";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(1, 105, 111, 0.3)";
  ctx.fill();
}

export function hitTestWall(
  screenX: number,
  screenY: number,
  walls: Wall[],
  gridSize: number,
  zoom: number,
  panOffset: Point
): Wall | null {
  const pxPerCm = (gridSize * zoom) / 100;
  const threshold = 10; // px

  for (const wall of walls) {
    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;

    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;

    const t = Math.max(0, Math.min(1,
      ((screenX - sx) * dx + (screenY - sy) * dy) / (len * len)
    ));
    const closestX = sx + t * dx;
    const closestY = sy + t * dy;
    const dist = Math.sqrt(
      (screenX - closestX) ** 2 + (screenY - closestY) ** 2
    );

    if (dist < threshold + (wall.thickness * pxPerCm) / 2) {
      return wall;
    }
  }
  return null;
}

export function hitTestFurniture(
  screenX: number,
  screenY: number,
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point
): FurnitureItem | null {
  const pxPerCm = (gridSize * zoom) / 100;

  for (let i = furniture.length - 1; i >= 0; i--) {
    const item = furniture[i];
    const x = item.x * pxPerCm + panOffset.x;
    const y = item.y * pxPerCm + panOffset.y;
    const w = item.width * pxPerCm;
    const h = item.height * pxPerCm;

    // Transform screen point into item's local coordinate space
    const cx = x + w / 2;
    const cy = y + h / 2;
    const angle = -(item.rotation * Math.PI) / 180;
    const dx = screenX - cx;
    const dy = screenY - cy;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle);

    if (
      localX >= -w / 2 &&
      localX <= w / 2 &&
      localY >= -h / 2 &&
      localY <= h / 2
    ) {
      return item;
    }
  }
  return null;
}

export type ResizeCorner = "tl" | "tr" | "bl" | "br";

export function drawResizeHandles(
  ctx: CanvasRenderingContext2D,
  item: FurnitureItem,
  gridSize: number,
  zoom: number,
  panOffset: Point
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const x = item.x * pxPerCm + panOffset.x;
  const y = item.y * pxPerCm + panOffset.y;
  const w = item.width * pxPerCm;
  const h = item.height * pxPerCm;
  const handleSize = 8;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((item.rotation * Math.PI) / 180);

  const corners = [
    { cx: -w / 2, cy: -h / 2 },
    { cx: w / 2, cy: -h / 2 },
    { cx: -w / 2, cy: h / 2 },
    { cx: w / 2, cy: h / 2 },
  ];

  for (const corner of corners) {
    ctx.fillStyle = "#01696f";
    ctx.fillRect(
      corner.cx - handleSize / 2,
      corner.cy - handleSize / 2,
      handleSize,
      handleSize
    );
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      corner.cx - handleSize / 2,
      corner.cy - handleSize / 2,
      handleSize,
      handleSize
    );
  }

  ctx.restore();
}

export function hitTestResizeHandle(
  screenX: number,
  screenY: number,
  item: FurnitureItem,
  gridSize: number,
  zoom: number,
  panOffset: Point
): ResizeCorner | null {
  const pxPerCm = (gridSize * zoom) / 100;
  const x = item.x * pxPerCm + panOffset.x;
  const y = item.y * pxPerCm + panOffset.y;
  const w = item.width * pxPerCm;
  const h = item.height * pxPerCm;
  const handleSize = 10; // slightly larger for easier clicking

  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = -(item.rotation * Math.PI) / 180;
  const dx = screenX - cx;
  const dy = screenY - cy;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);

  const corners: { cx: number; cy: number; corner: ResizeCorner }[] = [
    { cx: -w / 2, cy: -h / 2, corner: "tl" },
    { cx: w / 2, cy: -h / 2, corner: "tr" },
    { cx: -w / 2, cy: h / 2, corner: "bl" },
    { cx: w / 2, cy: h / 2, corner: "br" },
  ];

  for (const c of corners) {
    if (
      Math.abs(localX - c.cx) <= handleSize &&
      Math.abs(localY - c.cy) <= handleSize
    ) {
      return c.corner;
    }
  }
  return null;
}

export function hitTestLabel(
  screenX: number,
  screenY: number,
  labels: RoomLabel[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  ctx: CanvasRenderingContext2D
): RoomLabel | null {
  const pxPerCm = (gridSize * zoom) / 100;

  for (const label of labels) {
    const x = label.x * pxPerCm + panOffset.x;
    const y = label.y * pxPerCm + panOffset.y;

    ctx.font = `600 ${label.fontSize * zoom}px 'General Sans', 'DM Sans', sans-serif`;
    const metrics = ctx.measureText(label.text);
    const w = metrics.width;
    const h = label.fontSize * zoom;

    if (
      screenX >= x - w / 2 &&
      screenX <= x + w / 2 &&
      screenY >= y - h / 2 &&
      screenY <= y + h / 2
    ) {
      return label;
    }
  }
  return null;
}
