import { Wall, FurnitureItem, RoomLabel, Arrow, ArrowHeadStyle, Point, UnitSystem, MeasureMode, LabelColor, isWallCupboard } from "./types";
import { DetectedRoom } from "./room-detection";

/** Convert cm to display string based on unit system */
function formatLength(cm: number, units: UnitSystem): string {
  switch (units) {
    case "ft": {
      const totalInches = cm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      if (inches === 12) return `${feet + 1}'0"`;
      if (feet === 0) return `${inches}"`;
      return `${feet}'${inches}"`;
    }
    case "cm":
      return `${Math.round(cm)}cm`;
    case "mm":
      return `${Math.round(cm * 10)}mm`;
    case "m":
    default:
      return `${(cm / 100).toFixed(2)}m`;
  }
}

/** Convert m² to display string based on unit system */
function formatArea(sqM: number, units: UnitSystem): string {
  switch (units) {
    case "ft": {
      const sqFt = sqM * 10.7639;
      return `${sqFt.toFixed(1)} sq ft`;
    }
    case "cm": {
      const sqCm = sqM * 10000;
      return `${sqCm.toFixed(0)} cm\u00B2`;
    }
    case "mm": {
      const sqMm = sqM * 1000000;
      return `${sqMm.toFixed(0)} mm\u00B2`;
    }
    case "m":
    default:
      return `${sqM.toFixed(1)} m\u00B2`;
  }
}

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

/** Simple component types that render as plain rectangles (no internal visual details) */
const SIMPLE_COMPONENT_TYPES = new Set([
  "worktop", "fridge", "dishwasher", "island",
  "coffee_table", "tv_unit", "bookshelf",
  "wardrobe",
]);

/** Component types whose labels should render inside the component rectangle */
const LABEL_INSIDE_TYPES = new Set([
  "worktop", "island", "fridge", "dishwasher",
  "tumble_dryer", "washing_machine", "kitchen_sink_d",
  "bed_king", "bed_superking",
  "sofa_3", "sofa_2", "sofa_l",
  "dining_table_4", "dining_table_6",
]);

/** Ray-casting point-in-polygon test (works for convex and concave polygons) */
function pointInPolygon(p: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Compute axis-aligned bounding box for a furniture item (world cm), accounting for rotation */
function getFurnitureAABB(item: FurnitureItem): { minX: number; minY: number; maxX: number; maxY: number } {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const hw = item.width / 2;
  const hh = item.height / 2;
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Rotate the 4 corners and find enclosing AABB
  const corners = [
    { x: -hw, y: -hh }, { x: hw, y: -hh },
    { x: hw, y: hh }, { x: -hw, y: hh },
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const rx = cx + c.x * cos - c.y * sin;
    const ry = cy + c.x * sin + c.y * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return { minX, minY, maxX, maxY };
}

/** Check if two AABBs overlap */
function aabbOverlap(
  aMinX: number, aMinY: number, aMaxX: number, aMaxY: number,
  bMinX: number, bMinY: number, bMaxX: number, bMaxY: number
): boolean {
  return aMinX < bMaxX && aMaxX > bMinX && aMinY < bMaxY && aMaxY > bMinY;
}

/**
 * Pre-compute optimal room label positions that avoid furniture.
 * Returns a Map from roomKey to world-coordinate position (cm).
 */
export function computeRoomLabelPositions(
  ctx: CanvasRenderingContext2D,
  rooms: DetectedRoom[],
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  roomNames: Record<string, string>,
  units: UnitSystem = "m"
): Map<string, Point> {
  const result = new Map<string, Point>();
  const pxPerCm = (gridSize * zoom) / 100;

  // Pre-compute all furniture AABBs
  const furnitureAABBs = furniture.map(getFurnitureAABB);

  for (const room of rooms) {
    const roomKey = getRoomKey(room);
    const roomName = roomNames[roomKey] || "Room";

    // Compute room bounding box (world cm)
    let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
    for (const v of room.vertices) {
      if (v.x < rMinX) rMinX = v.x;
      if (v.x > rMaxX) rMaxX = v.x;
      if (v.y < rMinY) rMinY = v.y;
      if (v.y > rMaxY) rMaxY = v.y;
    }

    // Compute label dimensions in world cm (mirror the adaptive sizing in drawRoomAreas)
    let nameFontSize = Math.max(11, 14 * zoom);
    let areaFontSize = Math.max(9, 11 * zoom);
    ctx.font = `600 ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const nameWidth = ctx.measureText(roomName).width;
    ctx.font = `500 ${areaFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const areaText = formatArea(room.area, units);
    const areaWidth = ctx.measureText(areaText).width;
    const maxTextWidth = Math.max(nameWidth, areaWidth);
    const totalHeight = nameFontSize + areaFontSize + 4;

    const roomWidthPx = (rMaxX - rMinX) * pxPerCm;
    const roomHeightPx = (rMaxY - rMinY) * pxPerCm;
    if (maxTextWidth > roomWidthPx * 0.85 || totalHeight > roomHeightPx * 0.7) {
      const scaleFactor = Math.min(
        (roomWidthPx * 0.8) / (maxTextWidth || 1),
        (roomHeightPx * 0.6) / (totalHeight || 1),
        1
      );
      const clampedScale = Math.max(0.4, Math.min(1, scaleFactor));
      nameFontSize *= clampedScale;
      areaFontSize *= clampedScale;
    }

    // Convert label dimensions to world cm (half-extents)
    const labelHalfW = (Math.max(nameWidth, areaWidth) / pxPerCm) / 2 + 10; // 10cm padding
    const labelHalfH = ((nameFontSize + areaFontSize + 4) / pxPerCm) / 2 + 5;

    // Filter furniture to those overlapping the room bounding box
    const relevantAABBs: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
    for (const aabb of furnitureAABBs) {
      if (aabbOverlap(rMinX, rMinY, rMaxX, rMaxY, aabb.minX, aabb.minY, aabb.maxX, aabb.maxY)) {
        relevantAABBs.push(aabb);
      }
    }

    // Fast path: test centroid
    const centroid = room.centroid;
    const labelAtCentroid = !relevantAABBs.some(aabb =>
      aabbOverlap(
        centroid.x - labelHalfW, centroid.y - labelHalfH,
        centroid.x + labelHalfW, centroid.y + labelHalfH,
        aabb.minX, aabb.minY, aabb.maxX, aabb.maxY
      )
    );

    if (labelAtCentroid || relevantAABBs.length === 0) {
      result.set(roomKey, centroid);
      continue;
    }

    // Slow path: grid-sample candidate positions
    const STEPS = 15;
    const stepX = (rMaxX - rMinX) / STEPS;
    const stepY = (rMaxY - rMinY) / STEPS;
    let bestCandidate: Point | null = null;
    let bestDist = Infinity;

    for (let xi = 0; xi <= STEPS; xi++) {
      for (let yi = 0; yi <= STEPS; yi++) {
        const px = rMinX + xi * stepX;
        const py = rMinY + yi * stepY;

        // Must be inside the room polygon
        if (!pointInPolygon({ x: px, y: py }, room.vertices)) continue;

        // Must not overlap any furniture
        const overlaps = relevantAABBs.some(aabb =>
          aabbOverlap(
            px - labelHalfW, py - labelHalfH,
            px + labelHalfW, py + labelHalfH,
            aabb.minX, aabb.minY, aabb.maxX, aabb.maxY
          )
        );
        if (overlaps) continue;

        // Pick candidate closest to centroid
        const dist = (px - centroid.x) ** 2 + (py - centroid.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestCandidate = { x: px, y: py };
        }
      }
    }

    result.set(roomKey, bestCandidate || centroid);
  }

  return result;
}

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

/** Check if a wall (defined by start/end/thickness) has any door/window occupants */
function getWallOccupants(
  wallStart: Point, wallEnd: Point, wallThick: number,
  doorsWindows: FurnitureItem[]
): { along: number; halfExtent: number }[] {
  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wallLen = Math.sqrt(wdx * wdx + wdy * wdy);
  if (wallLen < 10) return [];
  const wallDirX = wdx / wallLen;
  const wallDirY = wdy / wallLen;
  const wallNormX = -wallDirY;
  const wallNormY = wallDirX;

  const occupants: { along: number; halfExtent: number }[] = [];
  for (const item of doorsWindows) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const relX = cx - wallStart.x;
    const relY = cy - wallStart.y;
    const along = relX * wallDirX + relY * wallDirY;
    const perp = Math.abs(relX * wallNormX + relY * wallNormY);
    const threshold = wallThick + Math.max(item.width, item.height);
    if (perp > threshold) continue;
    const halfExtent = Math.max(item.width, item.height) / 2;
    if (along + halfExtent > 0 && along - halfExtent < wallLen) {
      occupants.push({ along, halfExtent });
    }
  }
  return occupants;
}

/**
 * Find groups of collinear walls (same direction, sharing endpoints)
 * and return merged measurement info so we show one combined label.
 */
function findCollinearGroups(walls: Wall[]): Map<string, { totalLengthCm: number; wallIds: Set<string>; minP: Point; maxP: Point }> {
  // Build adjacency: for each endpoint, find walls connected there
  const groups = new Map<string, { totalLengthCm: number; wallIds: Set<string>; minP: Point; maxP: Point }>();

  // Helper: compute normalized direction (unit vector or close)
  function wallDir(w: Wall): { dx: number; dy: number } {
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return { dx: 0, dy: 0 };
    return { dx: dx / len, dy: dy / len };
  }

  // Check if two walls are collinear (same line, shared endpoint)
  function areCollinear(a: Wall, b: Wall): boolean {
    const da = wallDir(a);
    const db = wallDir(b);
    // Directions must be parallel (dot product of normals ~ 0 means same line)
    const cross = Math.abs(da.dx * db.dy - da.dy * db.dx);
    if (cross > 0.01) return false; // not parallel

    // Must share an endpoint
    const eps = 0.5;
    const shareEndpoint =
      (Math.abs(a.end.x - b.start.x) < eps && Math.abs(a.end.y - b.start.y) < eps) ||
      (Math.abs(a.start.x - b.end.x) < eps && Math.abs(a.start.y - b.end.y) < eps) ||
      (Math.abs(a.start.x - b.start.x) < eps && Math.abs(a.start.y - b.start.y) < eps) ||
      (Math.abs(a.end.x - b.end.x) < eps && Math.abs(a.end.y - b.end.y) < eps);
    return shareEndpoint;
  }

  // Union-find to group collinear connected walls
  const parent = new Map<string, string>();
  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (areCollinear(walls[i], walls[j])) {
        union(walls[i].id, walls[j].id);
      }
    }
  }

  // Build groups
  const groupMap = new Map<string, Wall[]>();
  for (const w of walls) {
    const root = find(w.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(w);
  }

  // For groups with 2+ walls, compute merged info
  for (const [root, wallList] of groupMap) {
    if (wallList.length < 2) continue;

    // Collect all points, find the two extreme points along the line
    const points: Point[] = [];
    const wallIds = new Set<string>();
    for (const w of wallList) {
      points.push(w.start, w.end);
      wallIds.add(w.id);
    }

    // Project all points onto the wall direction to find min/max
    const dir = wallDir(wallList[0]);
    let minProj = Infinity, maxProj = -Infinity;
    let minP = points[0], maxP = points[0];
    for (const p of points) {
      const proj = p.x * dir.dx + p.y * dir.dy;
      if (proj < minProj) { minProj = proj; minP = p; }
      if (proj > maxProj) { maxProj = proj; maxP = p; }
    }

    const totalLengthCm = Math.sqrt((maxP.x - minP.x) ** 2 + (maxP.y - minP.y) ** 2);
    groups.set(root, { totalLengthCm, wallIds, minP, maxP });
  }

  return groups;
}

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null,
  units: UnitSystem = "m",
  measureMode: MeasureMode = "inside",
  furniture: FurnitureItem[] = [],
  rooms: DetectedRoom[] = []
) {
  const pxPerCm = (gridSize * zoom) / 100;

  // Find collinear wall groups for merged labels
  const collinearGroups = findCollinearGroups(walls);
  const mergedWallIds = new Set<string>();
  for (const group of collinearGroups.values()) {
    for (const id of group.wallIds) mergedWallIds.add(id);
  }

  // Draw all walls as solid-filled polygons (architectural style)
  // First pass: draw filled wall rectangles
  walls.forEach((wall) => {
    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;

    const isSelected = wall.id === selectedId;
    const halfThick = (wall.thickness * pxPerCm) / 2;

    // Compute perpendicular offset for wall polygon corners
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    const nx = (-dy / len) * halfThick; // perpendicular normal x
    const ny = (dx / len) * halfThick;  // perpendicular normal y

    const fillColor = isSelected ? SELECT_COLOR : (isDark ? WALL_COLOR_DARK : WALL_COLOR_LIGHT);

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(sx + nx, sy + ny);
    ctx.lineTo(sx - nx, sy - ny);
    ctx.lineTo(ex - nx, ey - ny);
    ctx.lineTo(ex + nx, ey + ny);
    ctx.closePath();
    ctx.fill();
  });

  // Second pass: fill junction squares where walls meet (avoids gaps at corners)
  const CONNECT_THRESHOLD = 15; // cm, same as wall snap threshold
  const endpointMap = new Map<string, { x: number; y: number; thickness: number }[]>();
  walls.forEach((wall) => {
    const points = [
      { x: wall.start.x, y: wall.start.y },
      { x: wall.end.x, y: wall.end.y },
    ];
    points.forEach((pt) => {
      const key = `${Math.round(pt.x / CONNECT_THRESHOLD) * CONNECT_THRESHOLD},${Math.round(pt.y / CONNECT_THRESHOLD) * CONNECT_THRESHOLD}`;
      if (!endpointMap.has(key)) endpointMap.set(key, []);
      endpointMap.get(key)!.push({ ...pt, thickness: wall.thickness });
    });
  });
  endpointMap.forEach((endpoints) => {
    if (endpoints.length < 2) return;
    // Draw a filled circle at the junction to cover corner gaps
    const avgX = endpoints.reduce((s, e) => s + e.x, 0) / endpoints.length;
    const avgY = endpoints.reduce((s, e) => s + e.y, 0) / endpoints.length;
    const maxThick = Math.max(...endpoints.map((e) => e.thickness));
    const halfThick = (maxThick * pxPerCm) / 2;
    const px = avgX * pxPerCm + panOffset.x;
    const py = avgY * pxPerCm + panOffset.y;

    ctx.fillStyle = isDark ? WALL_COLOR_DARK : WALL_COLOR_LIGHT;
    ctx.beginPath();
    ctx.arc(px, py, halfThick, 0, Math.PI * 2);
    ctx.fill();
  });

  // Identify doors/windows for occupant checks
  const doorsWindows = furniture.filter((f) => f.type === "door" || f.type === "door_double" || f.type === "window");

  // Draw individual labels for non-merged walls (skip if wall has door/window occupants — total shown separately)
  walls.forEach((wall) => {
    if (mergedWallIds.has(wall.id)) return; // will be labeled by group

    const wallThick = wall.thickness || 15;

    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);
    const displayLengthCm = measureMode === "inside"
      ? Math.max(0, lengthCm - wallThick)
      : lengthCm;
    if (lengthCm > 10) {
      drawWallDimensionLabel(ctx, sx, sy, ex, ey, displayLengthCm, wall.thickness * pxPerCm, zoom, isDark, units, wall, furniture, gridSize, panOffset, rooms, walls, measureMode);
    }
  });

  // Draw merged labels for collinear groups (skip if group has door/window occupants)
  for (const group of collinearGroups.values()) {
    const thickness = walls[0]?.thickness ?? 15;

    const sx = group.minP.x * pxPerCm + panOffset.x;
    const sy = group.minP.y * pxPerCm + panOffset.y;
    const ex = group.maxP.x * pxPerCm + panOffset.x;
    const ey = group.maxP.y * pxPerCm + panOffset.y;
    const displayLengthCm = measureMode === "inside"
      ? Math.max(0, group.totalLengthCm - thickness)
      : group.totalLengthCm;
    // Find the actual wall for collision detection
    const groupWallIds = group.wallIds;
    const representativeWall = walls.find((w) => groupWallIds.has(w.id)) || walls[0];
    drawWallDimensionLabel(ctx, sx, sy, ex, ey, displayLengthCm, thickness * pxPerCm, zoom, isDark, units, representativeWall, furniture, gridSize, panOffset, rooms, walls, measureMode);
  }
}

/** Draw the total wall length as a solid dimension line on the opposite side from segment measurements.
 *  Used when a wall has doors/windows to clearly distinguish total length from segment lengths.
 */
