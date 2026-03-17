import { Wall, FurnitureItem, RoomLabel, Point, UnitSystem, MeasureMode, LabelColor, isWallCupboard } from "./types";
import { DetectedRoom } from "./room-detection";

/** Convert cm to display string based on unit system */
function formatLength(cm: number, units: UnitSystem): string {
  if (units === "imperial") {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    if (inches === 12) return `${feet + 1}'0"`;
    if (feet === 0) return `${inches}"`;
    return `${feet}'${inches}"`;
  }
  return `${(cm / 100).toFixed(2)}m`;
}

/** Convert m² to display string based on unit system */
function formatArea(sqM: number, units: UnitSystem): string {
  if (units === "imperial") {
    const sqFt = sqM * 10.7639;
    return `${sqFt.toFixed(1)} sq ft`;
  }
  return `${sqM.toFixed(1)} m\u00B2`;
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
  units: UnitSystem = "metric",
  measureMode: MeasureMode = "inside",
  furniture: FurnitureItem[] = []
) {
  const pxPerCm = (gridSize * zoom) / 100;

  // Find collinear wall groups for merged labels
  const collinearGroups = findCollinearGroups(walls);
  const mergedWallIds = new Set<string>();
  for (const group of collinearGroups.values()) {
    for (const id of group.wallIds) mergedWallIds.add(id);
  }

  // Draw all wall lines
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
  });

  // Draw individual labels for non-merged walls
  walls.forEach((wall) => {
    if (mergedWallIds.has(wall.id)) return; // will be labeled by group

    const sx = wall.start.x * pxPerCm + panOffset.x;
    const sy = wall.start.y * pxPerCm + panOffset.y;
    const ex = wall.end.x * pxPerCm + panOffset.x;
    const ey = wall.end.y * pxPerCm + panOffset.y;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);
    const wallThick = wall.thickness || 15;
    const displayLengthCm = measureMode === "inside"
      ? Math.max(0, lengthCm - wallThick)
      : lengthCm;
    if (lengthCm > 10) {
      drawWallDimensionLabel(ctx, sx, sy, ex, ey, displayLengthCm, wall.thickness * pxPerCm, zoom, isDark, units, wall, furniture, gridSize, panOffset);
    }
  });

  // Draw merged labels for collinear groups
  for (const group of collinearGroups.values()) {
    const sx = group.minP.x * pxPerCm + panOffset.x;
    const sy = group.minP.y * pxPerCm + panOffset.y;
    const ex = group.maxP.x * pxPerCm + panOffset.x;
    const ey = group.maxP.y * pxPerCm + panOffset.y;
    const thickness = walls[0]?.thickness ?? 15;
    const displayLengthCm = measureMode === "inside"
      ? Math.max(0, group.totalLengthCm - thickness)
      : group.totalLengthCm;
    // Find the actual wall for collision detection
    const groupWallIds = group.wallIds;
    const representativeWall = walls.find((w) => groupWallIds.has(w.id)) || walls[0];
    drawWallDimensionLabel(ctx, sx, sy, ex, ey, displayLengthCm, thickness * pxPerCm, zoom, isDark, units, representativeWall, furniture, gridSize, panOffset);
  }
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
  units: UnitSystem = "metric",
  measureMode: MeasureMode = "inside"
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const color = isDark ? DIMENSION_COLOR_DARK : DIMENSION_COLOR_LIGHT;
  const doorsWindows = furniture.filter((f) => f.type === "door" || f.type === "window");
  if (doorsWindows.length === 0) return;

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

    if (occupants.length === 0) continue;

    // Sort occupants by position along wall
    occupants.sort((a, b) => a.along - b.along);

    // Compute segments: wall start -> first door edge, between doors, last door edge -> wall end
    const segments: { startAlong: number; endAlong: number }[] = [];
    let prevEnd = 0;
    for (const occ of occupants) {
      const edgeStart = occ.along - occ.halfExtent;
      const edgeEnd = occ.along + occ.halfExtent;
      if (edgeStart > prevEnd + 1) {
        segments.push({ startAlong: prevEnd, endAlong: edgeStart });
      }
      prevEnd = Math.max(prevEnd, edgeEnd);
    }
    if (wallLen - prevEnd > 1) {
      segments.push({ startAlong: prevEnd, endAlong: wallLen });
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
    for (const room of rooms) {
      // Check if both endpoints of this wall are vertices of this room
      const hasStart = room.vertices.some(v =>
        Math.sqrt((v.x - wall.start.x) ** 2 + (v.y - wall.start.y) ** 2) < 15
      );
      const hasEnd = room.vertices.some(v =>
        Math.sqrt((v.x - wall.end.x) ** 2 + (v.y - wall.end.y) ** 2) < 15
      );

      if (hasStart && hasEnd) {
        const toCentroid = { x: room.centroid.x - wallMid.x, y: room.centroid.y - wallMid.y };
        const dot = toCentroid.x * nx + toCentroid.y * ny;
        if (dot < 0) {
          insideNx = -nx;
          insideNy = -ny;
        }
        foundRoom = true;
        break;
      }
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
    if (item.type !== "door" && item.type !== "window") continue;

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
  units: UnitSystem = "metric",
  wall?: Wall,
  furniture?: FurnitureItem[],
  gridSize?: number,
  panOffset?: Point
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
  let offsetPerp = false;
  if (wall && furniture && gridSize && panOffset) {
    const occupants = findComponentsOnWall(wall, furniture, gridSize, zoom, panOffset);
    if (occupants.length > 0) {
      const textFrac = wallLengthPx > 0 ? (textWidth + pad * 2) / wallLengthPx : 1;
      const result = findOptimalLabelPosition(occupants, textFrac);
      labelFrac = result.position;
      offsetPerp = result.offsetPerp;
    }
  }

  // Compute label center position along wall
  const mx = sx + (ex - sx) * labelFrac;
  const my = sy + (ey - sy) * labelFrac;

  // Perpendicular offset for collision avoidance
  const perpOffsetPx = offsetPerp ? -(wallThicknessPx / 2 + baseFontSize + 8) : 0;
  const normX = -Math.sin(angle);
  const normY = Math.cos(angle);
  const finalX = mx + normX * perpOffsetPx;
  const finalY = my + normY * perpOffsetPx;

  ctx.save();
  ctx.translate(finalX, finalY);
  let textAngle = angle;
  if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
    textAngle += Math.PI;
  }
  ctx.rotate(textAngle);

  if (textWidth + pad * 2 < wallLengthPx - 4) {
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
    const offsetY = -(wallThicknessPx / 2) - baseFontSize - 2;
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
  units: UnitSystem = "metric",
  roomNames: Record<string, string> = {},
  selectedRoomKey: string | null = null
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

    // Draw room name + area text at centroid
    const cx = room.centroid.x * pxPerCm + panOffset.x;
    const cy = room.centroid.y * pxPerCm + panOffset.y;

    const roomKey = getRoomKey(room);
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
  roomNames: Record<string, string>
): { roomKey: string; centroid: Point } | null {
  const pxPerCm = (gridSize * zoom) / 100;

  for (const room of rooms) {
    const cx = room.centroid.x * pxPerCm + panOffset.x;
    const cy = room.centroid.y * pxPerCm + panOffset.y;
    const roomKey = getRoomKey(room);
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
      return { roomKey, centroid: room.centroid };
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
  units: UnitSystem = "metric"
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
  units: UnitSystem = "metric",
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
      // Draw arc between the adjoining wall's incoming direction and the new wall
      const adjIncoming = adjWallAngleRad + Math.PI;
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

  for (const c of corners) {
    if (
      Math.abs(localX - c.cx) <= handleSize &&
      Math.abs(localY - c.cy) <= handleSize
    ) {
      return c.corner;
    }
  }

  // Edge handles at midpoints (tested after corners so corners take priority)
  const edgeHandles: { cx: number; cy: number; corner: ResizeCorner }[] = [
    { cx: 0, cy: -h / 2, corner: "t" },
    { cx: 0, cy: h / 2, corner: "b" },
    { cx: -w / 2, cy: 0, corner: "l" },
    { cx: w / 2, cy: 0, corner: "r" },
  ];

  for (const e of edgeHandles) {
    if (
      Math.abs(localX - e.cx) <= handleSize &&
      Math.abs(localY - e.cy) <= handleSize
    ) {
      return e.corner;
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

  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const relX = cx - wall.start.x;
  const relY = cy - wall.start.y;
  const along = relX * wallDirX + relY * wallDirY;

  const halfExtent = Math.max(item.width, item.height) / 2;
  const edgeStart = along - halfExtent;
  const edgeEnd = along + halfExtent;

  const distToStart = edgeStart;
  const distToEnd = wallLen - edgeEnd;

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
      wallPt: { x: wall.start.x, y: wall.start.y },
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
      wallPt: { x: wall.end.x, y: wall.end.y },
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
  units: UnitSystem = "metric"
) {
  const pxPerCm = (gridSize * zoom) / 100;
  const color = isDark ? "#e8894a" : "#d06220";

  // For doors/windows on a wall, show along-wall distances instead of perpendicular
  if (selectedItem.type === "door" || selectedItem.type === "window") {
    const hostWall = findHostWall(selectedItem, walls);
    if (hostWall) {
      const alongDists = computeAlongWallDistances(selectedItem, hostWall);
      const toDraw = alongDists;
      ctx.save();
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

  // Keep only the closest distance per axis direction (up to 2 horizontal, 2 vertical)
  const hDists = allDists.filter(d => d.axis === "h").sort((a, b) => a.dist - b.dist).slice(0, 2);
  const vDists = allDists.filter(d => d.axis === "v").sort((a, b) => a.dist - b.dist).slice(0, 2);
  const toDraw = [...hDists, ...vDists];

  ctx.save();
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

    // Label
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

/** Snap furniture position to wall edges. Returns adjusted {x, y} if a snap occurred. */
export function snapFurnitureToWalls(
  item: FurnitureItem,
  walls: Wall[],
  threshold: number = 12 // cm tolerance for snapping
): { x: number; y: number; didSnap: boolean; snappedWallThickness?: number } {
  let { x, y } = item;
  let didSnap = false;
  let snappedWallThickness: number | undefined;
  const bb = { left: x, right: x + item.width, top: y, bottom: y + item.height };

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
        // Snap furniture bottom to wall top edge
        if (Math.abs(bb.bottom - wallTopEdge) < threshold) {
          y = wallTopEdge - item.height;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Snap furniture top to wall bottom edge
        if (Math.abs(bb.top - wallBottomEdge) < threshold) {
          y = wallBottomEdge;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Snap furniture top to wall top edge
        if (Math.abs(bb.top - wallTopEdge) < threshold) {
          y = wallTopEdge;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Snap furniture bottom to wall bottom edge
        if (Math.abs(bb.bottom - wallBottomEdge) < threshold) {
          y = wallBottomEdge - item.height;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
      }
      // Snap furniture edges to wall endpoints (horizontal alignment)
      if (bb.bottom > wallY - halfThick - threshold && bb.top < wallY + halfThick + threshold) {
        // Left edge to wall left end
        if (Math.abs(bb.left - wallMinX) < threshold) {
          x = wallMinX;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Right edge to wall right end
        if (Math.abs(bb.right - wallMaxX) < threshold) {
          x = wallMaxX - item.width;
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
        // Snap furniture right to wall left edge
        if (Math.abs(bb.right - wallLeftEdge) < threshold) {
          x = wallLeftEdge - item.width;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Snap furniture left to wall right edge
        if (Math.abs(bb.left - wallRightEdge) < threshold) {
          x = wallRightEdge;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Snap furniture left to wall left edge
        if (Math.abs(bb.left - wallLeftEdge) < threshold) {
          x = wallLeftEdge;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Snap furniture right to wall right edge
        if (Math.abs(bb.right - wallRightEdge) < threshold) {
          x = wallRightEdge - item.width;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
      }
      // Snap furniture edges to wall endpoints (vertical alignment)
      if (bb.right > wallX - halfThick - threshold && bb.left < wallX + halfThick + threshold) {
        // Top edge to wall top end
        if (Math.abs(bb.top - wallMinY) < threshold) {
          y = wallMinY;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
        // Bottom edge to wall bottom end
        if (Math.abs(bb.bottom - wallMaxY) < threshold) {
          y = wallMaxY - item.height;
          didSnap = true; snappedWallThickness = wall.thickness;
        }
      }
    }
  }

  return { x, y, didSnap, snappedWallThickness };
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
  units: UnitSystem = "metric"
): ComponentLabelInfo[] {
  const pxPerCm = (gridSize * zoom) / 100;
  const results: ComponentLabelInfo[] = [];

  for (const item of furniture) {
    const centerX = (item.x + item.width / 2) * pxPerCm + panOffset.x;
    const centerY = (item.y + item.height / 2) * pxPerCm + panOffset.y;
    const h = item.height * pxPerCm;
    const isSelected = item.id === selectedId;
    const labelY = centerY + h / 2 + 14 * zoom;

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

    const nameColor = isSelected
      ? (isDark ? "#4f98a3" : "#01696f")
      : (isDark ? "rgba(79, 152, 163, 0.65)" : "rgba(1, 105, 111, 0.55)");

    results.push({
      item, centerX, labelY, displayName, dimText,
      nameFontSize, dimFontSize, pillW, pillH, isSelected, nameColor,
    });
  }

  return results;
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
  selectedId: string | null
): void {
  // Collect all label rects with priority
  const allRects: LabelRect[] = [];
  const pxPerCm = (gridSize * zoom) / 100;

  // Room labels (priority 0) — immovable anchors, already drawn by drawRoomAreas
  for (const room of rooms) {
    const cx = room.centroid.x * pxPerCm + panOffset.x;
    const cy = room.centroid.y * pxPerCm + panOffset.y;
    const roomKey = getRoomKey(room);
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

  // Component labels (priority 2)
  if (componentLabelsVisible) {
    for (let i = 0; i < componentLabelInfos.length; i++) {
      const info = componentLabelInfos[i];
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