function drawTotalWallDimensionLine(
  ctx: CanvasRenderingContext2D,
  wallStart: Point, wallEnd: Point,
  displayLengthCm: number, wallThicknessCm: number,
  pxPerCm: number, panOffset: Point,
  zoom: number, isDark: boolean,
  units: UnitSystem, color: string,
  measureMode: MeasureMode = "inside"
) {
  const sx = wallStart.x * pxPerCm + panOffset.x;
  const sy = wallStart.y * pxPerCm + panOffset.y;
  const ex = wallEnd.x * pxPerCm + panOffset.x;
  const ey = wallEnd.y * pxPerCm + panOffset.y;

  const angle = Math.atan2(ey - sy, ex - sx);
  const wallThickPx = wallThicknessCm * pxPerCm;

  // Inset endpoints along wall direction for inside mode
  const halfThick = wallThicknessCm / 2;
  const inset = measureMode === "inside" ? halfThick * pxPerCm : 0;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const isx = sx + dirX * inset;
  const isy = sy + dirY * inset;
  const iex = ex - dirX * inset;
  const iey = ey - dirY * inset;

  const segLenPx = Math.sqrt((iex - isx) ** 2 + (iey - isy) ** 2);

  // Offset to opposite side (negative normal) from segment measurements
  const offsetDist = -(wallThickPx / 2 + 8 * zoom);
  const normX = -Math.sin(angle);
  const normY = Math.cos(angle);

  const osx = isx + normX * offsetDist;
  const osy = isy + normY * offsetDist;
  const oex = iex + normX * offsetDist;
  const oey = iey + normY * offsetDist;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  // Solid line (not dashed) to distinguish from segment measurements
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(osx, osy);
  ctx.lineTo(oex, oey);
  ctx.stroke();

  // End ticks perpendicular to line
  const tickLen = 4;
  ctx.beginPath();
  ctx.moveTo(osx - normX * tickLen, osy - normY * tickLen);
  ctx.lineTo(osx + normX * tickLen, osy + normY * tickLen);
  ctx.moveTo(oex - normX * tickLen, oey - normY * tickLen);
  ctx.lineTo(oex + normX * tickLen, oey + normY * tickLen);
  ctx.stroke();

  // Label
  const text = formatLength(displayLengthCm, units);
  const baseFontSize = Math.max(10, 11 * zoom);
  ctx.font = `600 ${baseFontSize}px 'General Sans', 'DM Sans', sans-serif`;
  const textW = ctx.measureText(text).width;
  const pad = 3;

  if (textW + pad * 2 < segLenPx + 10) {
    const mx = (osx + oex) / 2;
    const my = (osy + oey) / 2;

    ctx.save();
    ctx.translate(mx, my);
    let textAngle = angle;
    if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
      textAngle += Math.PI;
    }
    ctx.rotate(textAngle);

    ctx.fillStyle = isDark ? "rgba(28, 27, 25, 0.85)" : "rgba(249, 248, 245, 0.85)";
    ctx.fillRect(-textW / 2 - pad, -baseFontSize / 2 - pad, textW + pad * 2, baseFontSize + pad * 2);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/** Draw segment measurements for walls that have doors/windows on them.
 *  Shows distances from each door/window edge to the wall endpoints using dashed lines.
 */
export function drawWallSegmentMeasurements(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  units: UnitSystem = "m",
  measureMode: MeasureMode = "inside"
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const color = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
  const doorsWindows = furniture.filter((f) => f.type === "door" || f.type === "door_double" || f.type === "window");
  if (doorsWindows.length === 0) return;

  // Wall inside measurements are always shown via drawWalls(); no segment breakdown needed.
  return;

  // Find collinear wall groups so we measure segments against the full merged wall
  const collinearGroups = findCollinearGroups(walls);
  const mergedWallIds = new Set<string>();
  for (const group of collinearGroups.values()) {
    for (const id of group.wallIds) mergedWallIds.add(id);
  }

  // Helper: draw a segment measurement along a wall between two points
  function drawSegment(
    startPt: Point, endPt: Point, wallThicknessCm: number
  ) {
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const distCm = Math.sqrt(dx * dx + dy * dy);
    if (distCm < 5) return; // too short to label

    const sx = startPt.x * pxPerCm + panOffset.x;
    const sy = startPt.y * pxPerCm + panOffset.y;
    const ex = endPt.x * pxPerCm + panOffset.x;
    const ey = endPt.y * pxPerCm + panOffset.y;
    const segLenPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);

    // Draw dashed line along the wall (offset perpendicular so it doesn't overlap the wall label)
    const angle = Math.atan2(ey - sy, ex - sx);
    const wallThickPx = wallThicknessCm * pxPerCm;
    const offsetDist = wallThickPx / 2 + 8 * zoom;
    const normX = -Math.sin(angle);
    const normY = Math.cos(angle);

    const osx = sx + normX * offsetDist;
    const osy = sy + normY * offsetDist;
    const oex = ex + normX * offsetDist;
    const oey = ey + normY * offsetDist;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(osx, osy);
    ctx.lineTo(oex, oey);
    ctx.stroke();
    ctx.setLineDash([]);

    // End ticks perpendicular to segment
    const tickLen = 4;
    ctx.beginPath();
    ctx.moveTo(osx - normX * tickLen, osy - normY * tickLen);
    ctx.lineTo(osx + normX * tickLen, osy + normY * tickLen);
    ctx.moveTo(oex - normX * tickLen, oey - normY * tickLen);
    ctx.lineTo(oex + normX * tickLen, oey + normY * tickLen);
    ctx.stroke();

    // Label
    const text = formatLength(distCm, units);
    const baseFontSize = Math.max(10, 11 * zoom);
    ctx.font = `500 ${baseFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const textW = ctx.measureText(text).width;
    const pad = 3;

    // Only draw if text fits reasonably
    if (textW + pad * 2 < segLenPx + 10) {
      const mx = (osx + oex) / 2;
      const my = (osy + oey) / 2;

      ctx.save();
      ctx.translate(mx, my);
      let textAngle = angle;
      if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
        textAngle += Math.PI;
      }
      ctx.rotate(textAngle);

      ctx.fillStyle = isDark ? "rgba(28, 27, 25, 0.85)" : "rgba(249, 248, 245, 0.85)";
      ctx.fillRect(-textW / 2 - pad, -baseFontSize / 2 - pad, textW + pad * 2, baseFontSize + pad * 2);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  // Process each effective wall (individual or merged group)
  const processedGroupKeys = new Set<string>();

  for (const wall of walls) {
    let wallStart: Point;
    let wallEnd: Point;
    let wallThick: number;

    if (mergedWallIds.has(wall.id)) {
      // Find the group for this wall
      let groupKey: string | null = null;
      for (const [key, group] of collinearGroups.entries()) {
        if (group.wallIds.has(wall.id)) {
          groupKey = key;
          break;
        }
      }
      if (!groupKey || processedGroupKeys.has(groupKey)) continue;
      processedGroupKeys.add(groupKey);
      const group = collinearGroups.get(groupKey)!;
      wallStart = group.minP;
      wallEnd = group.maxP;
      wallThick = wall.thickness || 15;
    } else {
      wallStart = wall.start;
      wallEnd = wall.end;
      wallThick = wall.thickness || 15;
    }

    const wdx = wallEnd.x - wallStart.x;
    const wdy = wallEnd.y - wallStart.y;
    const wallLen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wallLen < 10) continue;
    const wallDirX = wdx / wallLen;
    const wallDirY = wdy / wallLen;
    const wallNormX = -wallDirY;
    const wallNormY = wallDirX;

    // Find doors/windows on this effective wall
    const occupants = getWallOccupants(wallStart, wallEnd, wallThick, doorsWindows);

    if (occupants.length === 0) continue;

    // Sort occupants by position along wall
    occupants.sort((a, b) => a.along - b.along);

    // Compute segments: wall start -> first door edge, between doors, last door edge -> wall end
    // In inside mode, inset segment boundaries by half wall thickness at each wall end
    const halfThick = wallThick / 2;
    const wallStartAlong = measureMode === "inside" ? halfThick : 0;
    const wallEndAlong = measureMode === "inside" ? wallLen - halfThick : wallLen;
    const segments: { startAlong: number; endAlong: number }[] = [];
    let prevEnd = wallStartAlong;
    for (const occ of occupants) {
      const edgeStart = occ.along - occ.halfExtent;
      const edgeEnd = occ.along + occ.halfExtent;
      if (edgeStart > prevEnd + 1) {
        segments.push({ startAlong: prevEnd, endAlong: edgeStart });
      }
      prevEnd = Math.max(prevEnd, edgeEnd);
    }
    if (wallEndAlong - prevEnd > 1) {
      segments.push({ startAlong: prevEnd, endAlong: wallEndAlong });
    }

    // Draw each segment
    for (const seg of segments) {
      const startPt: Point = {
        x: wallStart.x + wallDirX * seg.startAlong,
        y: wallStart.y + wallDirY * seg.startAlong,
      };
      const endPt: Point = {
        x: wallStart.x + wallDirX * seg.endAlong,
        y: wallStart.y + wallDirY * seg.endAlong,
      };
      drawSegment(startPt, endPt, wallThick);
    }

    // Draw total wall length as a dimension line on the opposite side from segments
    const displayLengthCm = measureMode === "inside"
      ? Math.max(0, wallLen - wallThick)
      : wallLen;
    drawTotalWallDimensionLine(
      ctx, wallStart, wallEnd, displayLengthCm, wallThick,
      pxPerCm, panOffset, zoom, isDark, units, color, measureMode
    );
  }
}

/** Draw thin green indicator lines showing which wall face is being measured */
export function drawMeasurementIndicatorLines(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  rooms: DetectedRoom[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  measureMode: MeasureMode
) {
  if (walls.length === 0) return;
  const pxPerCm = (gridSize * zoom) / 100;
  const INDICATOR_COLOR = "#2ecc71";

  // Compute a fallback "center" from all wall endpoints for walls not in any room
  let fallbackCenter = { x: 0, y: 0 };
  let pointCount = 0;
  for (const wall of walls) {
    fallbackCenter.x += wall.start.x + wall.end.x;
    fallbackCenter.y += wall.start.y + wall.end.y;
    pointCount += 2;
  }
  if (pointCount > 0) {
    fallbackCenter.x /= pointCount;
    fallbackCenter.y /= pointCount;
  }

  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 10) continue; // skip very short walls that have no measurement label

    // Normal vector (left-hand perpendicular to wall direction)
    const nx = -dy / len;
    const ny = dx / len;

    // Determine which normal direction is "inside" (toward room interior)
    let insideNx = nx;
    let insideNy = ny;

    const wallMid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };

    let foundRoom = false;
    // For walls shared between nested rooms, use the largest room to determine
    // the "inside" direction so that "full" mode measures from the correct (outer) side.
    let bestRoom: DetectedRoom | null = null;
    for (const room of rooms) {
      // Check if both endpoints of this wall are vertices of this room
      const hasStart = room.vertices.some(v =>
        Math.sqrt((v.x - wall.start.x) ** 2 + (v.y - wall.start.y) ** 2) < 15
      );
      const hasEnd = room.vertices.some(v =>
        Math.sqrt((v.x - wall.end.x) ** 2 + (v.y - wall.end.y) ** 2) < 15
      );

      if (hasStart && hasEnd) {
        if (!bestRoom || room.area > bestRoom.area) {
          bestRoom = room;
        }
      }
    }
    if (bestRoom) {
      const toCentroid = { x: bestRoom.centroid.x - wallMid.x, y: bestRoom.centroid.y - wallMid.y };
      const dot = toCentroid.x * nx + toCentroid.y * ny;
      if (dot < 0) {
        insideNx = -nx;
        insideNy = -ny;
      }
      foundRoom = true;
    }

    if (!foundRoom) {
      // Fall back to center of all wall endpoints
      const toCentroid = { x: fallbackCenter.x - wallMid.x, y: fallbackCenter.y - wallMid.y };
      const dot = toCentroid.x * nx + toCentroid.y * ny;
      if (dot < 0) {
        insideNx = -nx;
        insideNy = -ny;
      }
    }

    // Offset: half wall thickness, direction depends on measure mode
    const halfThickness = wall.thickness / 2;
    let offsetX: number, offsetY: number;
    if (measureMode === "inside") {
      offsetX = insideNx * halfThickness;
      offsetY = insideNy * halfThickness;
    } else {
      offsetX = -insideNx * halfThickness;
      offsetY = -insideNy * halfThickness;
    }

    // Unit direction along the wall
    const udx = dx / len;
    const udy = dy / len;

    // In inside mode, shorten the green line by halfThickness at each end
    // so its span matches the inside measurement value
    const inset = measureMode === "inside" ? halfThickness : 0;
    const sx = (wall.start.x + udx * inset) * pxPerCm + panOffset.x + offsetX * pxPerCm;
    const sy = (wall.start.y + udy * inset) * pxPerCm + panOffset.y + offsetY * pxPerCm;
    const ex = (wall.end.x - udx * inset) * pxPerCm + panOffset.x + offsetX * pxPerCm;
    const ey = (wall.end.y - udy * inset) * pxPerCm + panOffset.y + offsetY * pxPerCm;

    ctx.strokeStyle = INDICATOR_COLOR;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
}

/**
 * Find doors/windows on a wall and return their positions as fractions [0..1]
 * along the wall length, so we can avoid placing the label on top of them.
 */
function findComponentsOnWall(
  wall: Wall,
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point
): { start: number; end: number }[] {
  const pxPerCm = (gridSize * zoom) / 100;
  const wdx = wall.end.x - wall.start.x;
  const wdy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(wdx * wdx + wdy * wdy);
  if (wallLen < 1) return [];

  const wallDirX = wdx / wallLen;
  const wallDirY = wdy / wallLen;
  const wallNormX = -wallDirY;
  const wallNormY = wallDirX;

  const occupants: { start: number; end: number }[] = [];

  for (const item of furniture) {
    if (item.type !== "door" && item.type !== "door_double" && item.type !== "window") continue;

    // Get item center in world coords
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;

    // Project center onto wall line
    const relX = cx - wall.start.x;
    const relY = cy - wall.start.y;
    const along = relX * wallDirX + relY * wallDirY;
    const perp = Math.abs(relX * wallNormX + relY * wallNormY);

    // Check if close enough to wall (within wall thickness + item size)
    const threshold = (wall.thickness || 15) + Math.max(item.width, item.height);
    if (perp > threshold) continue;

    // Calculate item extent along wall direction
    const halfExtent = Math.max(item.width, item.height) / 2;
    const fracStart = Math.max(0, (along - halfExtent) / wallLen);
    const fracEnd = Math.min(1, (along + halfExtent) / wallLen);

    if (fracEnd > 0 && fracStart < 1) {
      occupants.push({ start: fracStart, end: fracEnd });
    }
  }

  // Sort by start position
  occupants.sort((a, b) => a.start - b.start);
  return occupants;
}

/**
 * For a door/window item, compute the outward-facing unit normal direction
 * relative to the room it belongs to. Returns null if the item is not on a
 * detectable wall/room boundary.
 */
function computeOutsideLabelOffset(
  item: FurnitureItem,
  walls: Wall[],
  rooms: DetectedRoom[]
): { nx: number; ny: number } | null {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;

  // Find the closest wall to this item
  let bestWall: Wall | null = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    const wdx = wall.end.x - wall.start.x;
    const wdy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wallLen < 10) continue;

    const wallDirX = wdx / wallLen;
    const wallDirY = wdy / wallLen;
    const wallNormX = -wallDirY;
    const wallNormY = wallDirX;

    const relX = cx - wall.start.x;
    const relY = cy - wall.start.y;
    const along = relX * wallDirX + relY * wallDirY;
    const perp = Math.abs(relX * wallNormX + relY * wallNormY);

    // Must be within wall extent and close enough perpendicularly
    if (along < -10 || along > wallLen + 10) continue;
    const threshold = (wall.thickness || 15) + Math.max(item.width, item.height);
    if (perp > threshold) continue;

    if (perp < bestDist) {
      bestDist = perp;
      bestWall = wall;
    }
  }

  if (!bestWall) return null;

  // Compute wall normal
  const dx = bestWall.end.x - bestWall.start.x;
  const dy = bestWall.end.y - bestWall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;

  // Find the smallest room that owns this wall (label faces outward from it)
  const wallMid = { x: (bestWall.start.x + bestWall.end.x) / 2, y: (bestWall.start.y + bestWall.end.y) / 2 };
  let bestRoom: DetectedRoom | null = null;

  for (const room of rooms) {
    const hasStart = room.vertices.some(v =>
      Math.sqrt((v.x - bestWall!.start.x) ** 2 + (v.y - bestWall!.start.y) ** 2) < 15
    );
    const hasEnd = room.vertices.some(v =>
      Math.sqrt((v.x - bestWall!.end.x) ** 2 + (v.y - bestWall!.end.y) ** 2) < 15
    );
    if (hasStart && hasEnd) {
      if (!bestRoom || room.area < bestRoom.area) {
        bestRoom = room;
      }
    }
  }

  if (!bestRoom) return null;

  // Determine outward normal (away from room centroid)
  const toCentroid = { x: bestRoom.centroid.x - wallMid.x, y: bestRoom.centroid.y - wallMid.y };
  const dot = toCentroid.x * nx + toCentroid.y * ny;
  // If dot > 0, (nx, ny) points toward centroid (inside), so outward is (-nx, -ny)
  if (dot > 0) {
    return { nx: -nx, ny: -ny };
  }
  return { nx, ny };
}

/**
 * Find the optimal label position along a wall, avoiding door/window overlap.
 * Returns a fraction [0..1] along the wall where the label center should go,
 * and whether to offset perpendicular if no clear gap exists.
 */
function findOptimalLabelPosition(
  occupants: { start: number; end: number }[],
  textWidthFrac: number
): { position: number; offsetPerp: boolean } {
  if (occupants.length === 0) {
    return { position: 0.5, offsetPerp: false };
  }

  // Build list of gaps
  const gaps: { start: number; end: number; size: number }[] = [];
  let prev = 0;
  for (const occ of occupants) {
    if (occ.start > prev) {
      gaps.push({ start: prev, end: occ.start, size: occ.start - prev });
    }
    prev = Math.max(prev, occ.end);
  }
  if (prev < 1) {
    gaps.push({ start: prev, end: 1, size: 1 - prev });
  }

  // Find the largest gap that can fit the text
  const neededFrac = textWidthFrac * 1.2; // 20% margin
  let bestGap: { start: number; end: number; size: number } | null = null;
  for (const gap of gaps) {
    if (gap.size >= neededFrac && (!bestGap || gap.size > bestGap.size)) {
      bestGap = gap;
    }
  }

  if (bestGap) {
    return { position: (bestGap.start + bestGap.end) / 2, offsetPerp: false };
  }

  // No gap large enough — find largest gap anyway and offset perpendicular
  let largest: { start: number; end: number; size: number } | null = null;
  for (const gap of gaps) {
    if (!largest || gap.size > largest.size) largest = gap;
  }

  if (largest && largest.size > 0.05) {
    return { position: (largest.start + largest.end) / 2, offsetPerp: true };
  }

  // Fallback: midpoint with perpendicular offset
  return { position: 0.5, offsetPerp: true };
}

/** Shared helper to draw a wall dimension label */
function drawWallDimensionLabel(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, ex: number, ey: number,
  lengthCm: number, wallThicknessPx: number,
  zoom: number, isDark: boolean,
  units: UnitSystem = "m",
  wall?: Wall,
  furniture?: FurnitureItem[],
  gridSize?: number,
  panOffset?: Point,
  rooms: DetectedRoom[] = [],
  allWalls: Wall[] = [],
  measureMode: MeasureMode = "inside"
) {
  const angle = Math.atan2(ey - sy, ex - sx);
  const wallLengthPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);

  const baseFontSize = Math.max(11, 12 * zoom);
  const text = formatLength(lengthCm, units);
  ctx.font = `500 ${baseFontSize}px 'General Sans', 'DM Sans', sans-serif`;
  const textWidth = ctx.measureText(text).width;
  const pad = 4;

  // Collision avoidance: find optimal position along wall
  let labelFrac = 0.5;
  if (wall && furniture && gridSize && panOffset) {
    const occupants = findComponentsOnWall(wall, furniture, gridSize, zoom, panOffset);
    if (occupants.length > 0) {
      const textFrac = wallLengthPx > 0 ? (textWidth + pad * 2) / wallLengthPx : 1;
      const result = findOptimalLabelPosition(occupants, textFrac);
      labelFrac = result.position;
    }
  }

  // Compute label center position along wall
  const mx = sx + (ex - sx) * labelFrac;
  const my = sy + (ey - sy) * labelFrac;

  // Determine inside normal direction using room centroid (same logic as drawMeasurementIndicatorLines)
  const normX = -Math.sin(angle);
  const normY = Math.cos(angle);
  let insideNormX = normX;
  let insideNormY = normY;

  if (wall) {
    const wallMid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
    const wdx = wall.end.x - wall.start.x;
    const wdy = wall.end.y - wall.start.y;
    const wlen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wlen > 0) {
      const wnx = -wdy / wlen;
      const wny = wdx / wlen;

      let foundRoom = false;
      // For walls shared between nested rooms, use the largest room to determine
      // the "inside" direction so that "full" mode measures from the correct (outer) side.
      let bestRoom: DetectedRoom | null = null;
      for (const room of rooms) {
        const hasStart = room.vertices.some(v =>
          Math.sqrt((v.x - wall.start.x) ** 2 + (v.y - wall.start.y) ** 2) < 15
        );
        const hasEnd = room.vertices.some(v =>
          Math.sqrt((v.x - wall.end.x) ** 2 + (v.y - wall.end.y) ** 2) < 15
        );
        if (hasStart && hasEnd) {
          if (!bestRoom || room.area > bestRoom.area) {
            bestRoom = room;
          }
        }
      }
      if (bestRoom) {
        const toCentroid = { x: bestRoom.centroid.x - wallMid.x, y: bestRoom.centroid.y - wallMid.y };
        const dot = toCentroid.x * wnx + toCentroid.y * wny;
        insideNormX = dot >= 0 ? normX : -normX;
        insideNormY = dot >= 0 ? normY : -normY;
        foundRoom = true;
      }

      if (!foundRoom && allWalls.length > 0) {
        // Fallback: use center of all wall endpoints
        let cx = 0, cy = 0, cnt = 0;
        for (const w of allWalls) {
          cx += w.start.x + w.end.x;
          cy += w.start.y + w.end.y;
          cnt += 2;
        }
        if (cnt > 0) {
          cx /= cnt;
          cy /= cnt;
          const toCentroid = { x: cx - wallMid.x, y: cy - wallMid.y };
          const dot = toCentroid.x * wnx + toCentroid.y * wny;
          insideNormX = dot >= 0 ? normX : -normX;
          insideNormY = dot >= 0 ? normY : -normY;
        }
      }
    }
  }

  // Offset label perpendicular to wall: inside mode → toward room, full → away from room
  const dirSign = measureMode === "inside" ? 1 : -1;
  const perpOffsetPx = dirSign * (wallThicknessPx / 2 + baseFontSize * 0.6 + 4);
  const finalX = mx + insideNormX * perpOffsetPx;
  const finalY = my + insideNormY * perpOffsetPx;

  ctx.save();
  ctx.translate(finalX, finalY);
  let textAngle = angle;
  if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
    textAngle += Math.PI;
  }
  ctx.rotate(textAngle);

  ctx.fillStyle = isDark ? "#1c1b19" : "#f9f8f5";
  ctx.fillRect(
    -textWidth / 2 - pad,
    -baseFontSize * 0.5 - pad,
    textWidth + pad * 2,
    baseFontSize + pad * 2
  );
  ctx.fillStyle = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);

  ctx.restore();
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
    if (item.mirrored) ctx.scale(-1, 1);

    const isSelected = item.id === selectedId;
    const isWallCup = isWallCupboard(item.type);

    if (isWallCup) {
      // Wall cupboard: light fill at 60% opacity
      ctx.fillStyle = isDark ? "rgba(42, 40, 38, 0.6)" : "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(-w / 2, -h / 2, w, h);

      // Dashed border [6, 3]
      ctx.strokeStyle = isSelected ? SELECT_COLOR : (isDark ? FURNITURE_STROKE_DARK : FURNITURE_STROKE_LIGHT);
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);

      // Cross-hatch: two diagonal lines corner-to-corner
      ctx.strokeStyle = isDark ? "rgba(90, 89, 87, 0.4)" : "rgba(186, 185, 180, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.moveTo(w / 2, -h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.stroke();
    } else {
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
    }

    // Inline labels removed — dynamic component labels (pills) handle all labeling

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
    case "bed_superking":
    case "bed_single": {
      // Headboard fill
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.27);
      ctx.globalAlpha = 1;
      // Divider line below headboard
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2 + h * 0.29);
      ctx.lineTo(w / 2, -h / 2 + h * 0.29);
      ctx.stroke();
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
    }
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
    case "kitchen_sink_s": {
      // Single basin with tap and drainer lines
      ctx.strokeRect(-w * 0.32, -h * 0.36, w * 0.64, h * 0.54);
      ctx.beginPath();
      ctx.arc(0, -h * 0.09, w * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      // Tap
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(-w * 0.12, -h * 0.42);
      ctx.lineTo(w * 0.12, -h * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.46);
      ctx.lineTo(0, -h * 0.35);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Drainer lines
      ctx.globalAlpha = 0.35;
      for (const xf of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + w * xf, h * 0.26);
        ctx.lineTo(-w / 2 + w * xf, h * 0.46);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "kitchen_sink_d": {
      // Double sink: two basins left + drying rack right
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.15, -h / 2);
      ctx.lineTo(w * 0.15, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Left basin
      ctx.strokeRect(-w * 0.45, -h * 0.38, w * 0.25, h * 0.65);
      // Right basin
      ctx.strokeRect(-w * 0.15, -h * 0.38, w * 0.25, h * 0.65);
      // Drain dots
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(-w * 0.33, -h * 0.05, w * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-w * 0.03, -h * 0.05, w * 0.04, 0, Math.PI * 2);
      ctx.fill();
      // Drying rack slats
      ctx.globalAlpha = 0.4;
      for (const xf of [0.2, 0.28, 0.36, 0.44]) {
        ctx.beginPath();
        ctx.moveTo(w * xf, -h * 0.36);
        ctx.lineTo(w * xf, h * 0.36);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
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
    case "door_double":
      // Double/French door: two opposing swing arcs meeting in center
      ctx.lineWidth = 2;
      // Left door panel
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-w / 2, h / 2, w / 2, -Math.PI / 2, 0);
      ctx.stroke();
      // Right door panel
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, Math.PI, -Math.PI / 2);
      ctx.stroke();
      break;
    case "window":
      // Architectural window: two parallel lines with frame ends
      ctx.lineWidth = 2;
      // Outer frame lines
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.3);
      ctx.lineTo(w / 2, -h * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2, h * 0.3);
      ctx.lineTo(w / 2, h * 0.3);
      ctx.stroke();
      // Frame end caps
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.3);
      ctx.lineTo(-w / 2, h * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2, -h * 0.3);
      ctx.lineTo(w / 2, h * 0.3);
      ctx.stroke();
      // Glass fill between lines
      ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.1)" : "rgba(1, 105, 111, 0.07)";
      ctx.fillRect(-w / 2, -h * 0.3, w, h * 0.6);
      // Center divider
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.3);
      ctx.lineTo(0, h * 0.3);
      ctx.stroke();
      break;
    case "bay_window":
      // Bay window: trapezoid with 3 glass panes (center + 2 angled sides)
      ctx.lineWidth = 2;
      const bwInset = w * 0.25; // how far the sides angle in
      // Outer shape (trapezoid)
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w / 2 + bwInset, -h / 2);
      ctx.lineTo(w / 2 - bwInset, -h / 2);
      ctx.lineTo(w / 2, 0);
      ctx.closePath();
      ctx.stroke();
      // Glass fill
      ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.1)" : "rgba(1, 105, 111, 0.07)";
      ctx.fill();
      // Inner pane dividers (two vertical lines creating 3 sections)
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + bwInset, 0);
      ctx.lineTo(-w / 2 + bwInset, -h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2 - bwInset, 0);
      ctx.lineTo(w / 2 - bwInset, -h / 2);
      ctx.stroke();
      break;
    case "stairs":
      // Staircase: rectangle with parallel tread lines and direction arrow
      ctx.lineWidth = 1;
      const numTreads = Math.max(5, Math.round(h / (w * 0.3)));
      const treadSpacing = h / numTreads;
      for (let i = 1; i < numTreads; i++) {
        const ty = -h / 2 + i * treadSpacing;
        ctx.beginPath();
        ctx.moveTo(-w / 2, ty);
        ctx.lineTo(w / 2, ty);
        ctx.stroke();
      }
      // Direction arrow (pointing up)
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.35);
      ctx.lineTo(0, -h * 0.35);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.35);
      ctx.lineTo(-w * 0.15, -h * 0.2);
      ctx.moveTo(0, -h * 0.35);
      ctx.lineTo(w * 0.15, -h * 0.2);
      ctx.stroke();
      break;
    case "radiator":
      // Radiator: rectangle with vertical fin lines
      ctx.lineWidth = 1;
      const numFins = Math.max(4, Math.round(w / 12));
      const finSpacing = w / (numFins + 1);
      for (let i = 1; i <= numFins; i++) {
        const fx = -w / 2 + i * finSpacing;
        ctx.beginPath();
        ctx.moveTo(fx, -h * 0.35);
        ctx.lineTo(fx, h * 0.35);
        ctx.stroke();
      }
      break;
    case "range_cooker": {
      // 6 burners in 3×2 grid
      const rMin = Math.min(w, h);
      for (const cx of [0.18, 0.5, 0.82]) {
        for (const cy of [0.32, 0.72]) {
          const bx = -w / 2 + w * cx;
          const by = -h / 2 + h * cy;
          ctx.beginPath();
          ctx.arc(bx, by, rMin * 0.14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = stroke;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.arc(bx, by, rMin * 0.045, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      break;
    }
    case "oven_builtin": {
      // Control strip top + oven window + handle
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.22);
      ctx.globalAlpha = 0.5;
      for (const xf of [0.25, 0.5, 0.75]) {
        ctx.beginPath();
        ctx.arc(-w / 2 + w * xf, -h / 2 + h * 0.11, h * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.08;
      ctx.fillRect(-w * 0.38, -h / 2 + h * 0.3, w * 0.76, h * 0.46);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.38, -h / 2 + h * 0.3, w * 0.76, h * 0.46);
      // Handle
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h / 2 + h * 0.88);
      ctx.lineTo(w * 0.3, -h / 2 + h * 0.88);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      break;
    }
    case "extractor_hood": {
      // Trapezoid shape with duct and grille
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.25, -h / 2);
      ctx.lineTo(w * 0.25, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      // Duct at top
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(-w * 0.15, -h / 2, w * 0.3, h * 0.2);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.15, -h / 2, w * 0.3, h * 0.2);
      // Grille lines
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(-w * 0.38, h * 0.15);
      ctx.lineTo(w * 0.38, h * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, h * 0.32);
      ctx.lineTo(w * 0.32, h * 0.32);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case "tumble_dryer":
      // Dashed border to distinguish from washing machine
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(-w * 0.46, -h * 0.46, w * 0.92, h * 0.92);
      ctx.setLineDash([]);
      break;
    case "washing_machine":
    case "worktop":
      // Plain rectangle — no inner detail (outer rect already drawn)
      break;
    case "sofa_l": {
      // L-shape: back rail top + right, left arm, seat area, cushion divider
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(-w / 2, -h / 2, w * 0.72, h * 0.14);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w / 2, -h / 2, w * 0.72, h * 0.14);
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(w / 2 - w * 0.16, -h / 2 + h * 0.16, w * 0.16, h * 0.62);
      ctx.globalAlpha = 1;
      ctx.strokeRect(w / 2 - w * 0.16, -h / 2 + h * 0.16, w * 0.16, h * 0.62);
      // Left arm
      ctx.strokeRect(-w / 2, -h / 2 + h * 0.16, w * 0.1, h * 0.62);
      // Seat area
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(-w / 2 + w * 0.1, -h / 2 + h * 0.16, w * 0.72, h * 0.62);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w / 2 + w * 0.1, -h / 2 + h * 0.16, w * 0.72, h * 0.62);
      // Cushion divider
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + w * 0.44, -h / 2 + h * 0.16);
      ctx.lineTo(-w / 2 + w * 0.44, -h / 2 + h * 0.78);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case "side_table": {
      // Circular top-down: outer circle + inner ring + center dot
      const r = Math.min(w, h) / 2 - 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, r / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case "fireplace": {
      // Wall surround top + firebox + hearth
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.45);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w / 2, -h / 2, w, h * 0.45);
      // Firebox
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(-w * 0.3, -h / 2 + h * 0.06, w * 0.6, h * 0.34);
      ctx.globalAlpha = 1;
      // Hearth projection
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(-w * 0.4, -h / 2 + h * 0.48, w * 0.8, h * 0.48);
      ctx.globalAlpha = 1;
      break;
    }
    case "basin_pedestal": {
      // D-shaped bowl + drain + pedestal column + base
      ctx.beginPath();
      const bpTop = -h / 2 + h * 0.08;
      ctx.moveTo(-w * 0.42, bpTop);
      ctx.quadraticCurveTo(-w * 0.42, -h / 2 + h * 0.52, 0, -h / 2 + h * 0.52);
      ctx.quadraticCurveTo(w * 0.42, -h / 2 + h * 0.52, w * 0.42, bpTop);
      ctx.closePath();
      ctx.stroke();
      // Top edge
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, bpTop);
      ctx.lineTo(w * 0.42, bpTop);
      ctx.stroke();
      // Drain dot
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(0, -h / 2 + h * 0.34, w * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Pedestal column
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(-w * 0.12, -h / 2 + h * 0.53, w * 0.24, h * 0.27);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.12, -h / 2 + h * 0.53, w * 0.24, h * 0.27);
      // Base
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(-w * 0.26, -h / 2 + h * 0.8, w * 0.52, h * 0.14);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.26, -h / 2 + h * 0.8, w * 0.52, h * 0.14);
      break;
    }
    case "dining_chair": {
      // Backrest bar at top + seat rectangle
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(-w * 0.42, -h / 2, w * 0.84, h * 0.22);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.42, -h / 2, w * 0.84, h * 0.22);
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(-w * 0.42, -h / 2 + h * 0.28, w * 0.84, h * 0.66);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.42, -h / 2 + h * 0.28, w * 0.84, h * 0.66);
      break;
    }
    case "desk": {
      // Rectangle + monitor outline + keyboard strip
      ctx.strokeRect(-w * 0.22, -h * 0.34, w * 0.44, h * 0.42);
      // Monitor stand
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.08);
      ctx.lineTo(0, h * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.12, h * 0.22);
      ctx.lineTo(w * 0.12, h * 0.22);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Keyboard
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(-w * 0.26, h * 0.28, w * 0.52, h * 0.12);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.26, h * 0.28, w * 0.52, h * 0.12);
      break;
    }
    case "office_chair": {
      // Round seat + backrest nub at top
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(-w * 0.2, -h / 2, w * 0.4, h * 0.18);
      ctx.globalAlpha = 1;
      ctx.strokeRect(-w * 0.2, -h / 2, w * 0.4, h * 0.18);
      // Circular seat
      const chairR = Math.min(w, h) * 0.36;
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.arc(0, h * 0.12, chairR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, h * 0.12, chairR, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "boiler":
      // Boiler: rectangle with circle containing "B"
      ctx.lineWidth = 1;
      const boilerRadius = Math.min(w, h) * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, boilerRadius, 0, Math.PI * 2);
      ctx.stroke();
      // "B" label
      ctx.fillStyle = stroke;
      ctx.font = `bold ${boilerRadius * 1.2}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("B", 0, 0);
      break;
  }
}

/** Resolve a LabelColor to a CSS color value */
function resolveLabelColor(color: LabelColor | undefined, isDark: boolean, isSelected: boolean): string {
  if (isSelected) return SELECT_COLOR;
  switch (color) {
    case "teal": return isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
    case "red": return isDark ? "#e57373" : "#d32f2f";
    case "grey": return isDark ? "#797876" : "#9e9e9e";
    case "black":
    default: return isDark ? "#cdccca" : "#3a3938";
  }
}

/** Resolve a LabelSize to pixel font size */
function resolveLabelSize(size: string | undefined): number {
  switch (size) {
    case "small": return 12;
    case "large": return 24;
    case "medium":
    default: return 16;
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

    const resolvedSize = resolveLabelSize(label.size);
    const fontSize = resolvedSize * zoom;
    const weight = label.bold ? "700" : "600";
    ctx.font = `${weight} ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;

    const textWidth = ctx.measureText(label.text).width;
    const textHeight = fontSize;

    // Background pill if enabled
    if (label.background) {
      const padX = 8;
      const padY = 4;
      const pillW = textWidth + padX * 2;
      const pillH = textHeight + padY * 2;
      const pillX = x - pillW / 2;
      const pillY = y - pillH / 2;
      const r = pillH / 2;

      ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.85)" : "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.moveTo(pillX + r, pillY);
      ctx.lineTo(pillX + pillW - r, pillY);
      ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + r, r);
      ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH, r);
      ctx.lineTo(pillX + r, pillY + pillH);
      ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - r, r);
      ctx.arcTo(pillX, pillY, pillX + r, pillY, r);
      ctx.closePath();
      ctx.fill();

      // Subtle border
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = resolveLabelColor(label.color, isDark, isSelected);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, x, y);
  });
}

/** Generate a stable key for a detected room based on its sorted vertex coordinates */
export function getRoomKey(room: { vertices: Point[] }): string {
  const sorted = [...room.vertices]
    .map((v) => `${Math.round(v.x)},${Math.round(v.y)}`)
    .sort();
  return sorted.join("|");
}

export function drawRoomAreas(
  ctx: CanvasRenderingContext2D,
  rooms: { vertices: Point[]; area: number; centroid: Point }[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  units: UnitSystem = "m",
  roomNames: Record<string, string> = {},
  selectedRoomKey: string | null = null,
  labelPositions: Map<string, Point> = new Map()
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

    // Draw room name + area text at resolved position (or centroid fallback)
    const roomKey = getRoomKey(room);
    const labelPos = labelPositions.get(roomKey) || room.centroid;
    const cx = labelPos.x * pxPerCm + panOffset.x;
    const cy = labelPos.y * pxPerCm + panOffset.y;
    const roomName = roomNames[roomKey] || "Room";
    const areaText = formatArea(room.area, units);
    const isSelected = roomKey === selectedRoomKey;

    // Compute room bounding box to check if label fits
    let minRX = Infinity, maxRX = -Infinity, minRY = Infinity, maxRY = -Infinity;
    for (const v of room.vertices) {
      const vx = v.x * pxPerCm + panOffset.x;
      const vy = v.y * pxPerCm + panOffset.y;
      if (vx < minRX) minRX = vx;
      if (vx > maxRX) maxRX = vx;
      if (vy < minRY) minRY = vy;
      if (vy > maxRY) maxRY = vy;
    }
    const roomWidthPx = maxRX - minRX;
    const roomHeightPx = maxRY - minRY;

    // Adaptive font size: shrink to fit small rooms
    let nameFontSize = Math.max(11, 14 * zoom);
    let areaFontSize = Math.max(9, 11 * zoom);

    // Measure text at current size and shrink if needed
    ctx.font = `600 ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    let nameWidth = ctx.measureText(roomName).width;
    ctx.font = `500 ${areaFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    let areaWidth = ctx.measureText(areaText).width;
    const maxTextWidth = Math.max(nameWidth, areaWidth);
    const totalHeight = nameFontSize + areaFontSize + 4;

    // Shrink fonts if text doesn't fit the room
    if (maxTextWidth > roomWidthPx * 0.85 || totalHeight > roomHeightPx * 0.7) {
      const scaleFactor = Math.min(
        (roomWidthPx * 0.8) / (maxTextWidth || 1),
        (roomHeightPx * 0.6) / (totalHeight || 1),
        1
      );
      const clampedScale = Math.max(0.4, Math.min(1, scaleFactor));
      nameFontSize *= clampedScale;
      areaFontSize *= clampedScale;
    }

    const baseColor = isSelected
      ? (isDark ? "#4f98a3" : "#01696f")
      : (isDark ? "rgba(79, 152, 163, 0.7)" : "rgba(1, 105, 111, 0.6)");
    const areaColor = isSelected
      ? (isDark ? "rgba(79, 152, 163, 0.9)" : "rgba(1, 105, 111, 0.8)")
      : (isDark ? "rgba(79, 152, 163, 0.5)" : "rgba(1, 105, 111, 0.4)");

    // Room name (larger, bolder)
    ctx.font = `600 ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = baseColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(roomName, cx, cy - areaFontSize * 0.4);

    // Area (smaller, lighter)
    ctx.font = `500 ${areaFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = areaColor;
    ctx.fillText(areaText, cx, cy + nameFontSize * 0.5);
  });
}

/** Hit-test room labels: returns the room key if double-clicked on a room label */
export function hitTestRoomLabel(
  screenX: number,
  screenY: number,
  rooms: DetectedRoom[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  roomNames: Record<string, string>,
  labelPositions: Map<string, Point> = new Map()
): { roomKey: string; centroid: Point } | null {
  const pxPerCm = (gridSize * zoom) / 100;

  for (const room of rooms) {
    const roomKey = getRoomKey(room);
    const labelPos = labelPositions.get(roomKey) || room.centroid;
    const cx = labelPos.x * pxPerCm + panOffset.x;
    const cy = labelPos.y * pxPerCm + panOffset.y;
    const roomName = roomNames[roomKey] || "Room";

    const nameFontSize = Math.max(11, 14 * zoom);
    const areaFontSize = Math.max(9, 11 * zoom);
    const totalHeight = nameFontSize + areaFontSize + 8;
    const estWidth = Math.max(roomName.length, 8) * nameFontSize * 0.55;

    if (
      screenX >= cx - estWidth / 2 &&
      screenX <= cx + estWidth / 2 &&
      screenY >= cy - totalHeight / 2 &&
      screenY <= cy + totalHeight / 2
    ) {
      return { roomKey, centroid: labelPos };
    }
  }
  return null;
}

/** Draw component labels beneath/beside furniture items */
export function drawComponentLabels(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null,
  units: UnitSystem = "m"
) {
  const pxPerCm = (gridSize * zoom) / 100;

  furniture.forEach((item) => {
    const centerX = (item.x + item.width / 2) * pxPerCm + panOffset.x;
    const centerY = (item.y + item.height / 2) * pxPerCm + panOffset.y;
    const h = item.height * pxPerCm;
    const isSelected = item.id === selectedId;

    // Position label below the item
    const labelY = centerY + h / 2 + 14 * zoom;

    const displayName = item.customName || item.label;
    const dimText = `${item.width} \u00D7 ${item.height} cm`;

    const nameFontSize = Math.max(9, 11 * zoom);
    const dimFontSize = Math.max(8, 9 * zoom);

    // Name line
    ctx.font = `${isSelected ? "600" : "500"} ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const nameColor = isSelected
      ? (isDark ? "#4f98a3" : "#01696f")
      : (isDark ? "rgba(79, 152, 163, 0.65)" : "rgba(1, 105, 111, 0.55)");
    ctx.fillStyle = nameColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Background pill for readability
    const nameWidth = ctx.measureText(displayName).width;
    ctx.font = `400 ${dimFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const dimWidth = ctx.measureText(dimText).width;
    const maxWidth = Math.max(nameWidth, dimWidth);
    const pillW = maxWidth + 10;
    const pillH = nameFontSize + dimFontSize + 8;
    const pillX = centerX - pillW / 2;
    const pillY = labelY - 2;

    ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.7)" : "rgba(247, 246, 242, 0.75)";
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(pillX + r, pillY);
    ctx.lineTo(pillX + pillW - r, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + r, r);
    ctx.lineTo(pillX + pillW, pillY + pillH - r);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH, r);
    ctx.lineTo(pillX + r, pillY + pillH);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - r, r);
    ctx.lineTo(pillX, pillY + r);
    ctx.arcTo(pillX, pillY, pillX + r, pillY, r);
    ctx.closePath();
    ctx.fill();

    // Draw name
    ctx.font = `${isSelected ? "600" : "500"} ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = nameColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(displayName, centerX, labelY);

    // Draw dimensions
    ctx.font = `400 ${dimFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? "rgba(121, 120, 118, 0.8)" : "rgba(122, 121, 116, 0.7)";
    ctx.fillText(dimText, centerX, labelY + nameFontSize + 2);
  });
}

export function drawWallPreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  angleDeg?: number,
  units: UnitSystem = "m",
  measureMode: MeasureMode = "inside",
  adjWallAngleRad?: number
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
  const wallThick = 15;
  const displayLengthCm = measureMode === "inside"
    ? Math.max(0, lengthCm - wallThick)
    : lengthCm;
  if (lengthCm > 5) {
    const lengthText = formatLength(displayLengthCm, units);
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    const fontSize = Math.max(12, 13 * zoom);
    ctx.font = `600 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const textWidth = ctx.measureText(lengthText).width;
    const pad = 4;

    // Draw background pill for contrast against the wall
    ctx.fillStyle = isDark ? "#1c1b19" : "#f9f8f5";
    ctx.fillRect(
      mx - textWidth / 2 - pad,
      my - 10 - fontSize - pad,
      textWidth + pad * 2,
      fontSize + pad * 2
    );

    ctx.fillStyle = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(lengthText, mx, my - 10);
  }

  // Angle indicator at the junction point
  if (angleDeg !== undefined && lengthCm > 10) {
    const fontSize = Math.max(10, 11 * zoom);
    const angleText = `${Math.round(angleDeg)}°`;
    ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? "rgba(79,152,163,0.7)" : "rgba(1,105,111,0.6)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Small arc at the start point showing the angle
    const arcRadius = Math.min(30, Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) * 0.3);
    const newWallAngle = Math.atan2(ey - sy, ex - sx);

    if (adjWallAngleRad !== undefined && arcRadius > 8) {
      // Draw arc between the adjoining wall's outward direction and the new wall (interior side)
      const adjIncoming = adjWallAngleRad;
      let sweep = newWallAngle - adjIncoming;
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const ccw = sweep > Math.PI;

      ctx.beginPath();
      ctx.arc(sx, sy, arcRadius, adjIncoming, newWallAngle, ccw);
      ctx.strokeStyle = isDark ? "rgba(79,152,163,0.4)" : "rgba(1,105,111,0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();

      // Position angle text near the arc bisector
      const bisector = adjIncoming + (ccw ? -(2 * Math.PI - sweep) / 2 : sweep / 2);
      const textDist = arcRadius + 14;
      ctx.fillText(angleText, sx + Math.cos(bisector) * textDist, sy + Math.sin(bisector) * textDist);
    } else {
      // No adjoining wall — show angle text near cursor
      ctx.fillText(angleText, ex + 14, ey - 14);
    }
  }
}

/** Draw faint alignment guide lines from existing wall endpoints */
export function drawAlignmentGuides(
  ctx: CanvasRenderingContext2D,
  currentPoint: Point,
  walls: Wall[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  canvasWidth: number,
  canvasHeight: number,
  isDark: boolean,
  threshold: number = 8 // world cm tolerance (increased for easier alignment)
): { snapX: number | null; snapY: number | null } {
  const pxPerCm = (gridSize * zoom) / 100;
  let snapX: number | null = null;
  let snapY: number | null = null;

  // Collect unique X and Y values from all wall endpoints
  const xValues = new Set<number>();
  const yValues = new Set<number>();
  for (const wall of walls) {
    xValues.add(wall.start.x);
    xValues.add(wall.end.x);
    yValues.add(wall.start.y);
    yValues.add(wall.end.y);
  }

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = isDark ? "rgba(79,152,163,0.45)" : "rgba(1,105,111,0.35)";

  // Check if cursor aligns with any existing wall endpoint X
  for (const x of xValues) {
    if (Math.abs(currentPoint.x - x) < threshold) {
      const sx = x * pxPerCm + panOffset.x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasHeight);
      ctx.stroke();
      snapX = x;
      break;
    }
  }

  // Check Y alignment
  for (const y of yValues) {
    if (Math.abs(currentPoint.y - y) < threshold) {
      const sy = y * pxPerCm + panOffset.y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasWidth, sy);
      ctx.stroke();
      snapY = y;
      break;
    }
  }

  ctx.restore();
  return { snapX, snapY };
}

/** Snap angle to nearest multiple of snapAngle degrees */
export function snapAngle(
  start: Point,
  end: Point,
  snapAngleDeg: number = 15,
  threshold: number = 5 // degrees tolerance
): { snapped: Point; angle: number; didSnap: boolean } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { snapped: end, angle: 0, didSnap: false };

  const rawAngle = Math.atan2(dy, dx);
  const rawDeg = rawAngle * (180 / Math.PI);

  // Find nearest snap angle
  const nearestSnap = Math.round(rawDeg / snapAngleDeg) * snapAngleDeg;
  const diff = Math.abs(rawDeg - nearestSnap);

  if (diff < threshold) {
    const snapRad = nearestSnap * (Math.PI / 180);
    return {
      snapped: {
        x: start.x + len * Math.cos(snapRad),
        y: start.y + len * Math.sin(snapRad),
      },
      angle: nearestSnap,
      didSnap: true,
    };
  }

  return { snapped: end, angle: rawDeg, didSnap: false };
}

/** Compute wall angle in degrees, normalized to 0-360 for display */
export function computeWallAngle(start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // atan2 gives angle from positive X axis; negate Y for screen coords
  let deg = Math.atan2(-dy, dx) * (180 / Math.PI);
  if (deg < 0) deg += 360;
  return deg;
}

/** Find the direction (radians, screen coords) of an adjoining wall at a junction point.
 *  Returns the angle pointing AWAY from the junction along the existing wall, or undefined. */
export function findAdjoiningWallDirection(
  junctionPoint: Point,
  walls: Wall[],
  tolerance: number = 1
): number | undefined {
  for (let i = walls.length - 1; i >= 0; i--) {
    const wall = walls[i];
    const dxS = junctionPoint.x - wall.start.x;
    const dyS = junctionPoint.y - wall.start.y;
    const dxE = junctionPoint.x - wall.end.x;
    const dyE = junctionPoint.y - wall.end.y;

    if (Math.sqrt(dxS * dxS + dyS * dyS) < tolerance) {
      // Junction is at wall.start → direction points toward wall.end
      return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    }
    if (Math.sqrt(dxE * dxE + dyE * dyE) < tolerance) {
      // Junction is at wall.end → direction points toward wall.start
      return Math.atan2(wall.start.y - wall.end.y, wall.start.x - wall.end.x);
    }
  }
  return undefined;
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

/** Snap to the body (not just endpoints) of existing walls */
export function snapToWallBody(
  point: Point,
  walls: Wall[],
  threshold: number = 15
): { snapped: Point; didSnap: boolean; wallId: string | null } {
  let closest: Point | null = null;
  let closestDist = threshold;
  let closestWallId: string | null = null;

  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) continue;

    // Project point onto wall segment, clamp t to [0, 1]
    const t = Math.max(0, Math.min(1,
      ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lenSq
    ));

    const closestOnWall = {
      x: wall.start.x + t * dx,
      y: wall.start.y + t * dy,
    };

    // Skip points very close to endpoints — those are handled by endpoint snap
    const distToStart = Math.sqrt((closestOnWall.x - wall.start.x) ** 2 + (closestOnWall.y - wall.start.y) ** 2);
    const distToEnd = Math.sqrt((closestOnWall.x - wall.end.x) ** 2 + (closestOnWall.y - wall.end.y) ** 2);
    if (distToStart < 5 || distToEnd < 5) continue;

    const dist = Math.sqrt(
      (point.x - closestOnWall.x) ** 2 + (point.y - closestOnWall.y) ** 2
    );

    if (dist < closestDist) {
      closestDist = dist;
      closest = closestOnWall;
      closestWallId = wall.id;
    }
  }

  if (closest && closestWallId) {
    return { snapped: { x: closest.x, y: closest.y }, didSnap: true, wallId: closestWallId };
  }
  return { snapped: point, didSnap: false, wallId: null };
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

export type ResizeCorner = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";

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

  // Edge handles at midpoints (elongated rectangles to indicate resize axis)
  const edgeHandleW = 12;
  const edgeHandleH = 6;
  const edges = [
    { cx: 0, cy: -h / 2, rw: edgeHandleW, rh: edgeHandleH },  // top
    { cx: 0, cy: h / 2, rw: edgeHandleW, rh: edgeHandleH },    // bottom
    { cx: -w / 2, cy: 0, rw: edgeHandleH, rh: edgeHandleW },   // left
    { cx: w / 2, cy: 0, rw: edgeHandleH, rh: edgeHandleW },    // right
  ];

  for (const edge of edges) {
    ctx.fillStyle = "#01696f";
    ctx.fillRect(
      edge.cx - edge.rw / 2,
      edge.cy - edge.rh / 2,
      edge.rw,
      edge.rh
    );
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      edge.cx - edge.rw / 2,
      edge.cy - edge.rh / 2,
      edge.rw,
      edge.rh
    );
  }

  // Rotation handle — circle above top edge
  const rotHandleDist = 24;
  ctx.beginPath();
  // Line from top-center to handle
  ctx.strokeStyle = "#01696f";
  ctx.lineWidth = 1.5;
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, -h / 2 - rotHandleDist);
  ctx.stroke();
  // Circle handle
  ctx.beginPath();
  ctx.arc(0, -h / 2 - rotHandleDist, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#01696f";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Rotation arrow icon inside
  ctx.beginPath();
  ctx.arc(0, -h / 2 - rotHandleDist, 4, -Math.PI * 0.8, Math.PI * 0.4);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Arrowhead
  const arrowAngle = Math.PI * 0.4;
  const ax = 4 * Math.cos(arrowAngle);
  const ay = 4 * Math.sin(arrowAngle);
  ctx.beginPath();
  ctx.moveTo(ax, -h / 2 - rotHandleDist + ay);
  ctx.lineTo(ax + 3, -h / 2 - rotHandleDist + ay - 2);
  ctx.moveTo(ax, -h / 2 - rotHandleDist + ay);
  ctx.lineTo(ax - 1, -h / 2 - rotHandleDist + ay - 3);
  ctx.stroke();

  ctx.restore();
}

/** Hit-test the rotation handle circle above a selected furniture item */
export function hitTestRotateHandle(
  screenX: number,
  screenY: number,
  item: FurnitureItem,
  gridSize: number,
  zoom: number,
  panOffset: Point
): boolean {
  const pxPerCm = (gridSize * zoom) / 100;
  const x = item.x * pxPerCm + panOffset.x;
  const y = item.y * pxPerCm + panOffset.y;
  const w = item.width * pxPerCm;
  const h = item.height * pxPerCm;
  const rotHandleDist = 24;

  // Handle center in rotated coords is at (0, -h/2 - rotHandleDist)
  // Transform that to screen coords
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = (item.rotation * Math.PI) / 180;
  // Local handle position
  const lhx = 0;
  const lhy = -h / 2 - rotHandleDist;
  // Rotate to screen
  const shx = cx + lhx * Math.cos(angle) - lhy * Math.sin(angle);
  const shy = cy + lhx * Math.sin(angle) + lhy * Math.cos(angle);

  const dx = screenX - shx;
  const dy = screenY - shy;
  return Math.sqrt(dx * dx + dy * dy) <= 14; // generous hit area
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

  const edgeHandles: { cx: number; cy: number; corner: ResizeCorner }[] = [
    { cx: 0, cy: -h / 2, corner: "t" },
    { cx: 0, cy: h / 2, corner: "b" },
    { cx: -w / 2, cy: 0, corner: "l" },
    { cx: w / 2, cy: 0, corner: "r" },
  ];

  // For structural items (doors/windows), test edge handles first so
  // single-dimension resizing is easier to grab on thin items
  const isStructural = item.type === "door" || item.type === "door_double" || item.type === "window";
  const first = isStructural ? edgeHandles : corners;
  const second = isStructural ? corners : edgeHandles;

  for (const h of first) {
    if (
      Math.abs(localX - h.cx) <= handleSize &&
      Math.abs(localY - h.cy) <= handleSize
    ) {
      return h.corner;
    }
  }

  for (const h of second) {
    if (
      Math.abs(localX - h.cx) <= handleSize &&
      Math.abs(localY - h.cy) <= handleSize
    ) {
      return h.corner;
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

/** Helper: get the AABB of a furniture item (axis-aligned bounding box in world cm) */
function furnBBox(item: FurnitureItem): { left: number; right: number; top: number; bottom: number } {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (item.width * cos + item.height * sin) / 2;
  const halfH = (item.width * sin + item.height * cos) / 2;
  return {
    left: cx - halfW,
    right: cx + halfW,
    top: cy - halfH,
    bottom: cy + halfH,
  };
}

/** Helper: point-to-segment distance and closest point */
function pointToSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { dist: number; closest: Point } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.01) return { dist: Math.sqrt((px - ax) ** 2 + (py - ay) ** 2), closest: { x: ax, y: ay } };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { dist: Math.sqrt((px - cx) ** 2 + (py - cy) ** 2), closest: { x: cx, y: cy } };
}

/** Find minimum perpendicular distance from each edge of a furniture item to each wall segment */
function computeEdgeToWallDistances(
  item: FurnitureItem,
  walls: Wall[]
): { dist: number; furnitureEdgePt: Point; wallPt: Point; axis: "h" | "v" }[] {
  const bb = furnBBox(item);
  const results: { dist: number; furnitureEdgePt: Point; wallPt: Point; axis: "h" | "v" }[] = [];

  // For each wall, compute shortest distance from each furniture edge (as a line) to the wall
  for (const wall of walls) {
    const ws = wall.start;
    const we = wall.end;
    // Wall direction
    const wdx = we.x - ws.x;
    const wdy = we.y - ws.y;
    const wlen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wlen < 1) continue;

    // Check horizontal wall (nearly horizontal => measure vertical distance)
    const isHorizontal = Math.abs(wdy / wlen) < 0.15;
    // Check vertical wall (nearly vertical => measure horizontal distance)
    const isVertical = Math.abs(wdx / wlen) < 0.15;

    if (isHorizontal) {
      // Wall is roughly horizontal: check distance from furniture top/bottom edges
      const wallY = (ws.y + we.y) / 2;
      const wallMinX = Math.min(ws.x, we.x);
      const wallMaxX = Math.max(ws.x, we.x);
      const halfThick = wall.thickness / 2;

      // Check overlap in X range
      if (bb.right > wallMinX && bb.left < wallMaxX) {
        const midX = Math.max(bb.left, wallMinX) + (Math.min(bb.right, wallMaxX) - Math.max(bb.left, wallMinX)) / 2;
        // Top edge to wall
        const distTop = Math.abs(bb.top - wallY) - halfThick;
        if (distTop > 0 && distTop < 300) {
          results.push({
            dist: distTop,
            furnitureEdgePt: { x: midX, y: bb.top },
            wallPt: { x: midX, y: bb.top > wallY ? wallY + halfThick : wallY - halfThick },
            axis: "v",
          });
        }
        // Bottom edge to wall
        const distBottom = Math.abs(bb.bottom - wallY) - halfThick;
        if (distBottom > 0 && distBottom < 300) {
          results.push({
            dist: distBottom,
            furnitureEdgePt: { x: midX, y: bb.bottom },
            wallPt: { x: midX, y: bb.bottom > wallY ? wallY + halfThick : wallY - halfThick },
            axis: "v",
          });
        }
      }
    }

    if (isVertical) {
      // Wall is roughly vertical: check distance from furniture left/right edges
      const wallX = (ws.x + we.x) / 2;
      const wallMinY = Math.min(ws.y, we.y);
      const wallMaxY = Math.max(ws.y, we.y);
      const halfThick = wall.thickness / 2;

      // Check overlap in Y range
      if (bb.bottom > wallMinY && bb.top < wallMaxY) {
        const midY = Math.max(bb.top, wallMinY) + (Math.min(bb.bottom, wallMaxY) - Math.max(bb.top, wallMinY)) / 2;
        // Left edge to wall
        const distLeft = Math.abs(bb.left - wallX) - halfThick;
        if (distLeft > 0 && distLeft < 300) {
          results.push({
            dist: distLeft,
            furnitureEdgePt: { x: bb.left, y: midY },
            wallPt: { x: bb.left > wallX ? wallX + halfThick : wallX - halfThick, y: midY },
            axis: "h",
          });
        }
        // Right edge to wall
        const distRight = Math.abs(bb.right - wallX) - halfThick;
        if (distRight > 0 && distRight < 300) {
          results.push({
            dist: distRight,
            furnitureEdgePt: { x: bb.right, y: midY },
            wallPt: { x: bb.right > wallX ? wallX + halfThick : wallX - halfThick, y: midY },
            axis: "h",
          });
        }
      }
    }
  }

  return results;
}

/** Compute distances between selected furniture and nearby furniture */
function computeFurnitureToFurnitureDistances(
  selected: FurnitureItem,
  others: FurnitureItem[]
): { dist: number; fromPt: Point; toPt: Point; axis: "h" | "v" }[] {
  const bb = furnBBox(selected);
  const results: { dist: number; fromPt: Point; toPt: Point; axis: "h" | "v" }[] = [];

  for (const other of others) {
    if (other.id === selected.id) continue;
    const ob = furnBBox(other);

    // Horizontal distance (left/right): check Y overlap
    const yOverlap = Math.min(bb.bottom, ob.bottom) - Math.max(bb.top, ob.top);
    if (yOverlap > 5) {
      const midY = Math.max(bb.top, ob.top) + yOverlap / 2;
      // Selected is to the right of other
      if (bb.left >= ob.right) {
        const d = bb.left - ob.right;
        if (d > 0 && d < 300) {
          results.push({ dist: d, fromPt: { x: bb.left, y: midY }, toPt: { x: ob.right, y: midY }, axis: "h" });
        }
      }
      // Selected is to the left of other
      if (ob.left >= bb.right) {
        const d = ob.left - bb.right;
        if (d > 0 && d < 300) {
          results.push({ dist: d, fromPt: { x: bb.right, y: midY }, toPt: { x: ob.left, y: midY }, axis: "h" });
        }
      }
    }

    // Vertical distance (top/bottom): check X overlap
    const xOverlap = Math.min(bb.right, ob.right) - Math.max(bb.left, ob.left);
    if (xOverlap > 5) {
      const midX = Math.max(bb.left, ob.left) + xOverlap / 2;
      // Selected is below other
      if (bb.top >= ob.bottom) {
        const d = bb.top - ob.bottom;
        if (d > 0 && d < 300) {
          results.push({ dist: d, fromPt: { x: midX, y: bb.top }, toPt: { x: midX, y: ob.bottom }, axis: "v" });
        }
      }
      // Selected is above other
      if (ob.top >= bb.bottom) {
        const d = ob.top - bb.bottom;
        if (d > 0 && d < 300) {
          results.push({ dist: d, fromPt: { x: midX, y: bb.bottom }, toPt: { x: midX, y: ob.top }, axis: "v" });
        }
      }
    }
  }

  return results;
}

/** Find the wall a door/window is mounted on, or null if not on any wall */
function findHostWall(item: FurnitureItem, walls: Wall[]): Wall | null {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;

  for (const wall of walls) {
    const wdx = wall.end.x - wall.start.x;
    const wdy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wallLen < 1) continue;
    const wallDirX = wdx / wallLen;
    const wallDirY = wdy / wallLen;
    const wallNormX = -wallDirY;
    const wallNormY = wallDirX;

    const relX = cx - wall.start.x;
    const relY = cy - wall.start.y;
    const along = relX * wallDirX + relY * wallDirY;
    const perp = Math.abs(relX * wallNormX + relY * wallNormY);

    const halfExtent = Math.max(item.width, item.height) / 2;
    const threshold = (wall.thickness || 15) / 2 + Math.min(item.width, item.height);
    if (perp > threshold) continue;
    if (along > -halfExtent && along < wallLen + halfExtent) return wall;
  }
  return null;
}

/** Compute along-wall distances from a door/window's edges to the wall endpoints */
function computeAlongWallDistances(
  item: FurnitureItem,
  wall: Wall
): { dist: number; furnitureEdgePt: Point; wallPt: Point; axis: "h" | "v" }[] {
  const wdx = wall.end.x - wall.start.x;
  const wdy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(wdx * wdx + wdy * wdy);
  if (wallLen < 1) return [];
  const wallDirX = wdx / wallLen;
  const wallDirY = wdy / wallLen;

  // Inset wall endpoints by half thickness so measurement lines stop at the
  // inner wall face instead of the centerline (which visually appears mid-wall).
  const halfThick = (wall.thickness || 15) / 2;

  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const relX = cx - wall.start.x;
  const relY = cy - wall.start.y;
  const along = relX * wallDirX + relY * wallDirY;

  const halfExtent = Math.max(item.width, item.height) / 2;
  const edgeStart = along - halfExtent;
  const edgeEnd = along + halfExtent;

  const distToStart = edgeStart - halfThick;
  const distToEnd = (wallLen - halfThick) - edgeEnd;

  // Use wall orientation to determine tick axis
  const axis: "h" | "v" = Math.abs(wdx) > Math.abs(wdy) ? "h" : "v";

  const results: { dist: number; furnitureEdgePt: Point; wallPt: Point; axis: "h" | "v" }[] = [];

  if (distToStart > 1) {
    results.push({
      dist: distToStart,
      furnitureEdgePt: {
        x: wall.start.x + wallDirX * edgeStart,
        y: wall.start.y + wallDirY * edgeStart,
      },
      wallPt: {
        x: wall.start.x + wallDirX * halfThick,
        y: wall.start.y + wallDirY * halfThick,
      },
      axis,
    });
  }

  if (distToEnd > 1) {
    results.push({
      dist: distToEnd,
      furnitureEdgePt: {
        x: wall.start.x + wallDirX * edgeEnd,
        y: wall.start.y + wallDirY * edgeEnd,
      },
      wallPt: {
        x: wall.end.x - wallDirX * halfThick,
        y: wall.end.y - wallDirY * halfThick,
      },
      axis,
    });
  }

  return results;
}

/** Draw distance measurement lines from selected furniture to nearby walls and objects */
export function drawDistanceMeasurements(
  ctx: CanvasRenderingContext2D,
  selectedItem: FurnitureItem,
  walls: Wall[],
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  units: UnitSystem = "m"
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const color = isDark ? "#e8894a" : "#d06220";

  // For doors/windows on a wall, show along-wall distances instead of perpendicular
  if (selectedItem.type === "door" || selectedItem.type === "door_double" || selectedItem.type === "window") {
    const hostWall = findHostWall(selectedItem, walls);
    if (hostWall) {
      const alongDists = computeAlongWallDistances(selectedItem, hostWall);
      const toDraw = alongDists;
      ctx.save();

      // First pass: draw all dashed lines and end ticks
      for (const d of toDraw) {
        const sx = d.furnitureEdgePt.x * pxPerCm + panOffset.x;
        const sy = d.furnitureEdgePt.y * pxPerCm + panOffset.y;
        const ex = d.wallPt.x * pxPerCm + panOffset.x;
        const ey = d.wallPt.y * pxPerCm + panOffset.y;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        const tickLen = 5;
        if (d.axis === "h") {
          ctx.beginPath();
          ctx.moveTo(sx, sy - tickLen); ctx.lineTo(sx, sy + tickLen);
          ctx.moveTo(ex, ey - tickLen); ctx.lineTo(ex, ey + tickLen);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(sx - tickLen, sy); ctx.lineTo(sx + tickLen, sy);
          ctx.moveTo(ex - tickLen, ey); ctx.lineTo(ex + tickLen, ey);
          ctx.stroke();
        }
      }

      // Second pass: draw all labels on top of lines
      for (const d of toDraw) {
        const sx = d.furnitureEdgePt.x * pxPerCm + panOffset.x;
        const sy = d.furnitureEdgePt.y * pxPerCm + panOffset.y;
        const ex = d.wallPt.x * pxPerCm + panOffset.x;
        const ey = d.wallPt.y * pxPerCm + panOffset.y;

        const text = formatLength(d.dist, units);
        const fontSize = Math.max(10, 11 * zoom);
        ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
        const textW = ctx.measureText(text).width;
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;

        const pad = 3;
        ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.85)" : "rgba(247, 246, 242, 0.85)";
        ctx.fillRect(mx - textW / 2 - pad, my - fontSize / 2 - pad, textW + pad * 2, fontSize + pad * 2);

        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, mx, my);
      }
      ctx.restore();
      return;
    }
  }

  // Gather all distances
  const wallDists = computeEdgeToWallDistances(selectedItem, walls);
  const furnDists = computeFurnitureToFurnitureDistances(selectedItem, furniture);
  const allDists = [...wallDists, ...furnDists.map(d => ({ dist: d.dist, furnitureEdgePt: d.fromPt, wallPt: d.toPt, axis: d.axis }))];

  // Keep only the closest distance per axis direction (1 horizontal, 1 vertical)
  const hDists = allDists.filter(d => d.axis === "h").sort((a, b) => a.dist - b.dist).slice(0, 1);
  const vDists = allDists.filter(d => d.axis === "v").sort((a, b) => a.dist - b.dist).slice(0, 1);
  const toDraw = [...hDists, ...vDists];

  ctx.save();

  // First pass: draw all dashed lines and end ticks
  for (const d of toDraw) {
    const sx = d.furnitureEdgePt.x * pxPerCm + panOffset.x;
    const sy = d.furnitureEdgePt.y * pxPerCm + panOffset.y;
    const ex = d.wallPt.x * pxPerCm + panOffset.x;
    const ey = d.wallPt.y * pxPerCm + panOffset.y;

    // Dimension line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // End ticks
    const tickLen = 5;
    if (d.axis === "h") {
      ctx.beginPath();
      ctx.moveTo(sx, sy - tickLen); ctx.lineTo(sx, sy + tickLen);
      ctx.moveTo(ex, ey - tickLen); ctx.lineTo(ex, ey + tickLen);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(sx - tickLen, sy); ctx.lineTo(sx + tickLen, sy);
      ctx.moveTo(ex - tickLen, ey); ctx.lineTo(ex + tickLen, ey);
      ctx.stroke();
    }
  }

  // Second pass: draw all labels on top of lines
  for (const d of toDraw) {
    const sx = d.furnitureEdgePt.x * pxPerCm + panOffset.x;
    const sy = d.furnitureEdgePt.y * pxPerCm + panOffset.y;
    const ex = d.wallPt.x * pxPerCm + panOffset.x;
    const ey = d.wallPt.y * pxPerCm + panOffset.y;

    const text = formatLength(d.dist, units);
    const fontSize = Math.max(10, 11 * zoom);
    ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const textW = ctx.measureText(text).width;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    // Background
    const pad = 3;
    ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.85)" : "rgba(247, 246, 242, 0.85)";
    ctx.fillRect(mx - textW / 2 - pad, my - fontSize / 2 - pad, textW + pad * 2, fontSize + pad * 2);

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, mx, my);
  }
  ctx.restore();
}

/** Rect info for a distance measurement label, used for collision avoidance */
export interface DistanceMeasurementLabelInfo {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

/** Collect distance measurement label rects without drawing — returns positions for collision detection */
export function collectDistanceMeasurementRects(
  ctx: CanvasRenderingContext2D,
  selectedItem: FurnitureItem,
  walls: Wall[],
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  units: UnitSystem = "m"
): DistanceMeasurementLabelInfo[] {
  const pxPerCm = (gridSize * zoom) / 100;
  const results: DistanceMeasurementLabelInfo[] = [];
  const pad = 3;
  const fontSize = Math.max(10, 11 * zoom);
  ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;

  // For doors/windows on a wall, compute along-wall distance label positions
  if (selectedItem.type === "door" || selectedItem.type === "door_double" || selectedItem.type === "window") {
    const hostWall = findHostWall(selectedItem, walls);
    if (hostWall) {
      const alongDists = computeAlongWallDistances(selectedItem, hostWall);
      for (const d of alongDists) {
        const sx = d.furnitureEdgePt.x * pxPerCm + panOffset.x;
        const sy = d.furnitureEdgePt.y * pxPerCm + panOffset.y;
        const ex = d.wallPt.x * pxPerCm + panOffset.x;
        const ey = d.wallPt.y * pxPerCm + panOffset.y;
        const text = formatLength(d.dist, units);
        const textW = ctx.measureText(text).width;
        results.push({
          centerX: (sx + ex) / 2,
          centerY: (sy + ey) / 2,
          halfW: textW / 2 + pad,
          halfH: fontSize / 2 + pad,
        });
      }
      return results;
    }
  }

  // Regular furniture: perpendicular distances to walls/furniture
  const wallDists = computeEdgeToWallDistances(selectedItem, walls);
  const furnDists = computeFurnitureToFurnitureDistances(selectedItem, furniture);
  const allDists = [...wallDists, ...furnDists.map(d => ({ dist: d.dist, furnitureEdgePt: d.fromPt, wallPt: d.toPt, axis: d.axis }))];

  const hDists = allDists.filter(d => d.axis === "h").sort((a, b) => a.dist - b.dist).slice(0, 1);
  const vDists = allDists.filter(d => d.axis === "v").sort((a, b) => a.dist - b.dist).slice(0, 1);
  const toDraw = [...hDists, ...vDists];

  for (const d of toDraw) {
    const sx = d.furnitureEdgePt.x * pxPerCm + panOffset.x;
    const sy = d.furnitureEdgePt.y * pxPerCm + panOffset.y;
    const ex = d.wallPt.x * pxPerCm + panOffset.x;
    const ey = d.wallPt.y * pxPerCm + panOffset.y;
    const text = formatLength(d.dist, units);
    const textW = ctx.measureText(text).width;
    results.push({
      centerX: (sx + ex) / 2,
      centerY: (sy + ey) / 2,
      halfW: textW / 2 + pad,
      halfH: fontSize / 2 + pad,
    });
  }

  return results;
}

/** Snap furniture position to wall edges. Returns adjusted {x, y} if a snap occurred. */
export interface SnappedWallEdge {
  wall: Wall;
  axis: 'x' | 'y';
  /** The world-cm coordinate of the wall edge that was snapped to */
  edgeCoord: number;
  /** Start/end of the wall edge segment (in the other axis) */
  segStart: number;
  segEnd: number;
}

export function snapFurnitureToWalls(
  item: FurnitureItem,
  walls: Wall[],
  threshold: number = 20 // cm tolerance for snapping
): { x: number; y: number; didSnap: boolean; snappedWallThickness?: number; snappedEdges: SnappedWallEdge[] } {
  let { x, y } = item;
  let didSnap = false;
  let snappedWallThickness: number | undefined;
  const snappedEdges: SnappedWallEdge[] = [];

  // Use AABB for rotated items
  const aabb = getFurnitureAABB(item);
  const aabbW = aabb.maxX - aabb.minX;
  const aabbH = aabb.maxY - aabb.minY;
  // Offset from item.x/y to AABB min
  const aabbOffX = aabb.minX - item.x;
  const aabbOffY = aabb.minY - item.y;
  const bb = { left: aabb.minX, right: aabb.maxX, top: aabb.minY, bottom: aabb.maxY };

  for (const wall of walls) {
    const ws = wall.start;
    const we = wall.end;
    const wdx = we.x - ws.x;
    const wdy = we.y - ws.y;
    const wlen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wlen < 1) continue;

    const halfThick = wall.thickness / 2;
    const isHorizontal = Math.abs(wdy / wlen) < 0.15;
    const isVertical = Math.abs(wdx / wlen) < 0.15;

    if (isHorizontal) {
      const wallY = (ws.y + we.y) / 2;
      const wallMinX = Math.min(ws.x, we.x);
      const wallMaxX = Math.max(ws.x, we.x);
      // Check X overlap
      if (bb.right > wallMinX && bb.left < wallMaxX) {
        const wallTopEdge = wallY - halfThick;
        const wallBottomEdge = wallY + halfThick;
        // Find closest Y edge to snap to (pick nearest)
        const candidates: { dist: number; newY: number; edgeCoord: number }[] = [];
        // Snap furniture bottom to wall top edge
        const d1 = Math.abs(bb.bottom - wallTopEdge);
        if (d1 < threshold) candidates.push({ dist: d1, newY: wallTopEdge - aabbH - aabbOffY, edgeCoord: wallTopEdge });
        // Snap furniture top to wall bottom edge
        const d2 = Math.abs(bb.top - wallBottomEdge);
        if (d2 < threshold) candidates.push({ dist: d2, newY: wallBottomEdge - aabbOffY, edgeCoord: wallBottomEdge });
        // Snap furniture top to wall top edge
        const d3 = Math.abs(bb.top - wallTopEdge);
        if (d3 < threshold) candidates.push({ dist: d3, newY: wallTopEdge - aabbOffY, edgeCoord: wallTopEdge });
        // Snap furniture bottom to wall bottom edge
        const d4 = Math.abs(bb.bottom - wallBottomEdge);
        if (d4 < threshold) candidates.push({ dist: d4, newY: wallBottomEdge - aabbH - aabbOffY, edgeCoord: wallBottomEdge });
        if (candidates.length > 0) {
          candidates.sort((a, b) => a.dist - b.dist);
          y = candidates[0].newY;
          didSnap = true; snappedWallThickness = wall.thickness;
          snappedEdges.push({ wall, axis: 'y', edgeCoord: candidates[0].edgeCoord, segStart: wallMinX, segEnd: wallMaxX });
        }
      }
      // Snap furniture edges to wall endpoints (horizontal alignment)
      if (bb.bottom > wallY - halfThick - threshold && bb.top < wallY + halfThick + threshold) {
        // Left edge to wall left end
        if (Math.abs(bb.left - wallMinX) < threshold) {
          x = wallMinX - aabbOffX;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Right edge to wall right end
        if (Math.abs(bb.right - wallMaxX) < threshold) {
          x = wallMaxX - aabbW - aabbOffX;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
      }
    }

    if (isVertical) {
      const wallX = (ws.x + we.x) / 2;
      const wallMinY = Math.min(ws.y, we.y);
      const wallMaxY = Math.max(ws.y, we.y);
      // Check Y overlap
      if (bb.bottom > wallMinY && bb.top < wallMaxY) {
        const wallLeftEdge = wallX - halfThick;
        const wallRightEdge = wallX + halfThick;
        // Find closest X edge to snap to (pick nearest)
        const candidates: { dist: number; newX: number; edgeCoord: number }[] = [];
        // Snap furniture right to wall left edge
        const d1 = Math.abs(bb.right - wallLeftEdge);
        if (d1 < threshold) candidates.push({ dist: d1, newX: wallLeftEdge - aabbW - aabbOffX, edgeCoord: wallLeftEdge });
        // Snap furniture left to wall right edge
        const d2 = Math.abs(bb.left - wallRightEdge);
        if (d2 < threshold) candidates.push({ dist: d2, newX: wallRightEdge - aabbOffX, edgeCoord: wallRightEdge });
        // Snap furniture left to wall left edge
        const d3 = Math.abs(bb.left - wallLeftEdge);
        if (d3 < threshold) candidates.push({ dist: d3, newX: wallLeftEdge - aabbOffX, edgeCoord: wallLeftEdge });
        // Snap furniture right to wall right edge
        const d4 = Math.abs(bb.right - wallRightEdge);
        if (d4 < threshold) candidates.push({ dist: d4, newX: wallRightEdge - aabbW - aabbOffX, edgeCoord: wallRightEdge });
        if (candidates.length > 0) {
          candidates.sort((a, b) => a.dist - b.dist);
          x = candidates[0].newX;
          didSnap = true; snappedWallThickness = wall.thickness;
          snappedEdges.push({ wall, axis: 'x', edgeCoord: candidates[0].edgeCoord, segStart: wallMinY, segEnd: wallMaxY });
        }
      }
      // Snap furniture edges to wall endpoints (vertical alignment)
      if (bb.right > wallX - halfThick - threshold && bb.left < wallX + halfThick + threshold) {
        // Top edge to wall top end
        if (Math.abs(bb.top - wallMinY) < threshold) {
          y = wallMinY - aabbOffY;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Bottom edge to wall bottom end
        if (Math.abs(bb.bottom - wallMaxY) < threshold) {
          y = wallMaxY - aabbH - aabbOffY;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
      }
    }
  }

  return { x, y, didSnap, snappedWallThickness, snappedEdges };
}

/** Draw dashed teal indicator lines along wall edges that an item is snapping to */
export function drawWallSnapIndicators(
  ctx: CanvasRenderingContext2D,
  snappedEdges: SnappedWallEdge[],
  gridSize: number,
  zoom: number,
  panOffset: Point
) {
  if (snappedEdges.length === 0) return;
  const pxPerCm = (gridSize * zoom) / 100;

  ctx.save();
  ctx.strokeStyle = "#1a7a5e";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.6;

  for (const edge of snappedEdges) {
    ctx.beginPath();
    if (edge.axis === 'y') {
      // Horizontal wall edge — draw horizontal line
      const px1 = edge.segStart * pxPerCm + panOffset.x;
      const px2 = edge.segEnd * pxPerCm + panOffset.x;
      const py = edge.edgeCoord * pxPerCm + panOffset.y;
      ctx.moveTo(px1, py);
      ctx.lineTo(px2, py);
    } else {
      // Vertical wall edge — draw vertical line
      const px = edge.edgeCoord * pxPerCm + panOffset.x;
      const py1 = edge.segStart * pxPerCm + panOffset.y;
      const py2 = edge.segEnd * pxPerCm + panOffset.y;
      ctx.moveTo(px, py1);
      ctx.lineTo(px, py2);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/** Draw a snap landing highlight (brief teal glow) on a furniture item */
export function drawSnapHighlight(
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

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((item.rotation * Math.PI) / 180);

  ctx.strokeStyle = "#1a7a5e";
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.7;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.restore();
}

/** Snap candidate from component-to-component snapping */
export interface SnappedComponentEdge {
  axis: 'x' | 'y';
  /** The world-cm coordinate of the snap line */
  edgeCoord: number;
  /** 'flush' = butt joint (opposing edges), 'align' = same edge alignment */
  snapType: 'flush' | 'align';
  /** ID of the target furniture item */
  targetId: string;
}

/**
 * Snap furniture to other furniture items (component-to-component).
 * Returns adjusted {x, y} and snapped edge info for rendering guide lines.
 * Uses AABB for rotated items, same as wall snap.
 */
export function snapFurnitureToItems(
  item: FurnitureItem,
  others: FurnitureItem[],
  threshold: number = 20
): { x: number; y: number; didSnap: boolean; snappedEdges: SnappedComponentEdge[] } {
  let { x, y } = item;
  let didSnap = false;
  const snappedEdges: SnappedComponentEdge[] = [];

  const aabb = getFurnitureAABB(item);
  const aabbW = aabb.maxX - aabb.minX;
  const aabbH = aabb.maxY - aabb.minY;
  const aabbOffX = aabb.minX - item.x;
  const aabbOffY = aabb.minY - item.y;

  // Pre-filter: only consider items within 2× threshold of dragging item's AABB
  const nearbyItems = others.filter(other =>
    other.id !== item.id &&
    other.x !== undefined &&
    getFurnitureAABB(other).maxX > aabb.minX - threshold * 2 &&
    getFurnitureAABB(other).minX < aabb.maxX + threshold * 2 &&
    getFurnitureAABB(other).maxY > aabb.minY - threshold * 2 &&
    getFurnitureAABB(other).minY < aabb.maxY + threshold * 2
  );

  // Collect candidates per axis, pick closest
  const xCandidates: { dist: number; newX: number; edgeCoord: number; snapType: 'flush' | 'align'; targetId: string }[] = [];
  const yCandidates: { dist: number; newY: number; edgeCoord: number; snapType: 'flush' | 'align'; targetId: string }[] = [];

  for (const other of nearbyItems) {
    const obb = getFurnitureAABB(other);

    // Check perpendicular overlap (items must be roughly aligned on the other axis)
    const yOverlap = aabb.minY < obb.maxY + threshold * 2 && aabb.maxY > obb.minY - threshold * 2;
    const xOverlap = aabb.minX < obb.maxX + threshold * 2 && aabb.maxX > obb.minX - threshold * 2;

    // X-axis snaps (only when items overlap on Y)
    if (yOverlap) {
      // Dragging LEFT edge → Other RIGHT edge (flush butt joint)
      const d1 = Math.abs(aabb.minX - obb.maxX);
      if (d1 <= threshold) xCandidates.push({ dist: d1, newX: obb.maxX - aabbOffX, edgeCoord: obb.maxX, snapType: 'flush', targetId: other.id });

      // Dragging RIGHT edge → Other LEFT edge (flush butt joint)
      const d2 = Math.abs(aabb.maxX - obb.minX);
      if (d2 <= threshold) xCandidates.push({ dist: d2, newX: obb.minX - aabbW - aabbOffX, edgeCoord: obb.minX, snapType: 'flush', targetId: other.id });

      // Dragging LEFT edge → Other LEFT edge (alignment)
      const d3 = Math.abs(aabb.minX - obb.minX);
      if (d3 <= threshold) xCandidates.push({ dist: d3, newX: obb.minX - aabbOffX, edgeCoord: obb.minX, snapType: 'align', targetId: other.id });

      // Dragging RIGHT edge → Other RIGHT edge (alignment)
      const d4 = Math.abs(aabb.maxX - obb.maxX);
      if (d4 <= threshold) xCandidates.push({ dist: d4, newX: obb.maxX - aabbW - aabbOffX, edgeCoord: obb.maxX, snapType: 'align', targetId: other.id });
    }

    // Y-axis snaps (only when items overlap on X)
    if (xOverlap) {
      // Dragging TOP edge → Other BOTTOM edge (flush)
      const d5 = Math.abs(aabb.minY - obb.maxY);
      if (d5 <= threshold) yCandidates.push({ dist: d5, newY: obb.maxY - aabbOffY, edgeCoord: obb.maxY, snapType: 'flush', targetId: other.id });

      // Dragging BOTTOM edge → Other TOP edge (flush)
      const d6 = Math.abs(aabb.maxY - obb.minY);
      if (d6 <= threshold) yCandidates.push({ dist: d6, newY: obb.minY - aabbH - aabbOffY, edgeCoord: obb.minY, snapType: 'flush', targetId: other.id });

      // Dragging TOP edge → Other TOP edge (alignment)
      const d7 = Math.abs(aabb.minY - obb.minY);
      if (d7 <= threshold) yCandidates.push({ dist: d7, newY: obb.minY - aabbOffY, edgeCoord: obb.minY, snapType: 'align', targetId: other.id });

      // Dragging BOTTOM edge → Other BOTTOM edge (alignment)
      const d8 = Math.abs(aabb.maxY - obb.maxY);
      if (d8 <= threshold) yCandidates.push({ dist: d8, newY: obb.maxY - aabbH - aabbOffY, edgeCoord: obb.maxY, snapType: 'align', targetId: other.id });
    }
  }

  // Pick closest candidate per axis
  if (xCandidates.length > 0) {
    xCandidates.sort((a, b) => a.dist - b.dist);
    const best = xCandidates[0];
    x = best.newX;
    didSnap = true;
    snappedEdges.push({ axis: 'x', edgeCoord: best.edgeCoord, snapType: best.snapType, targetId: best.targetId });
  }
  if (yCandidates.length > 0) {
    yCandidates.sort((a, b) => a.dist - b.dist);
    const best = yCandidates[0];
    y = best.newY;
    didSnap = true;
    snappedEdges.push({ axis: 'y', edgeCoord: best.edgeCoord, snapType: best.snapType, targetId: best.targetId });
  }

  return { x, y, didSnap, snappedEdges };
}

/**
 * Unified snap: walls first, then components. Closest snap per axis wins.
 * Returns combined wall + component snap edges for rendering.
 */
export function snapFurnitureToNearest(
  item: FurnitureItem,
  walls: Wall[],
  otherFurniture: FurnitureItem[],
  threshold: number = 20
): {
  x: number; y: number; didSnap: boolean;
  snappedWallThickness?: number;
  snappedWallEdges: SnappedWallEdge[];
  snappedComponentEdges: SnappedComponentEdge[];
} {
  // Get wall snap result
  const wallResult = snapFurnitureToWalls(item, walls, threshold);

  // Get component snap result (using original item position, not wall-snapped)
  const compResult = snapFurnitureToItems(item, otherFurniture, threshold);

  // For each axis, pick the closer snap (wall vs component)
  let finalX = item.x;
  let finalY = item.y;
  let didSnap = false;
  let snappedWallThickness = wallResult.snappedWallThickness;
  const snappedWallEdges: SnappedWallEdge[] = [];
  const snappedComponentEdges: SnappedComponentEdge[] = [];

  // Compute wall snap distances per axis
  const aabb = getFurnitureAABB(item);
  const wallXDist = wallResult.x !== item.x ? Math.abs(wallResult.x - item.x) : Infinity;
  const wallYDist = wallResult.y !== item.y ? Math.abs(wallResult.y - item.y) : Infinity;

  const compXEdge = compResult.snappedEdges.find(e => e.axis === 'x');
  const compYEdge = compResult.snappedEdges.find(e => e.axis === 'y');
  const compXDist = compResult.x !== item.x ? Math.abs(compResult.x - item.x) : Infinity;
  const compYDist = compResult.y !== item.y ? Math.abs(compResult.y - item.y) : Infinity;

  // X axis: pick closer
  if (wallXDist <= compXDist && wallXDist < Infinity) {
    finalX = wallResult.x;
    didSnap = true;
    // Include wall edges for X axis
    for (const e of wallResult.snappedEdges) {
      if (e.axis === 'x') snappedWallEdges.push(e);
    }
  } else if (compXDist < Infinity) {
    finalX = compResult.x;
    didSnap = true;
    if (compXEdge) snappedComponentEdges.push(compXEdge);
    snappedWallThickness = undefined; // component snap, not wall
  }

  // Y axis: pick closer
  if (wallYDist <= compYDist && wallYDist < Infinity) {
    finalY = wallResult.y;
    didSnap = true;
    for (const e of wallResult.snappedEdges) {
      if (e.axis === 'y') snappedWallEdges.push(e);
    }
  } else if (compYDist < Infinity) {
    finalY = compResult.y;
    didSnap = true;
    if (compYEdge) snappedComponentEdges.push(compYEdge);
  }

  // If wall snap won on both axes, preserve wall thickness
  if (snappedWallEdges.length === 0) snappedWallThickness = undefined;

  return { x: finalX, y: finalY, didSnap, snappedWallThickness, snappedWallEdges, snappedComponentEdges };
}

/** Draw solid teal indicator lines for component-to-component snaps */
export function drawComponentSnapIndicators(
  ctx: CanvasRenderingContext2D,
  snappedEdges: SnappedComponentEdge[],
  canvasWidth: number,
  canvasHeight: number,
  gridSize: number,
  zoom: number,
  panOffset: Point
) {
  if (snappedEdges.length === 0) return;
  const pxPerCm = (gridSize * zoom) / 100;

  ctx.save();

  for (const edge of snappedEdges) {
    ctx.beginPath();
    ctx.strokeStyle = "#1a7a5e";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.globalAlpha = edge.snapType === 'flush' ? 0.7 : 0.5;

    if (edge.axis === 'x') {
      const px = edge.edgeCoord * pxPerCm + panOffset.x;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvasHeight);
    } else {
      const py = edge.edgeCoord * pxPerCm + panOffset.y;
      ctx.moveTo(0, py);
      ctx.lineTo(canvasWidth, py);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/** Draw eraser hover highlight on the item that will be deleted */
export function drawEraserHighlight(
  ctx: CanvasRenderingContext2D,
  hoveredId: string,
  walls: Wall[],
  furniture: FurnitureItem[],
  labels: RoomLabel[],
  gridSize: number,
  zoom: number,
  panOffset: Point
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const ERASER_COLOR = "#e53935";
  const ERASER_FILL = "rgba(229, 57, 53, 0.12)";

  // Check walls
  const wall = walls.find((w) => w.id === hoveredId);
  if (wall) {
    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;

    ctx.save();
    ctx.strokeStyle = ERASER_COLOR;
    ctx.lineWidth = wall.thickness * pxPerCm + 4;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Red outline on top
    ctx.globalAlpha = 1;
    ctx.lineWidth = wall.thickness * pxPerCm + 4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // Check furniture
  const item = furniture.find((f) => f.id === hoveredId);
  if (item) {
    const x = item.x * pxPerCm + panOffset.x;
    const y = item.y * pxPerCm + panOffset.y;
    const w = item.width * pxPerCm;
    const h = item.height * pxPerCm;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((item.rotation * Math.PI) / 180);

    // Red semi-transparent fill
    ctx.fillStyle = ERASER_FILL;
    ctx.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);

    // Red dashed border
    ctx.strokeStyle = ERASER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // Check labels
  const label = labels.find((l) => l.id === hoveredId);
  if (label) {
    const lx = label.x * pxPerCm + panOffset.x;
    const ly = label.y * pxPerCm + panOffset.y;

    ctx.save();
    ctx.font = `600 ${label.fontSize * zoom}px 'General Sans', 'DM Sans', sans-serif`;
    const tm = ctx.measureText(label.text);
    const tw = tm.width;
    const th = label.fontSize * zoom;
    const pad = 6;

    // Red semi-transparent fill
    ctx.fillStyle = ERASER_FILL;
    ctx.fillRect(lx - tw / 2 - pad, ly - th / 2 - pad, tw + pad * 2, th + pad * 2);

    // Red dashed border
    ctx.strokeStyle = ERASER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(lx - tw / 2 - pad, ly - th / 2 - pad, tw + pad * 2, th + pad * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ==========================================
// Label Collision Avoidance System
// ==========================================

export interface ComponentLabelInfo {
  item: FurnitureItem;
  centerX: number;
  labelY: number;
  displayName: string;
  dimText: string;
  nameFontSize: number;
  dimFontSize: number;
  pillW: number;
  pillH: number;
  isSelected: boolean;
  nameColor: string;
  isInside: boolean;
}

/** Measure component labels without drawing — returns info needed for deferred rendering */
export function collectComponentLabelRects(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureItem[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null,
  units: UnitSystem = "m",
  walls: Wall[] = [],
  rooms: DetectedRoom[] = []
): ComponentLabelInfo[] {
  const pxPerCm = (gridSize * zoom) / 100;
  const results: ComponentLabelInfo[] = [];

  for (const item of furniture) {
    const baseCenterX = (item.x + item.width / 2) * pxPerCm + panOffset.x;
    const centerY = (item.y + item.height / 2) * pxPerCm + panOffset.y;
    const itemWidthPx = item.width * pxPerCm;
    const itemHeightPx = item.height * pxPerCm;
    const isSelected = item.id === selectedId;
    const centerX = baseCenterX;

    let labelX = centerX;
    let labelY: number;

    const isDoorOrWindow = item.type === "door" || item.type === "door_double" || item.type === "window";
    const outsideNormal = isDoorOrWindow ? computeOutsideLabelOffset(item, walls, rooms) : null;

    const displayName = item.customName || item.label;
    const dimText = `${item.width} \u00D7 ${item.height} cm`;

    const nameFontSize = Math.max(9, 11 * zoom);
    const dimFontSize = Math.max(8, 9 * zoom);

    ctx.font = `${isSelected ? "600" : "500"} ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const nameWidth = ctx.measureText(displayName).width;
    ctx.font = `400 ${dimFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const dimWidth = ctx.measureText(dimText).width;
    const maxWidth = Math.max(nameWidth, dimWidth);
    const pillW = maxWidth + 10;
    const pillH = nameFontSize + dimFontSize + 8;

    // Check if label fits inside the component
    const isLabelInsideType = item.labelInside ?? LABEL_INSIDE_TYPES.has(item.type);
    const isInside = isLabelInsideType
      && !isWallCupboard(item.type)
      && pillW < itemWidthPx * 0.95
      && pillH < itemHeightPx * 0.85;

    // Apply labelOffset (stored in cm, convert to px)
    const offsetPx = item.labelOffset
      ? { x: item.labelOffset.x * pxPerCm, y: item.labelOffset.y * pxPerCm }
      : { x: 0, y: 0 };

    if (outsideNormal) {
      // Offset label to the exterior side of the room
      const extent = Math.max(itemWidthPx, itemHeightPx) / 2;
      const offsetDist = extent + 14 * zoom;
      labelX = centerX + outsideNormal.nx * offsetDist + offsetPx.x;
      labelY = centerY + outsideNormal.ny * offsetDist + offsetPx.y;
    } else if (isInside) {
      labelX = centerX + offsetPx.x;
      labelY = centerY + offsetPx.y;
    } else {
      labelX = centerX + offsetPx.x;
      labelY = centerY + itemHeightPx / 2 + 14 * zoom + offsetPx.y;
    }

    const nameColor = isSelected
      ? (isDark ? "#4f98a3" : "#01696f")
      : (isDark ? "rgba(79, 152, 163, 0.65)" : "rgba(1, 105, 111, 0.55)");

    results.push({
      item, centerX: labelX, labelY, displayName, dimText,
      nameFontSize, dimFontSize, pillW, pillH, isSelected, nameColor, isInside,
    });
  }

  return results;
}

/** Draw a component label centered inside the component (no pill background) */
function drawInsideComponentLabel(
  ctx: CanvasRenderingContext2D,
  info: ComponentLabelInfo,
  pxPerCm: number,
  panOffset: Point,
  isDark: boolean,
  zoom: number = 1
) {
  const item = info.item;
  // Hide label when item is too small on screen
  const renderedWidth = item.width * pxPerCm;
  if (renderedWidth < 60) return;

  const cx = (item.x + item.width / 2) * pxPerCm + panOffset.x;
  const cy = (item.y + item.height / 2) * pxPerCm + panOffset.y;
  const rotation = (item.rotation * Math.PI) / 180;

  // Apply labelOffset in local (rotated) space
  const offsetPx = item.labelOffset
    ? { x: item.labelOffset.x * pxPerCm, y: item.labelOffset.y * pxPerCm }
    : { x: 0, y: 0 };

  ctx.save();
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);
  if (item.mirrored) ctx.scale(-1, 1); // counter-mirror so text reads normally

  const totalTextH = info.nameFontSize + info.dimFontSize + 2;
  const nameY = -totalTextH / 2 + offsetPx.y;
  const labelX = offsetPx.x;

  // Name
  ctx.font = `${info.isSelected ? "600" : "500"} ${info.nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
  ctx.fillStyle = info.nameColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(info.displayName, labelX, nameY);

  // Dimensions
  ctx.font = `400 ${info.dimFontSize}px 'General Sans', 'DM Sans', sans-serif`;
  ctx.fillStyle = isDark ? "rgba(121, 120, 118, 0.8)" : "rgba(122, 121, 116, 0.7)";
  ctx.fillText(info.dimText, labelX, nameY + info.nameFontSize + 2);

  ctx.restore();
}

/** Hit-test a screen point against component labels. Returns the FurnitureItem if hit, null otherwise. */
export function hitTestComponentLabel(
  screenX: number,
  screenY: number,
  componentLabelInfos: ComponentLabelInfo[]
): FurnitureItem | null {
  for (let i = componentLabelInfos.length - 1; i >= 0; i--) {
    const info = componentLabelInfos[i];
    const lx = info.centerX;
    const ly = info.labelY;
    const halfW = info.pillW / 2 + 4;
    const halfH = info.pillH / 2 + 4;
    if (
      screenX >= lx - halfW && screenX <= lx + halfW &&
      screenY >= ly - halfH && screenY <= ly + halfH
    ) {
      return info.item;
    }
  }
  return null;
}

/** Draw a single component label at a given position */
function drawSingleComponentLabel(
  ctx: CanvasRenderingContext2D,
  info: ComponentLabelInfo,
  drawX: number,
  drawY: number,
  isDark: boolean
) {
  const { displayName, dimText, nameFontSize, dimFontSize, pillW, pillH, isSelected, nameColor } = info;

  // Background pill
  const pillX = drawX - pillW / 2;
  const pillY = drawY - 2;
  ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.7)" : "rgba(247, 246, 242, 0.75)";
  ctx.beginPath();
  const r = 4;
  ctx.moveTo(pillX + r, pillY);
  ctx.lineTo(pillX + pillW - r, pillY);
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + r, r);
  ctx.lineTo(pillX + pillW, pillY + pillH - r);
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH, r);
  ctx.lineTo(pillX + r, pillY + pillH);
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - r, r);
  ctx.lineTo(pillX, pillY + r);
  ctx.arcTo(pillX, pillY, pillX + r, pillY, r);
  ctx.closePath();
  ctx.fill();

  // Name
  ctx.font = `${isSelected ? "600" : "500"} ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
  ctx.fillStyle = nameColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(displayName, drawX, drawY);

  // Dimensions
  ctx.font = `400 ${dimFontSize}px 'General Sans', 'DM Sans', sans-serif`;
  ctx.fillStyle = isDark ? "rgba(121, 120, 118, 0.8)" : "rgba(122, 121, 116, 0.7)";
  ctx.fillText(dimText, drawX, drawY + nameFontSize + 2);
}

/** Draw a single freeform label at a given position */
function drawSingleFreeformLabel(
  ctx: CanvasRenderingContext2D,
  label: RoomLabel,
  drawX: number,
  drawY: number,
  isDark: boolean,
  isSelected: boolean,
  zoom: number = 1
) {
  const resolvedSize = resolveLabelSize(label.size);
  const fontSize = resolvedSize * zoom;
  const weight = label.bold ? "700" : "600";
  ctx.font = `${weight} ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;

  const textWidth = ctx.measureText(label.text).width;
  const textHeight = fontSize;

  if (label.background) {
    const padX = 8;
    const padY = 4;
    const pW = textWidth + padX * 2;
    const pH = textHeight + padY * 2;
    const pX = drawX - pW / 2;
    const pY = drawY - pH / 2;
    const rr = pH / 2;

    ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.85)" : "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.moveTo(pX + rr, pY);
    ctx.lineTo(pX + pW - rr, pY);
    ctx.arcTo(pX + pW, pY, pX + pW, pY + rr, rr);
    ctx.arcTo(pX + pW, pY + pH, pX + pW - rr, pY + pH, rr);
    ctx.lineTo(pX + rr, pY + pH);
    ctx.arcTo(pX, pY + pH, pX, pY + pH - rr, rr);
    ctx.arcTo(pX, pY, pX + rr, pY, rr);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = resolveLabelColor(label.color, isDark, isSelected);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.text, drawX, drawY);
}

interface LabelRect {
  x: number; // center x (screen px)
  y: number; // center y (screen px)
  w: number; // half-width
  h: number; // half-height
  priority: number; // 0 = highest (room), 1 = wall, 2 = component, 3 = freeform
  anchorX: number; // original anchor point
  anchorY: number;
  sourceIndex: number; // index into source array (-1 for room/wall labels)
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return (
    Math.abs(a.x - b.x) < a.w + b.w + 2 &&
    Math.abs(a.y - b.y) < a.h + b.h + 2
  );
}

/** Run collision detection and nudge overlapping labels. Draws leader lines for nudged labels. */
export function resolveAndDrawLabelCollisions(
  ctx: CanvasRenderingContext2D,
  rooms: DetectedRoom[],
  walls: Wall[],
  componentLabelInfos: ComponentLabelInfo[],
  labels: RoomLabel[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  roomNames: Record<string, string>,
  componentLabelsVisible: boolean,
  selectedId: string | null,
  labelPositions: Map<string, Point> = new Map(),
  distanceMeasurementRects: DistanceMeasurementLabelInfo[] = []
): void {
  // Collect all label rects with priority
  const allRects: LabelRect[] = [];
  const pxPerCm = (gridSize * zoom) / 100;

  // Room labels (priority 0) — immovable anchors, already drawn by drawRoomAreas
  for (const room of rooms) {
    const roomKey = getRoomKey(room);
    const labelPos = labelPositions.get(roomKey) || room.centroid;
    const cx = labelPos.x * pxPerCm + panOffset.x;
    const cy = labelPos.y * pxPerCm + panOffset.y;
    const name = roomNames[roomKey] || "Room";
    const nameFontSize = Math.max(11, 14 * zoom);
    const areaFontSize = Math.max(9, 11 * zoom);
    ctx.font = `600 ${nameFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const nameW = ctx.measureText(name).width;
    const totalH = nameFontSize + areaFontSize + 4;
    allRects.push({
      x: cx, y: cy, w: nameW / 2 + 4, h: totalH / 2 + 2,
      priority: 0, anchorX: cx, anchorY: cy, sourceIndex: -1,
    });
  }

  // Distance measurement labels (priority 1) — immovable anchors, already drawn by drawDistanceMeasurements
  for (const dm of distanceMeasurementRects) {
    allRects.push({
      x: dm.centerX, y: dm.centerY, w: dm.halfW, h: dm.halfH,
      priority: 1, anchorX: dm.centerX, anchorY: dm.centerY, sourceIndex: -1,
    });
  }

  // Component labels (priority 2) — only outside labels participate in collision
  if (componentLabelsVisible) {
    for (let i = 0; i < componentLabelInfos.length; i++) {
      const info = componentLabelInfos[i];
      if (info.isInside) continue;
      const totalH = info.pillH;
      allRects.push({
        x: info.centerX, y: info.labelY + totalH / 2 - 2,
        w: info.pillW / 2 + 4, h: totalH / 2 + 2,
        priority: 2, anchorX: info.centerX, anchorY: info.labelY,
        sourceIndex: i,
      });
    }
  }

  // Freeform labels (priority 3)
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const x = label.x * pxPerCm + panOffset.x;
    const y = label.y * pxPerCm + panOffset.y;
    const resolvedSize = resolveLabelSize(label.size);
    const fontSize = resolvedSize * zoom;
    const weight = label.bold ? "700" : "600";
    ctx.font = `${weight} ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const textW = ctx.measureText(label.text).width;
    allRects.push({
      x, y, w: textW / 2 + 4, h: fontSize / 2 + 4,
      priority: 3, anchorX: x, anchorY: y, sourceIndex: i,
    });
  }

  // Sort by priority (highest priority = lowest number = processed first)
  allRects.sort((a, b) => a.priority - b.priority);

  // Nudge lower-priority labels away from higher-priority ones
  const nudgedLabels: { rect: LabelRect; nudged: boolean }[] = [];
  for (const rect of allRects) {
    let nudged = false;
    for (const placed of nudgedLabels) {
      if (rectsOverlap(rect, placed.rect)) {
        // Nudge along perpendicular axis (vertical)
        const dy = rect.y - placed.rect.y;
        const nudgeDir = dy >= 0 ? 1 : -1;
        const needed = placed.rect.h + rect.h + 4 - Math.abs(dy);
        if (needed > 0) {
          rect.y += nudgeDir * needed;
          nudged = true;
        }
      }
    }
    nudgedLabels.push({ rect, nudged });
  }

  // Draw leader lines for nudged labels, then draw labels at resolved positions
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = isDark ? "rgba(79, 152, 163, 0.25)" : "rgba(1, 105, 111, 0.2)";

  for (const { rect, nudged } of nudgedLabels) {
    if (nudged && Math.abs(rect.y - rect.anchorY) > 4) {
      ctx.beginPath();
      ctx.moveTo(rect.anchorX, rect.anchorY);
      ctx.lineTo(rect.x, rect.y);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.restore();

  // Draw component labels at their resolved (possibly nudged) positions
  if (componentLabelsVisible) {
    for (const { rect } of nudgedLabels) {
      if (rect.priority === 2 && rect.sourceIndex >= 0) {
        const info = componentLabelInfos[rect.sourceIndex];
        // rect.y is the center of the label rect; convert back to top-of-label Y
        const resolvedLabelY = rect.y - info.pillH / 2 + 2;
        drawSingleComponentLabel(ctx, info, rect.x, resolvedLabelY, isDark);
      }
    }

    // Draw inside-component labels (not collision-resolved, anchored inside)
    for (const info of componentLabelInfos) {
      if (info.isInside) {
        drawInsideComponentLabel(ctx, info, pxPerCm, panOffset, isDark, zoom);
      }
    }
  }

  // Draw freeform labels at their resolved (possibly nudged) positions
  for (const { rect } of nudgedLabels) {
    if (rect.priority === 3 && rect.sourceIndex >= 0) {
      const label = labels[rect.sourceIndex];
      const isSelected = label.id === selectedId;
      drawSingleFreeformLabel(ctx, label, rect.x, rect.y, isDark, isSelected, zoom);
    }
  }
}

/** Detect parallel wall pairs with different lengths and flag with amber color */
export function findParallelWallDiscrepancies(
  walls: Wall[]
): Set<string> {
  const flagged = new Set<string>();
  const PARALLEL_THRESHOLD = 0.05; // cross product threshold
  const DISTANCE_THRESHOLD = 500; // cm - max distance between walls to consider them a pair

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i];
      const b = walls[j];

      const dxA = a.end.x - a.start.x;
      const dyA = a.end.y - a.start.y;
      const lenA = Math.sqrt(dxA * dxA + dyA * dyA);
      if (lenA < 10) continue;

      const dxB = b.end.x - b.start.x;
      const dyB = b.end.y - b.start.y;
      const lenB = Math.sqrt(dxB * dxB + dyB * dyB);
      if (lenB < 10) continue;

      // Check if parallel
      const cross = Math.abs((dxA / lenA) * (dyB / lenB) - (dyA / lenA) * (dxB / lenB));
      if (cross > PARALLEL_THRESHOLD) continue;

      // Check if close enough (perpendicular distance between midpoints)
      const midAx = (a.start.x + a.end.x) / 2;
      const midAy = (a.start.y + a.end.y) / 2;
      const midBx = (b.start.x + b.end.x) / 2;
      const midBy = (b.start.y + b.end.y) / 2;
      const perpDist = Math.sqrt((midAx - midBx) ** 2 + (midAy - midBy) ** 2);
      if (perpDist > DISTANCE_THRESHOLD) continue;

      // Check if lengths differ significantly (> 1cm)
      if (Math.abs(lenA - lenB) > 1) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }

  return flagged;
}

/** Draw wall labels with amber highlight for discrepant parallel walls */
export function drawWallLabelsWithDiscrepancy(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  units: UnitSystem,
  measureMode: MeasureMode,
  furniture: FurnitureItem[],
  flaggedWalls: Set<string>,
  canvasWidth: number,
  canvasHeight: number
) {
  // Collect all wall label positions for crowding check
  const pxPerCm = (gridSize * zoom) / 100;

  interface WallLabelInfo {
    wallId: string;
    screenX: number;
    screenY: number;
    textWidth: number;
    lengthCm: number;
    isFlagged: boolean;
  }

  const labelInfos: WallLabelInfo[] = [];

  walls.forEach((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);
    if (lengthCm <= 10) return;

    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    // Check if on screen
    if (mx < -50 || mx > canvasWidth + 50 || my < -50 || my > canvasHeight + 50) return;

    const displayLengthCm = measureMode === "inside"
      ? Math.max(0, lengthCm - 2 * (wall.thickness || 15))
      : lengthCm;
    const baseFontSize = Math.max(11, 12 * zoom);
    const text = formatLength(displayLengthCm, units);
    ctx.font = `500 ${baseFontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const textWidth = ctx.measureText(text).width;

    labelInfos.push({
      wallId: wall.id,
      screenX: mx,
      screenY: my,
      textWidth,
      lengthCm,
      isFlagged: flaggedWalls.has(wall.id),
    });
  });

  // At very low zoom, check for crowding and hide less important labels
  let hiddenCount = 0;
  const visibleSet = new Set<string>();
  const sortedByLength = [...labelInfos].sort((a, b) => b.lengthCm - a.lengthCm);

  for (const info of sortedByLength) {
    let overlaps = false;
    for (const visId of visibleSet) {
      const vis = labelInfos.find((l) => l.wallId === visId);
      if (!vis) continue;
      const dx = Math.abs(info.screenX - vis.screenX);
      const dy = Math.abs(info.screenY - vis.screenY);
      if (dx < (info.textWidth + vis.textWidth) / 2 + 8 && dy < 20) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      visibleSet.add(info.wallId);
    } else {
      hiddenCount++;
    }
  }

  // Draw "+N hidden" indicator if any labels were hidden
  if (hiddenCount > 0) {
    const fontSize = Math.max(10, 11 * zoom);
    ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
    const text = `+${hiddenCount} hidden`;
    const textW = ctx.measureText(text).width;
    const x = canvasWidth - textW - 16;
    const y = 16;

    ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.75)" : "rgba(247, 246, 242, 0.8)";
    ctx.fillRect(x - 6, y - 2, textW + 12, fontSize + 6);
    ctx.fillStyle = isDark ? "#797876" : "#7a7974";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  return { visibleSet, hiddenCount };
}

export function drawWallCupboardLegend(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isDark: boolean
) {
  const text = "Dashed outline = wall cupboard (overhead)";
  const fontSize = 11;
  ctx.font = `400 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
  const tm = ctx.measureText(text);
  const padding = 8;
  const iconW = 18;
  const iconH = 12;
  const gap = 6;
  const totalW = iconW + gap + tm.width + padding * 2;
  const totalH = fontSize + padding * 2;
  const x = w / 2 - totalW / 2;
  const y = h - totalH - 8;

  // Background
  ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.85)" : "rgba(247, 246, 242, 0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, totalW, totalH, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = isDark ? "#3a3938" : "#d4d1ca";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.roundRect(x, y, totalW, totalH, 4);
  ctx.stroke();

  // Mini icon: dashed rect with cross
  const ix = x + padding;
  const iy = y + (totalH - iconH) / 2;
  ctx.strokeStyle = isDark ? "#797876" : "#7a7974";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(ix, iy, iconW, iconH);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ix, iy);
  ctx.lineTo(ix + iconW, iy + iconH);
  ctx.moveTo(ix + iconW, iy);
  ctx.lineTo(ix, iy + iconH);
  ctx.strokeStyle = isDark ? "rgba(90, 89, 87, 0.5)" : "rgba(186, 185, 180, 0.6)";
  ctx.stroke();

  // Text
  ctx.fillStyle = isDark ? "#9a9994" : "#5a5954";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, ix + iconW + gap, y + totalH / 2);
}

// ==========================================
// Arrow Annotations
// ==========================================

/** Draw an arrowhead (filled triangle or open V) at a given point along a direction */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number, // direction the arrow is pointing (radians)
  size: number,
  style: ArrowHeadStyle,
  color: string
) {
  if (style === "none") return;
  const halfAngle = Math.PI / 7; // ~25 degrees
  const x1 = tipX - size * Math.cos(angle - halfAngle);
  const y1 = tipY - size * Math.sin(angle - halfAngle);
  const x2 = tipX - size * Math.cos(angle + halfAngle);
  const y2 = tipY - size * Math.sin(angle + halfAngle);

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(x1, y1);
  if (style === "filled") {
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    // open
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** Draw all arrows on the canvas */
export function drawArrows(
  ctx: CanvasRenderingContext2D,
  arrows: Arrow[],
  gridSize: number,
  zoom: number,
  panOffset: Point,
  isDark: boolean,
  selectedId: string | null
) {
  const pxPerCm = (gridSize * zoom) / 100;

  for (const arrow of arrows) {
    const sx = arrow.startX * pxPerCm + panOffset.x;
    const sy = arrow.startY * pxPerCm + panOffset.y;
    const ex = arrow.endX * pxPerCm + panOffset.x;
    const ey = arrow.endY * pxPerCm + panOffset.y;
    const isSelected = arrow.id === selectedId;
    const color = arrow.strokeColor;
    const lineWidth = arrow.strokeWidth * zoom;
    const headSize = Math.max(10, 12 * zoom);

    // Draw the line
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    if (arrow.strokeStyle === "dashed") {
      ctx.setLineDash([8 * zoom, 5 * zoom]);
    }
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw arrowheads
    const angle = Math.atan2(ey - sy, ex - sx);
    drawArrowHead(ctx, ex, ey, angle, headSize, arrow.headStyle, color);
    drawArrowHead(ctx, sx, sy, angle + Math.PI, headSize, arrow.tailStyle, color);

    // Draw label if present
    if (arrow.label) {
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const fontSize = Math.max(10, 12 * zoom);
      ctx.font = `500 ${fontSize}px 'General Sans', 'DM Sans', sans-serif`;
      const textW = ctx.measureText(arrow.label).width;
      const pad = 4;

      // Background
      ctx.fillStyle = isDark ? "rgba(23, 22, 20, 0.85)" : "rgba(247, 246, 242, 0.9)";
      ctx.fillRect(mx - textW / 2 - pad, my - fontSize / 2 - pad, textW + pad * 2, fontSize + pad * 2);

      // Text
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(arrow.label, mx, my);
    }

    // Selection highlight
    if (isSelected) {
      ctx.strokeStyle = SELECT_COLOR;
      ctx.lineWidth = lineWidth + 4;
      ctx.globalAlpha = 0.25;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Endpoint handles
      for (const [px, py] of [[sx, sy], [ex, ey]]) {
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = SELECT_COLOR;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

/** Draw a preview arrow while the user is placing the second point */
export function drawArrowPreview(
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

  ctx.save();
  ctx.strokeStyle = isDark ? "#cdccca" : "#3a3938";
  ctx.lineWidth = 2 * zoom;
  ctx.lineCap = "round";
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  // Preview arrowhead at end
  const angle = Math.atan2(ey - sy, ex - sx);
  const headSize = Math.max(10, 12 * zoom);
  drawArrowHead(ctx, ex, ey, angle, headSize, "filled", isDark ? "#cdccca" : "#3a3938");

  // Start point indicator
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.fillStyle = SELECT_COLOR;
  ctx.fill();

  ctx.restore();
}

/** Hit-test arrows — returns the arrow if the click is near its line segment */
export function hitTestArrow(
  screenX: number,
  screenY: number,
  arrows: Arrow[],
  gridSize: number,
  zoom: number,
  panOffset: Point
): Arrow | null {
  const pxPerCm = (gridSize * zoom) / 100;
  const threshold = 10; // px

  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i];
    const sx = arrow.startX * pxPerCm + panOffset.x;
    const sy = arrow.startY * pxPerCm + panOffset.y;
    const ex = arrow.endX * pxPerCm + panOffset.x;
    const ey = arrow.endY * pxPerCm + panOffset.y;

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

    if (dist < threshold + arrow.strokeWidth * zoom) {
      return arrow;
    }
  }
  return null;
}

/** Hit-test arrow endpoint handles — returns "start" or "end" if near a handle */
export function hitTestArrowEndpoint(
  screenX: number,
  screenY: number,
  arrow: Arrow,
  gridSize: number,
  zoom: number,
  panOffset: Point
): "start" | "end" | null {
  const pxPerCm = (gridSize * zoom) / 100;
  const threshold = 10;

  const sx = arrow.startX * pxPerCm + panOffset.x;
  const sy = arrow.startY * pxPerCm + panOffset.y;
  const ex = arrow.endX * pxPerCm + panOffset.x;
  const ey = arrow.endY * pxPerCm + panOffset.y;

  const distStart = Math.sqrt((screenX - sx) ** 2 + (screenY - sy) ** 2);
  const distEnd = Math.sqrt((screenX - ex) ** 2 + (screenY - ey) ** 2);

  if (distEnd < threshold) return "end";
  if (distStart < threshold) return "start";
  return null;
}
