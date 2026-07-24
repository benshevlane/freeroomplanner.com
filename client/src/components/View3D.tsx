import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EditorState, Wall, FurnitureItem, Point, FURNITURE_LIBRARY } from "../lib/types";
import { detectRooms } from "../lib/room-detection";
import { trackEvent } from "@/lib/analytics";
import { WebGLPathTracer } from "three-gpu-pathtracer";

/**
 * Phase 1 "3D View" — builds a procedural 3D scene directly from the 2D plan
 * data (walls, doors, windows, furniture). No downloaded models; every item is
 * rendered as a clean colour-coded massing shape at its exact plan dimensions.
 *
 * Coordinate mapping: plan (x, y) in cm -> 3D (x, z) in cm, +Y is up.
 * A 2D rotation of θ degrees maps to rotation.y = -θ radians.
 */

const DOOR_HEIGHT = 205;
const WINDOW_SILL = 90;
const WINDOW_TOP = 210;
const DEFAULT_WALL_HEIGHT = 240;

const OPENING_TYPES = new Set([
  "door", "door_double", "door_sliding", "door_patio", "archway", "window", "bay_window",
]);

// ---------------------------------------------------------------------------
// Shared materials (created once per module load; the module itself is
// lazy-loaded so this never runs unless the user opens the 3D view)
// ---------------------------------------------------------------------------
function std(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

const MAT = {
  wall: std("#e7e2d9"),
  wallInterior: std("#eceae3"),
  floor: std("#c9b48c", { roughness: 0.95, side: THREE.DoubleSide }),
  ground: std("#c8ccd0", { roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({
    color: "#a8cede", roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  }),
  white: std("#f4f3ef", { roughness: 0.6 }),
  cream: std("#efe9dd"),
  chrome: std("#b6bcc2", { roughness: 0.35, metalness: 0.6 }),
  appliance: std("#d4d7d9", { roughness: 0.5, metalness: 0.3 }),
  wood: std("#b08968"),
  woodDark: std("#8a6a4f"),
  worktop: std("#c9b18a", { roughness: 0.7 }),
  fabricLiving: std("#9c8f7f"),
  fabricBedroom: std("#a0a58f"),
  kitchenUnit: std("#8fa3ad"),
  office: std("#8f9bab"),
  dark: std("#4a4a48"),
  screen: std("#22262a", { roughness: 0.3, metalness: 0.4 }),
  rug: std("#b3937a", { roughness: 1 }),
  radiator: std("#e3e1dc", { roughness: 0.5, metalness: 0.2 }),
};


// ---------------------------------------------------------------------------
// Style choices: floor material, wall / unit / worktop colours, lighting.
// Persisted in localStorage so a user's look survives reloads.
// ---------------------------------------------------------------------------
interface FloorChoice { id: string; label: string; texture?: string; color: string; tileM: number }

const FLOORS: FloorChoice[] = [
  { id: "oak", label: "Oak", texture: "/textures/laminate_floor_02.jpg", color: "#ffffff", tileM: 2 },
  { id: "herringbone", label: "Herringbone", texture: "/textures/herringbone_parquet.jpg", color: "#ffffff", tileM: 2 },
  { id: "darkwood", label: "Dark wood", texture: "/textures/wood_floor.jpg", color: "#ffffff", tileM: 2.5 },
  { id: "tiles", label: "Tiles", texture: "/textures/floor_tiles_06.jpg", color: "#ffffff", tileM: 1.5 },
  { id: "concrete", label: "Concrete", texture: "/textures/concrete_floor_painted.jpg", color: "#ffffff", tileM: 3 },
  { id: "carpet", label: "Carpet", color: "#b8ab98", tileM: 1 },
];

const ITEM_COLORS = [
  "#8fa3ad", "#8fa38f", "#45586e", "#e8e2d2", "#494b4d", "#f0efec",
  "#b08968", "#01696f", "#a95c45", "#d6b598", "#6b7f95", "#3d3d3b",
];

const WALL_COLORS = ["#eae4d8", "#f2efe9", "#d9c8a8", "#b6c2ae", "#bccfd8", "#e3c9c0", "#3f4f63", "#4a4c4f"];
const UNIT_COLORS = ["#8fa3ad", "#8fa38f", "#45586e", "#e8e2d2", "#494b4d", "#f0efec", "#b08968", "#01696f"];
const WORKTOPS: { id: string; label: string; color: string; roughness: number; texture?: string }[] = [
  { id: "oak", label: "Oak", color: "#c9b18a", roughness: 0.7 },
  { id: "stone", label: "Marble", color: "#ffffff", roughness: 0.35, texture: "/textures/marble_01.jpg" },
  { id: "quartz", label: "White quartz", color: "#e9e8e4", roughness: 0.4 },
];

interface StyleState {
  floor: string;
  wallColor: string;
  unitColor: string;
  worktop: string;
  brightness: number;
  evening: boolean;
}

const DEFAULT_STYLE: StyleState = {
  floor: "oak",
  wallColor: "#eae4d8",
  unitColor: "#8fa3ad",
  worktop: "oak",
  brightness: 1,
  evening: false,
};

function loadStyle(): StyleState {
  try {
    const raw = localStorage.getItem("freeroomplanner-3d-style");
    if (raw) return { ...DEFAULT_STYLE, ...JSON.parse(raw) };
  } catch { /* corrupted / unavailable storage falls back to defaults */ }
  return DEFAULT_STYLE;
}

/** Applies exposure (brightness dial + evening dimming) to the renderer */
function SceneSettings({ brightness, evening }: { brightness: number; evening: boolean }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = brightness * (evening ? 0.75 : 1.18);
    // Image-based ambient light; dimmed in evening mode
    (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = evening ? 0.35 : 1.0;
  }, [gl, scene, brightness, evening]);
  return null;
}

function categoryMaterial(category: string): THREE.MeshStandardMaterial {
  switch (category) {
    case "Kitchen": return MAT.kitchenUnit;
    case "Living": return MAT.fabricLiving;
    case "Bedroom": return MAT.fabricBedroom;
    case "Bathroom": return MAT.white;
    case "Dining": return MAT.wood;
    case "Office": return MAT.office;
    default: return MAT.cream;
  }
}


// ---------------------------------------------------------------------------
// Continuous worktops over runs of kitchen base units.
//
// In real kitchens a row of base units shares one worktop. When two or more
// base units sit in a line (axis-aligned, gaps under 4cm) we render a single
// continuous slab across the run instead of one small slab per unit.
// ---------------------------------------------------------------------------
const BASE_RUN_TYPES = new Set([
  "worktop", "kitchen_sink_s", "kitchen_sink_d", "cooker", "range_cooker",
  "dishwasher", "washing_machine", "tumble_dryer", "oven_builtin",
  "floor_cupboard", "drawer_unit_2", "drawer_unit_3", "boiler",
]);

const WORKTOP_H = 87;      // cabinet height (cm)
const SLAB_T = 4;          // worktop slab thickness (cm)
const RUN_GAP = 4;         // max gap between units in a run (cm)
const RUN_OVERHANG = 1.5;  // slab overhang past the run's ends (cm)

interface RunBox { minX: number; maxX: number; minY: number; maxY: number }

function itemAabb(f: FurnitureItem): RunBox {
  const rot = ((f.rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w = swap ? f.height : f.width;
  const d = swap ? f.width : f.height;
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - d / 2, maxY: cy + d / 2 };
}

function computeWorktopRuns(items: FurnitureItem[]): { runs: RunBox[]; covered: Set<string> } {
  const bases = items.filter((f) => BASE_RUN_TYPES.has(f.type) && f.rotation % 90 === 0);
  const boxes = bases.map((f) => ({ id: f.id, box: itemAabb(f) }));
  const runs: RunBox[] = [];
  const covered = new Set<string>();

  // Chain along one axis: items whose cross-axis band matches (within 8cm)
  // and whose along-axis gaps are small form one run.
  const chain = (axis: "x" | "y") => {
    const bandMin = axis === "x" ? "minY" : "minX";
    const bandMax = axis === "x" ? "maxY" : "maxX";
    const lo = axis === "x" ? "minX" : "minY";
    const hi = axis === "x" ? "maxX" : "maxY";
    const sorted = [...boxes].sort((a, b) => a.box[lo] - b.box[lo]);
    const used = new Set<string>();
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;
      const group = [sorted[i]];
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].id)) continue;
        const last = group[group.length - 1];
        const sameBand =
          Math.abs(sorted[j].box[bandMin] - last.box[bandMin]) <= 8 &&
          Math.abs(sorted[j].box[bandMax] - last.box[bandMax]) <= 8;
        const gap = sorted[j].box[lo] - last.box[hi];
        if (sameBand && gap <= RUN_GAP && gap > -30) group.push(sorted[j]);
      }
      if (group.length >= 2) {
        const run: RunBox = {
          minX: Math.min(...group.map((g) => g.box.minX)) - RUN_OVERHANG,
          maxX: Math.max(...group.map((g) => g.box.maxX)) + RUN_OVERHANG,
          minY: Math.min(...group.map((g) => g.box.minY)) - RUN_OVERHANG,
          maxY: Math.max(...group.map((g) => g.box.maxY)) + RUN_OVERHANG,
        };
        runs.push(run);
        group.forEach((g) => { used.add(g.id); covered.add(g.id); });
      }
    }
  };
  chain("x");
  chain("y");
  return { runs, covered };
}

function WorktopRuns({ runs }: { runs: RunBox[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <mesh
          key={i}
          position={[(r.minX + r.maxX) / 2, WORKTOP_H + SLAB_T / 2, (r.minY + r.maxY) / 2]}
          material={MAT.worktop}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[r.maxX - r.minX, SLAB_T, r.maxY - r.minY]} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wall construction with door/window openings
// ---------------------------------------------------------------------------
interface Opening {
  t0: number;
  t1: number;
  kind: "door" | "window" | "archway";
  /** original item type, for door-leaf rendering */
  openType: string;
  mirrored?: boolean;
}

interface WallWithOpenings {
  wall: Wall;
  length: number;
  angle: number;
  openings: Opening[];
}

function buildWallData(walls: Wall[], furniture: FurnitureItem[]): WallWithOpenings[] {
  const data: WallWithOpenings[] = walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    return { wall, length, angle: Math.atan2(dy, dx), openings: [] };
  });

  for (const item of furniture) {
    if (!OPENING_TYPES.has(item.type)) continue;
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    // The opening's span along the wall equals the item's width
    const half = item.width / 2;

    // Find the nearest wall the opening sits on
    let best: { d: WallWithOpenings; t: number; perp: number } | null = null;
    for (const d of data) {
      if (d.length < 1) continue;
      const ux = (d.wall.end.x - d.wall.start.x) / d.length;
      const uy = (d.wall.end.y - d.wall.start.y) / d.length;
      const vx = cx - d.wall.start.x;
      const vy = cy - d.wall.start.y;
      const t = vx * ux + vy * uy;
      if (t < -half || t > d.length + half) continue;
      const perp = Math.abs(vx * uy - vy * ux);
      if (perp > d.wall.thickness / 2 + 20) continue;
      if (!best || perp < best.perp) best = { d, t, perp };
    }
    if (!best) continue;

    const kind: Opening["kind"] =
      item.type === "window" || item.type === "bay_window" ? "window" :
      item.type === "archway" ? "archway" : "door";
    const t0 = Math.max(0, best.t - half);
    const t1 = Math.min(best.d.length, best.t + half);
    if (t1 - t0 > 5) best.d.openings.push({ t0, t1, kind, openType: item.type, mirrored: item.mirrored });
  }

  for (const d of data) d.openings.sort((a, b) => a.t0 - b.t0);
  return data;
}

function WallMesh({ data, height }: { data: WallWithOpenings; height: number }) {
  const { wall, length, angle, openings } = data;
  const th = Math.max(wall.thickness, 4);
  const material = wall.wallType === "interior" ? MAT.wallInterior : MAT.wall;

  const parts: { x: number; y: number; w: number; h: number; mat?: THREE.Material; depth?: number }[] = [];
  const doorOpenings: Opening[] = [];
  let cursor = 0;
  for (const op of openings) {
    if (op.t0 > cursor + 1) {
      parts.push({ x: (cursor + op.t0) / 2, y: height / 2, w: op.t0 - cursor, h: height });
    }
    const w = op.t1 - op.t0;
    const mid = (op.t0 + op.t1) / 2;
    if (op.kind === "door" || op.kind === "archway") {
      if (height > DOOR_HEIGHT) {
        parts.push({ x: mid, y: (DOOR_HEIGHT + height) / 2, w, h: height - DOOR_HEIGHT });
      }
      if (op.kind === "door") {
        doorOpenings.push(op);
      }
    } else {
      // window: sill below, header above, glass between
      parts.push({ x: mid, y: WINDOW_SILL / 2, w, h: WINDOW_SILL });
      if (height > WINDOW_TOP) {
        parts.push({ x: mid, y: (WINDOW_TOP + height) / 2, w, h: height - WINDOW_TOP });
      }
      const glassTop = Math.min(WINDOW_TOP, height);
      parts.push({
        x: mid, y: (WINDOW_SILL + glassTop) / 2, w: Math.max(w - 6, 10),
        h: glassTop - WINDOW_SILL, mat: MAT.glass, depth: 4,
      });
    }
    cursor = Math.max(cursor, op.t1);
  }
  if (cursor < length - 1) {
    parts.push({ x: (cursor + length) / 2, y: height / 2, w: length - cursor, h: height });
  }

  return (
    <group position={[wall.start.x, 0, wall.start.y]} rotation={[0, -angle, 0]}>
      {parts.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, p.y, 0]}
          material={p.mat ?? material}
          castShadow={!p.mat}
          receiveShadow
        >
          <boxGeometry args={[p.w, p.h, p.depth ?? th]} />
        </mesh>
      ))}
      {doorOpenings.map((op, i) => {
        const w = op.t1 - op.t0;
        const mid = (op.t0 + op.t1) / 2;
        const glassy = op.openType === "door_patio" || op.openType === "door_sliding";
        const doubleLeaf = op.openType === "door_double" || glassy;
        const frame = (
          <group key={`f${i}`}>
            {/* jambs + head */}
            <mesh position={[op.t0 + 2, DOOR_HEIGHT / 2, 0]} material={MAT.white} castShadow>
              <boxGeometry args={[4, DOOR_HEIGHT, th + 2.5]} />
            </mesh>
            <mesh position={[op.t1 - 2, DOOR_HEIGHT / 2, 0]} material={MAT.white} castShadow>
              <boxGeometry args={[4, DOOR_HEIGHT, th + 2.5]} />
            </mesh>
            <mesh position={[mid, DOOR_HEIGHT - 2, 0]} material={MAT.white} castShadow>
              <boxGeometry args={[w, 4, th + 2.5]} />
            </mesh>
          </group>
        );
        if (glassy) {
          return (
            <group key={`d${i}`}>
              {frame}
              <mesh position={[mid - w / 4, DOOR_HEIGHT / 2 - 2, 0]} material={MAT.glass}>
                <boxGeometry args={[w / 2 - 6, DOOR_HEIGHT - 8, 3]} />
              </mesh>
              <mesh position={[mid + w / 4, DOOR_HEIGHT / 2 - 2, th / 2 + 2]} material={MAT.glass}>
                <boxGeometry args={[w / 2 - 6, DOOR_HEIGHT - 8, 3]} />
              </mesh>
            </group>
          );
        }
        const leafW = doubleLeaf ? w / 2 - 5 : w - 8;
        const openAngle = 0.5 * (op.mirrored ? -1 : 1);
        return (
          <group key={`d${i}`}>
            {frame}
            <group position={[op.t0 + 4, 0, 0]} rotation={[0, -openAngle, 0]}>
              <mesh position={[leafW / 2, DOOR_HEIGHT / 2 - 2, 0]} material={MAT.cream} castShadow>
                <boxGeometry args={[leafW, DOOR_HEIGHT - 6, 4]} />
              </mesh>
              <mesh position={[leafW - 8, 100, 3.5]} material={MAT.chrome} castShadow>
                <boxGeometry args={[2.5, 12, 2.5]} />
              </mesh>
            </group>
            {doubleLeaf && (
              <group position={[op.t1 - 4, 0, 0]} rotation={[0, openAngle, 0]}>
                <mesh position={[-leafW / 2, DOOR_HEIGHT / 2 - 2, 0]} material={MAT.cream} castShadow>
                  <boxGeometry args={[leafW, DOOR_HEIGHT - 6, 4]} />
                </mesh>
                <mesh position={[-(leafW - 8), 100, 3.5]} material={MAT.chrome} castShadow>
                  <boxGeometry args={[2.5, 12, 2.5]} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Floors from detected rooms
// ---------------------------------------------------------------------------
/**
 * Snap wall endpoints that nearly touch (within tolerance) onto a shared
 * point so room detection still closes rooms drawn with small gaps. 2D
 * detection uses a strict 15cm threshold; for the 3D floor we are happy to
 * bridge gaps up to 30cm — a floor that appears is better than a void.
 */
function snapWallsForDetection(walls: Wall[], tolerance = 30): Wall[] {
  const points: Point[] = [];
  walls.forEach((w) => { points.push(w.start, w.end); });
  // Union-find over endpoints
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy <= tolerance * tolerance) {
        parent[find(i)] = find(j);
      }
    }
  }
  // Cluster centroids
  const sums = new Map<number, { x: number; y: number; n: number }>();
  points.forEach((pt, i) => {
    const r = find(i);
    const s = sums.get(r) ?? { x: 0, y: 0, n: 0 };
    s.x += pt.x; s.y += pt.y; s.n += 1;
    sums.set(r, s);
  });
  const snapped = (i: number): Point => {
    const s = sums.get(find(i))!;
    return { x: s.x / s.n, y: s.y / s.n };
  };
  return walls.map((w, wi) => ({
    ...w,
    start: snapped(wi * 2),
    end: snapped(wi * 2 + 1),
  }));
}

function Floors({ walls }: { walls: Wall[] }) {
  const shapes = useMemo(() => {
    const rooms = detectRooms(snapWallsForDetection(walls));
    return rooms.map((room) => {
      const shape = new THREE.Shape();
      room.vertices.forEach((v: Point, i: number) => {
        if (i === 0) shape.moveTo(v.x, v.y);
        else shape.lineTo(v.x, v.y);
      });
      shape.closePath();
      return shape;
    });
  }, [walls]);

  return (
    <>
      {shapes.map((shape, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.5, 0]} material={MAT.floor} receiveShadow>
          <shapeGeometry args={[shape]} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Furniture stand-ins
// ---------------------------------------------------------------------------
function Box({ w, h, d, x = 0, y, z = 0, mat, shadow = true }: {
  w: number; h: number; d: number; x?: number; y?: number; z?: number;
  mat: THREE.Material; shadow?: boolean;
}) {
  return (
    <mesh position={[x, y ?? h / 2, z]} material={mat} castShadow={shadow} receiveShadow>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

function Cyl({ r, h, x = 0, y, z = 0, mat }: {
  r: number; h: number; x?: number; y?: number; z?: number; mat: THREE.Material;
}) {
  return (
    <mesh position={[x, y ?? h / 2, z]} material={mat} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, 24]} />
    </mesh>
  );
}

function ItemShape({ item, wallHeight, inWorktopRun = false }: { item: FurnitureItem; wallHeight: number; inWorktopRun?: boolean }) {
  const w = item.width;
  const d = item.height;
  const t = item.type;
  // Per-item colour override creates a dedicated material for this item
  const override = useMemo(
    () => (item.colorOverride ? std(item.colorOverride) : null),
    [item.colorOverride]
  );
  const shakerFrame = useMemo(() => {
    if (!override && !item.colorOverride) return null;
    return null;
  }, [override, item.colorOverride]);
  void shakerFrame;
  const catMat = override ?? categoryMaterial(item.category);
  const unitMat = override ?? MAT.kitchenUnit;
  const applianceMat = override ?? MAT.appliance;

  // --- Beds ---
  if (t.startsWith("bed_") || t === "cot") {
    const baseH = t === "cot" ? 25 : 35;
    return (
      <>
        <Box w={w} h={baseH} d={d} mat={MAT.woodDark} />
        <Box w={w} h={80} d={8} z={-d / 2 + 4} mat={MAT.woodDark} />
        <Box w={w - 8} h={16} d={d - 12} y={baseH + 8} z={2} mat={MAT.white} />
        <Box w={w * 0.38} h={9} d={30} x={-w * 0.22} y={baseH + 20} z={-d / 2 + 28} mat={MAT.cream} />
        {w > 110 && <Box w={w * 0.38} h={9} d={30} x={w * 0.22} y={baseH + 20} z={-d / 2 + 28} mat={MAT.cream} />}
        <Box w={w - 6} h={12} d={(d - 12) * 0.55} y={baseH + 12} z={d * 0.18} mat={catMat} />
        {t === "cot" && <>
          <Box w={4} h={60} d={d} x={-w / 2 + 2} mat={MAT.wood} />
          <Box w={4} h={60} d={d} x={w / 2 - 2} mat={MAT.wood} />
        </>}
      </>
    );
  }

  // --- Sofas / armchairs ---
  if (t === "sofa_3" || t === "sofa_2" || t === "sofa_bed" || t === "armchair") {
    const armW = Math.min(20, w * 0.12);
    return (
      <>
        <Box w={w} h={42} d={d} mat={catMat} />
        <Box w={w} h={38} d={Math.min(24, d * 0.3)} y={42 + 19} z={-d / 2 + Math.min(24, d * 0.3) / 2} mat={catMat} />
        <Box w={armW} h={22} d={d} x={-w / 2 + armW / 2} y={42 + 11} mat={catMat} />
        <Box w={armW} h={22} d={d} x={w / 2 - armW / 2} y={42 + 11} mat={catMat} />
      </>
    );
  }
  if (t === "sofa_l") {
    const back = 24;
    return (
      <>
        <Box w={w} h={42} d={Math.min(90, d * 0.5)} z={-d / 2 + Math.min(90, d * 0.5) / 2} mat={catMat} />
        <Box w={w} h={38} d={back} y={42 + 19} z={-d / 2 + back / 2} mat={catMat} />
        <Box w={Math.min(95, w * 0.4)} h={42} d={d} x={-w / 2 + Math.min(95, w * 0.4) / 2} mat={catMat} />
        <Box w={back} h={38} d={d * 0.5} x={-w / 2 + back / 2} y={42 + 19} z={d * 0.25} mat={catMat} />
      </>
    );
  }

  // --- Chairs & stools ---
  if (t === "dining_chair" || t === "office_chair") {
    return (
      <>
        <Box w={w * 0.9} h={45} d={d * 0.9} mat={t === "office_chair" ? MAT.dark : MAT.wood} />
        <Box w={w * 0.9} h={45} d={6} y={45 + 22} z={-d / 2 + 5} mat={t === "office_chair" ? MAT.dark : MAT.wood} />
      </>
    );
  }
  if (t === "bar_stool") return <Cyl r={w / 2} h={75} mat={MAT.wood} />;
  if (t === "footstool") return <Box w={w} h={40} d={d} mat={catMat} />;
  if (t === "dining_bench") return <Box w={w} h={45} d={d} mat={MAT.wood} />;

  // --- Tables & desks ---
  if (t.startsWith("dining_table") || t === "desk" || t === "dressing_table") {
    const round = t === "dining_table_round";
    const legIn = 10;
    return (
      <>
        {round ? (
          <>
            <Cyl r={w / 2} h={4} y={74} mat={MAT.wood} />
            <Cyl r={8} h={72} mat={MAT.wood} />
            <Cyl r={w / 4} h={4} y={2} mat={MAT.wood} />
          </>
        ) : (
          <>
            <Box w={w} h={5} d={d} y={74} mat={MAT.wood} />
            <Box w={6} h={72} d={6} x={-w / 2 + legIn} z={-d / 2 + legIn} mat={MAT.wood} />
            <Box w={6} h={72} d={6} x={w / 2 - legIn} z={-d / 2 + legIn} mat={MAT.wood} />
            <Box w={6} h={72} d={6} x={-w / 2 + legIn} z={d / 2 - legIn} mat={MAT.wood} />
            <Box w={6} h={72} d={6} x={w / 2 - legIn} z={d / 2 - legIn} mat={MAT.wood} />
          </>
        )}
        {t === "desk" && <Box w={w * 0.35} h={5} d={d * 0.45} y={78} z={-d * 0.15} mat={MAT.screen} />}
      </>
    );
  }
  if (t === "coffee_table") {
    return (
      <>
        <Box w={w} h={4} d={d} y={42} mat={MAT.wood} />
        <Box w={6} h={42} d={6} x={-w / 2 + 8} z={-d / 2 + 8} mat={MAT.wood} />
        <Box w={6} h={42} d={6} x={w / 2 - 8} z={-d / 2 + 8} mat={MAT.wood} />
        <Box w={6} h={42} d={6} x={-w / 2 + 8} z={d / 2 - 8} mat={MAT.wood} />
        <Box w={6} h={42} d={6} x={w / 2 - 8} z={d / 2 - 8} mat={MAT.wood} />
      </>
    );
  }
  if (t === "side_table" || t === "bedside_table") return <Box w={w} h={50} d={d} mat={MAT.wood} />;

  // --- Kitchen: base units, appliances, tall units ---
  const kitchenBase = new Set([
    "worktop", "kitchen_sink_s", "kitchen_sink_d", "cooker", "range_cooker",
    "dishwasher", "washing_machine", "tumble_dryer", "oven_builtin",
    "floor_cupboard", "drawer_unit_2", "drawer_unit_3", "island", "boiler",
  ]);
  if (kitchenBase.has(t)) {
    const appliance = new Set(["dishwasher", "washing_machine", "tumble_dryer", "oven_builtin", "cooker", "range_cooker", "boiler"]).has(t);
    const sink = t === "kitchen_sink_s" || t === "kitchen_sink_d";
    const drawers = t === "drawer_unit_2" ? 2 : t === "drawer_unit_3" ? 3 : 0;
    const island = t === "island";
    const frontZ = d / 2;
    const shaker = item.doorStyle === "shaker";

    // Kitchen anatomy: recessed dark plinth (0–10), carcass (10–85),
    // door/drawer fronts proud of the carcass with visible dark gaps,
    // chrome bar handles, worktop on top.
    const doorBottom = 12;
    const doorTop = 83;
    const doorH = doorTop - doorBottom;
    const doorCY = (doorTop + doorBottom) / 2;
    const hasDoors = !appliance && drawers === 0;
    const twoDoors = hasDoors && w >= 75;
    const doorW = twoDoors ? (w - 8) / 2 : w - 5;

    const doorPanel = (x: number, dw: number, key: string) => (
      <group key={key}>
        <Box w={dw} h={doorH} d={1.6} x={x} y={doorCY} z={frontZ + 0.8} mat={unitMat} />
        {shaker && (
          <>
            <Box w={Math.max(dw - 9, 4)} h={doorH - 9} d={0.8} x={x} y={doorCY} z={frontZ + 1.7} mat={MAT.dark} shadow={false} />
            <Box w={Math.max(dw - 11, 3)} h={doorH - 11} d={1} x={x} y={doorCY} z={frontZ + 1.9} mat={unitMat} />
          </>
        )}
        {/* bar handle near the top, inner edge for door pairs */}
        <Box
          w={Math.min(11, dw * 0.5)}
          h={1.3}
          d={1.3}
          x={twoDoors ? (x > 0 ? x - dw / 2 + 7 : x + dw / 2 - 7) : x}
          y={doorTop - 5}
          z={frontZ + 2.4}
          mat={MAT.chrome}
        />
      </group>
    );

    return (
      <>
        {/* plinth + carcass */}
        <Box w={Math.max(w - 5, 8)} h={10} d={Math.max(d - 5, 8)} mat={MAT.dark} />
        <Box w={w} h={75} d={d} y={47.5} mat={appliance ? applianceMat : unitMat} />
        {/* dark gap backing so fronts read as separate doors */}
        {(hasDoors || drawers > 0) && (
          <Box w={w - 3} h={doorH + 2} d={0.5} y={doorCY} z={frontZ + 0.3} mat={MAT.dark} shadow={false} />
        )}
        {hasDoors && (twoDoors
          ? [doorPanel(-(doorW / 2 + 1.5), doorW, "dl"), doorPanel(doorW / 2 + 1.5, doorW, "dr")]
          : doorPanel(0, doorW, "d"))}
        {island && <Box w={w - 3} h={doorH + 2} d={0.5} y={doorCY} z={-frontZ - 0.3} mat={MAT.dark} shadow={false} />}
        {/* drawer stacks */}
        {drawers > 0 &&
          Array.from({ length: drawers }, (_, i) => {
            const dh = (doorH - (drawers - 1) * 1.5) / drawers;
            const cy = doorBottom + dh / 2 + i * (dh + 1.5);
            return (
              <group key={i}>
                <Box w={w - 5} h={dh} d={1.6} y={cy} z={frontZ + 0.8} mat={unitMat} />
                {shaker && (
                  <>
                    <Box w={Math.max(w - 14, 4)} h={Math.max(dh - 8, 3)} d={0.8} y={cy} z={frontZ + 1.7} mat={MAT.dark} shadow={false} />
                    <Box w={Math.max(w - 16, 3)} h={Math.max(dh - 10, 2)} d={1} y={cy} z={frontZ + 1.9} mat={unitMat} />
                  </>
                )}
                <Box w={Math.min(12, w * 0.4)} h={1.3} d={1.3} y={cy + dh / 2 - 3} z={frontZ + 2.4} mat={MAT.chrome} />
              </group>
            );
          })}
        {/* appliance fronts */}
        {t === "dishwasher" && (
          <>
            <Box w={w - 5} h={doorH} d={1.4} y={doorCY} z={frontZ + 0.7} mat={applianceMat} />
            <Box w={w - 9} h={1.5} d={1.5} y={doorTop - 4} z={frontZ + 2.2} mat={MAT.chrome} />
            <Box w={w - 8} h={4} d={0.6} y={doorTop - 11} z={frontZ + 1.5} mat={MAT.screen} shadow={false} />
          </>
        )}
        {(t === "washing_machine" || t === "tumble_dryer") && (
          <>
            <Box w={w - 5} h={doorH} d={1.4} y={doorCY} z={frontZ + 0.7} mat={applianceMat} />
            <mesh position={[0, doorCY - 4, frontZ + 1.6]} rotation={[Math.PI / 2, 0, 0]} material={MAT.chrome} castShadow>
              <cylinderGeometry args={[15, 15, 1.4, 28]} />
            </mesh>
            <mesh position={[0, doorCY - 4, frontZ + 2.0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.screen} castShadow={false}>
              <cylinderGeometry args={[11.5, 11.5, 1.2, 28]} />
            </mesh>
            <Box w={w - 10} h={4} d={0.6} y={doorTop - 5} z={frontZ + 1.5} mat={MAT.screen} shadow={false} />
          </>
        )}
        {t === "oven_builtin" && (
          <>
            <Box w={w - 5} h={doorH} d={1.4} y={doorCY} z={frontZ + 0.7} mat={applianceMat} />
            <Box w={w - 10} h={34} d={1} y={doorCY - 6} z={frontZ + 1.6} mat={MAT.screen} shadow={false} />
            <Box w={w - 9} h={1.6} d={1.6} y={doorCY + 15} z={frontZ + 2.6} mat={MAT.chrome} />
            <Box w={w - 10} h={5} d={0.6} y={doorTop - 5} z={frontZ + 1.5} mat={MAT.screen} shadow={false} />
          </>
        )}
        {/* worktop + top-side details */}
        {!inWorktopRun && <Box w={w + 3} h={4} d={d + 3} y={89} mat={MAT.worktop} />}
        {sink && (
          <>
            <Box w={Math.min(w - 16, w * 0.75)} h={3} d={Math.min(d - 16, 44)} y={92} mat={MAT.chrome} />
            {/* tap: riser + spout */}
            <mesh position={[0, 98, -d / 2 + 9]} material={MAT.chrome} castShadow>
              <cylinderGeometry args={[1.2, 1.4, 14, 12]} />
            </mesh>
            <Box w={2} h={2} d={10} y={104} z={-d / 2 + 14} mat={MAT.chrome} />
          </>
        )}
        {(t === "cooker" || t === "range_cooker") && (
          <>
            <Box w={w - 10} h={2} d={d - 10} y={92} mat={MAT.screen} />
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
              <mesh
                key={i}
                position={[sx * (w / 4 - 2), 93.4, sz * (d / 4 - 2)]}
                material={MAT.dark}
                castShadow={false}
              >
                <cylinderGeometry args={[Math.min(7, w / 6), Math.min(7, w / 6), 0.8, 20]} />
              </mesh>
            ))}
          </>
        )}
      </>
    );
  }
  if (t === "hob") {
    // A hob is a worktop-level panel — place it over any unit or worktop run
    return (
      <>
        <Box w={w} h={2} d={d} y={92} mat={MAT.screen} />
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
          <mesh key={i} position={[sx * (w / 4 - 2), 93.6, sz * (d / 4 - 2)]} material={MAT.dark} castShadow={false}>
            <cylinderGeometry args={[Math.min(7, w / 6), Math.min(7, w / 6), 0.8, 20]} />
          </mesh>
        ))}
      </>
    );
  }
  if (t === "oven_housing") {
    return (
      <>
        <Box w={Math.max(w - 5, 8)} h={10} d={Math.max(d - 5, 8)} mat={MAT.dark} />
        <Box w={w} h={190} d={d} y={105} mat={unitMat} />
        {/* oven at eye level */}
        <Box w={w - 6} h={58} d={2} y={110} z={d / 2 + 1} mat={applianceMat} />
        <Box w={w - 12} h={40} d={1} y={106} z={d / 2 + 2} mat={MAT.screen} shadow={false} />
        <Box w={w - 11} h={1.8} d={1.8} y={132} z={d / 2 + 3} mat={MAT.chrome} />
        {/* doors above and below */}
        <Box w={w - 6} h={52} d={1.6} y={40} z={d / 2 + 0.8} mat={unitMat} />
        <Box w={w - 6} h={50} d={1.6} y={172} z={d / 2 + 0.8} mat={unitMat} />
        <Box w={10} h={1.3} d={1.3} y={62} z={d / 2 + 2.2} mat={MAT.chrome} />
      </>
    );
  }
  if (t === "extractor_hood") {
    return (
      <>
        <Box w={w} h={30} d={d} y={165} mat={MAT.chrome} />
        <Box w={24} h={60} d={24} y={210} mat={MAT.chrome} />
      </>
    );
  }
  const tallUnits: Record<string, number> = {
    fridge: 180, fridge_american: 180, larder_unit: 200, wardrobe: 200,
    bookshelf: 180, shelving_unit: 180, filing_cabinet: 72,
  };
  if (t in tallUnits) {
    const applianceTall = t === "fridge" || t === "fridge_american";
    return <Box w={w} h={tallUnits[t]} d={d} mat={override ?? (applianceTall ? MAT.appliance : t === "wardrobe" ? catMat : MAT.wood)} />;
  }
  if (item.heightFromFloor !== undefined || t.startsWith("wall_cupboard")) {
    const lift = item.heightFromFloor ?? 145;
    return (
      <>
        <Box w={w} h={70} d={d} y={lift + 35} mat={unitMat} />
        {item.doorStyle === "shaker" && (
          <>
            <Box w={Math.max(w - 8, 8)} h={56} d={1.4} y={lift + 35} z={d / 2 + 0.7} mat={unitMat} />
            <Box w={Math.max(w - 20, 5)} h={44} d={1} y={lift + 35} z={d / 2 + 0.9} mat={MAT.dark} shadow={false} />
            <Box w={Math.max(w - 22, 4)} h={42} d={1.2} y={lift + 35} z={d / 2 + 1.1} mat={unitMat} />
          </>
        )}
      </>
    );
  }

  // --- Bathroom ---
  if (t === "bathtub" || t === "corner_bath" || t === "freestanding_bath" || t === "p_shape_bath") {
    return (
      <>
        <Box w={w} h={55} d={d} mat={MAT.white} />
        <Box w={Math.max(w - 24, 20)} h={3} d={Math.max(d - 24, 20)} y={54} mat={MAT.glass} shadow={false} />
      </>
    );
  }
  if (t === "shower" || t === "corner_shower" || t === "walkin_shower") {
    return (
      <>
        <Box w={w} h={8} d={d} mat={MAT.white} />
        <Box w={w} h={185} d={3} y={8 + 92} z={d / 2 - 2} mat={MAT.glass} shadow={false} />
        <Box w={3} h={185} d={d} x={w / 2 - 2} y={8 + 92} mat={MAT.glass} shadow={false} />
      </>
    );
  }
  if (t === "shower_screen") return <Box w={w} h={190} d={4} mat={MAT.glass} shadow={false} />;
  if (t === "toilet" || t === "wc_back_to_wall" || t === "wc_wallhung") {
    const floating = t === "wc_wallhung";
    return (
      <>
        {!floating && <Box w={w * 0.9} h={20} d={12} z={-d / 2 + 6} y={65} mat={MAT.white} />}
        <mesh position={[0, floating ? 42 : 21, d * 0.12]} material={MAT.white} castShadow receiveShadow scale={[1, 1, d / w * 0.85]}>
          <cylinderGeometry args={[w * 0.42, w * 0.36, 40, 24]} />
        </mesh>
      </>
    );
  }
  if (t === "bidet") return <Cyl r={w * 0.45} h={40} mat={MAT.white} />;
  if (t === "basin_pedestal") {
    return (
      <>
        <Box w={16} h={70} d={16} mat={MAT.white} />
        <Box w={w} h={14} d={d} y={77} mat={MAT.white} />
      </>
    );
  }
  if (t === "basin_wallhung") return <Box w={w} h={14} d={d} y={77} mat={MAT.white} />;
  if (t === "vanity_single" || t === "vanity_double") {
    return (
      <>
        <Box w={w} h={72} d={d} mat={MAT.wood} />
        <Box w={w + 2} h={12} d={d + 2} y={78} mat={MAT.white} />
      </>
    );
  }
  if (t === "towel_rail") return <Box w={w} h={110} d={Math.max(d, 6)} mat={MAT.radiator} />;
  if (t === "storage_unit") return <Box w={w} h={85} d={d} mat={MAT.white} />;
  if (t === "shower_drain_round" || t === "shower_drain_linear") return <Box w={w} h={1.5} d={d} y={9} mat={MAT.chrome} shadow={false} />;
  if (t === "shower_head") return <Box w={w} h={4} d={d} y={200} mat={MAT.chrome} />;
  if (t === "shower_mixer") return <Box w={w} h={10} d={Math.max(d, 8)} y={115} mat={MAT.chrome} />;

  // --- Living / misc ---
  if (t === "tv_unit") {
    return (
      <>
        <Box w={w} h={45} d={d} mat={MAT.wood} />
        <Box w={w * 0.72} h={55} d={5} y={45 + 30} z={0} mat={MAT.screen} />
      </>
    );
  }
  if (t === "sideboard") return <Box w={w} h={80} d={d} mat={MAT.wood} />;
  if (t === "chest_drawers") return <Box w={w} h={75} d={d} mat={MAT.wood} />;
  if (t === "rug") return <Box w={w} h={1.5} d={d} y={1.5} mat={MAT.rug} shadow={false} />;
  if (t === "fireplace") {
    return (
      <>
        <Box w={w} h={100} d={d} mat={MAT.cream} />
        <Box w={w * 0.5} h={60} d={4} z={d / 2 - 1} y={35} mat={MAT.screen} />
      </>
    );
  }
  if (t === "radiator") return <Box w={w} h={60} d={Math.min(d, 10)} y={10 + 30} mat={MAT.radiator} />;
  if (t === "stairs") {
    const steps = Math.max(4, Math.round(d / 25));
    const stepD = d / steps;
    const stepH = Math.min(wallHeight - 20, 220) / steps;
    return (
      <>
        {Array.from({ length: steps }, (_, i) => (
          <Box key={i} w={w} h={stepH * (i + 1)} d={stepD} z={d / 2 - stepD * (i + 0.5)} mat={MAT.woodDark} />
        ))}
      </>
    );
  }
  if (t === "chimney_breast" || t === "internal_wall") return <Box w={w} h={wallHeight} d={d} mat={MAT.wall} />;

  // --- Fallback: box with a sensible height per category ---
  const fallbackH: Record<string, number> = {
    Kitchen: 90, Living: 45, Bedroom: 50, Bathroom: 85, Dining: 75, Office: 75, Structure: 90,
  };
  return <Box w={w} h={fallbackH[item.category] ?? 60} d={d} mat={catMat} />;
}


// ---------------------------------------------------------------------------
// Real furniture models (Poly Haven, CC0) — auto-scaled to each item's plan
// dimensions. Items without a model fall back to the procedural stand-in.
// ---------------------------------------------------------------------------
interface ModelDef {
  url: string;
  targetH: number; // cm
  /** Extra rotation (radians) so the model's front matches the item's front */
  yaw?: number;
}

function def(file: string, targetH: number, yaw = 0): ModelDef {
  return { url: `/models/${file}.glb`, targetH, yaw };
}

const MODEL_MAP: Record<string, ModelDef> = {
  bed_double: def("fm_bed_grey", 95),
  bed_king: def("fm_bed_grey", 95),
  bed_superking: def("fm_bed_grey", 95),
  sofa_3: def("sofa_03", 80, Math.PI),
  sofa_2: def("sofa_02", 75, Math.PI),
  sofa_bed: def("sofa_02", 75, Math.PI),
  armchair: def("modern_arm_chair_01", 90, Math.PI),
  footstool: def("Ottoman_01", 45),
  coffee_table: def("modern_coffee_table_01", 40),
  side_table: def("side_table_01", 50),
  bedside_table: def("ClassicNightstand_01", 60),
  chest_drawers: def("drawer_cabinet", 80),
  wardrobe: def("drawer_cabinet", 200),
  dining_table_4: def("wooden_table_02", 75),
  dining_table_6: def("painted_wooden_table", 76),
  dining_table_round: def("round_wooden_table_01", 75),
  dining_chair: def("dining_chair_02", 90, Math.PI),
  bar_stool: def("bar_chair_round_01", 75),
  desk: def("metal_office_desk", 75),
  bookshelf: def("Shelf_01", 180),
  sideboard: def("modern_wooden_cabinet", 70),
  cooker: def("electric_stove", 90),
};

function ModelItem({ item, model }: { item: FurnitureItem; model: ModelDef }) {
  const { scene } = useGLTF(model.url);

  const { holder, size } = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (item.colorOverride) {
          const mesh = o as THREE.Mesh;
          const tint = (m: THREE.Material) => {
            const c = m.clone() as THREE.MeshStandardMaterial;
            if (c.color) c.color.set(item.colorOverride!);
            return c;
          };
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(tint)
            : tint(mesh.material);
        }
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const sz = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Centre on origin with the base resting on the floor
    clone.position.set(-center.x, -box.min.y, -center.z);
    const holder = new THREE.Group();
    holder.add(clone);
    return { holder, size: sz };
  }, [scene, item.colorOverride]);

  // Model sizes are in metres; the plan works in cm
  const bw = size.x * 100;
  const bh = Math.max(size.y * 100, 1);
  const bd = size.z * 100;

  // If the model's long axis doesn't match the item's, turn it 90°
  const rotate90 = item.width >= item.height !== bw >= bd;
  const mw = rotate90 ? bd : bw;
  const md = rotate90 ? bw : bd;

  // bw/bh/bd are cm equivalents of the model's metre-based units, so the
  // resulting scale factors must be multiplied back up by 100
  const sx = (item.width / Math.max(mw, 1)) * 100;
  const sz2 = (item.height / Math.max(md, 1)) * 100;
  const sy = (model.targetH / bh) * 100;

  return (
    <group scale={[sx, sy, sz2]}>
      <group rotation={[0, (rotate90 ? Math.PI / 2 : 0) + (model.yaw ?? 0), 0]}>
        <primitive object={holder} />
      </group>
    </group>
  );
}

function Item3D({
  item,
  wallHeight,
  inWorktopRun = false,
  selected = false,
  onSelect,
  onDragStart,
}: {
  item: FurnitureItem;
  wallHeight: number;
  inWorktopRun?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, point: THREE.Vector3) => void;
}) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  return (
    <group
      position={[cx, 0, cy]}
      rotation={[0, -(item.rotation * Math.PI) / 180, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect?.(item.id); }}
      onPointerDown={(e) => {
        if (!selected) return;
        e.stopPropagation();
        onDragStart?.(item.id, e.point);
      }}
    >
      {selected && (
        <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(item.width, item.height) * 0.62, Math.max(item.width, item.height) * 0.62 + 5, 40]} />
          <meshBasicMaterial color="#01696f" transparent opacity={0.8} />
        </mesh>
      )}
      <group scale={[item.mirrored ? -1 : 1, 1, 1]}>
        {MODEL_MAP[item.type] ? (
          <Suspense fallback={<ItemShape item={item} wallHeight={wallHeight} inWorktopRun={inWorktopRun} />}>
            <ModelItem item={item} model={MODEL_MAP[item.type]} />
          </Suspense>
        ) : (
          <ItemShape item={item} wallHeight={wallHeight} inWorktopRun={inWorktopRun} />
        )}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Photoreal snapshot: progressive accumulation render.
//
// Instead of one 16ms frame, we spend a few hundred frames on a single image:
// each pass jitters the camera by a sub-pixel (anti-aliasing) and the sun by
// a few tens of cm (soft, area-light shadows), and the passes are averaged on
// a 2D canvas. The result reads as a photograph rather than a game frame.
// ---------------------------------------------------------------------------
interface SnapshotRequest {
  frames: number;
  width: number;
}

function SnapshotEngine({
  request,
  lightRef,
  onProgress,
  onDone,
}: {
  request: SnapshotRequest | null;
  lightRef: React.RefObject<THREE.DirectionalLight>;
  onProgress: (pct: number) => void;
  onDone: (dataUrl: string | null) => void;
}) {
  const { gl, scene, camera } = useThree();
  const busy = useRef(false);

  useEffect(() => {
    if (!request || busy.current) return;
    busy.current = true;
    let cancelled = false;

    const run = async () => {
      const persp = camera as THREE.PerspectiveCamera;
      const canvas = gl.domElement;
      const viewW = canvas.clientWidth || 1200;
      const viewH = canvas.clientHeight || 800;
      const outW = request.width;
      const outH = Math.round((outW * viewH) / viewW);

      // Accumulation canvas (2D running average)
      const acc = document.createElement("canvas");
      acc.width = outW;
      acc.height = outH;
      const actx = acc.getContext("2d");
      if (!actx) { onDone(null); busy.current = false; return; }

      const prevPixelRatio = gl.getPixelRatio();
      const prevShadows = gl.shadowMap.enabled;
      const light = lightRef.current;
      const originalLightPos = light ? light.position.clone() : null;
      const prevShadowMapSize = light ? light.shadow.mapSize.clone() : null;
      let pathTracer: WebGLPathTracer | null = null;

      try {
        gl.setPixelRatio(1);
        gl.setSize(outW, outH, false); // drawing buffer only; CSS size untouched
        gl.shadowMap.enabled = true;
        if (light) {
          light.shadow.mapSize.set(2048, 2048);
          if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
        }

        // --- Preferred path: true global illumination (WebGL2 only) ---
        if (gl.capabilities.isWebGL2) {
          try {
            pathTracer = new WebGLPathTracer(gl);
            pathTracer.bounces = 5;
            pathTracer.filterGlossyFactor = 0.5;
            pathTracer.renderScale = 1;
            pathTracer.tiles.set(2, 2);
            pathTracer.dynamicLowRes = false;
            pathTracer.rasterizeScene = false;
            pathTracer.setScene(scene, camera);
          } catch (err) {
            console.warn("[snapshot] path tracer unavailable, falling back:", err);
            pathTracer = null;
          }
        }

        if (pathTracer) {
          const targetSamples = request.frames; // ~70-140 samples
          const started = performance.now();
          const MAX_MS = 90_000;
          while (!cancelled) {
            pathTracer.renderSample();
            onProgress(Math.min(99, Math.round((pathTracer.samples / targetSamples) * 100)));
            const done =
              pathTracer.samples >= targetSamples ||
              performance.now() - started >= MAX_MS;
            if (done) {
              // Capture IN THE SAME TASK as the final present — waiting even
              // one frame lets the browser clear the WebGL buffer (black photo)
              actx.globalAlpha = 1;
              actx.drawImage(canvas, 0, 0, outW, outH);
              break;
            }
            await new Promise((r) => requestAnimationFrame(r));
          }
        } else {
          // --- Fallback: jittered accumulation (works everywhere) ---
          for (let i = 0; i < request.frames; i++) {
            if (cancelled) break;
            const jx = (Math.random() - 0.5);
            const jy = (Math.random() - 0.5);
            persp.setViewOffset(outW, outH, jx, jy, outW, outH);
            if (light && originalLightPos) {
              light.position.set(
                originalLightPos.x + (Math.random() - 0.5) * 120,
                originalLightPos.y + (Math.random() - 0.5) * 60,
                originalLightPos.z + (Math.random() - 0.5) * 120
              );
            }
            gl.render(scene, camera);
            actx.globalAlpha = 1 / (i + 1);
            actx.drawImage(canvas, 0, 0, outW, outH);
            onProgress(Math.round(((i + 1) / request.frames) * 100));
            await new Promise((r) => requestAnimationFrame(r));
          }
        }

        // Watermark: the scene background/ground already carry the tiled
        // marks (they sit behind the room, never on it); add the corner tag
        actx.globalAlpha = 1;
        const fs = Math.max(16, Math.round(outW / 90));
        actx.font = `600 ${fs}px 'General Sans', 'DM Sans', sans-serif`;
        actx.textAlign = "right";
        actx.fillStyle = "rgba(255,255,255,0.85)";
        actx.shadowColor = "rgba(0,0,0,0.45)";
        actx.shadowBlur = 6;
        actx.fillText("made with freeroomplanner.com", outW - fs, outH - fs);

        onDone(cancelled ? null : acc.toDataURL("image/jpeg", 0.92));
      } finally {
        // Restore the live view exactly as it was
        if (pathTracer) { try { pathTracer.dispose(); } catch { /* already gone */ } }
        persp.clearViewOffset();
        if (light && originalLightPos) light.position.copy(originalLightPos);
        if (light && prevShadowMapSize) {
          light.shadow.mapSize.copy(prevShadowMapSize);
          if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
        }
        gl.shadowMap.enabled = prevShadows;
        gl.setPixelRatio(prevPixelRatio);
        gl.setSize(canvas.clientWidth, canvas.clientHeight, false);
        busy.current = false;
      }
    };

    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return null;
}


// Free-tier watermark: tiled marks on the scene BACKDROP and the ground
// around the room — never on the room itself, which naturally occludes them.
// The premium build sets FREE_WATERMARK to false.
const FREE_WATERMARK = true;

function makeWatermarkTexture(bg: string, text = "freeroomplanner.com"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.save();
  ctx.translate(512, 512);
  ctx.rotate(-0.28);
  ctx.font = "600 46px 'General Sans', 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.globalAlpha = 0.16;
  for (let row = -4; row <= 4; row++) {
    for (let col = -1; col <= 1; col++) {
      ctx.fillText(text, col * 620 + (row % 2) * 260, row * 170);
    }
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface View3DProps {
  state: EditorState;
  isDark: boolean;
  onUpdateFurniture?: (id: string, updates: Partial<FurnitureItem>) => void;
  onRemoveFurniture?: (id: string) => void;
  onPushUndo?: () => void;
}

export default function View3D({ state, isDark, onUpdateFurniture, onRemoveFurniture, onPushUndo }: View3DProps) {
  const [wallHeight, setWallHeight] = useState(DEFAULT_WALL_HEIGHT);
  const [style, setStyle] = useState<StyleState>(loadStyle);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const [snapshotRequest, setSnapshotRequest] = useState<SnapshotRequest | null>(null);
  const [snapshotProgress, setSnapshotProgress] = useState(0);
  const snapshotStartRef = useRef(0);
  const lightRef = useRef<THREE.DirectionalLight>(null);

  const selectedItem = state.furniture.find((f) => f.id === selectedId) ?? null;

  // Backspace / Delete removes the selected item (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!selectedId || !onRemoveFurniture) return;
      e.preventDefault();
      onRemoveFurniture(selectedId);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onRemoveFurniture]);

  const handleDragStart = (id: string, point: THREE.Vector3) => {
    const item = state.furniture.find((f) => f.id === id);
    if (!item || !onUpdateFurniture) return;
    onPushUndo?.();
    dragRef.current = {
      id,
      offX: item.x + item.width / 2 - point.x,
      offY: item.y + item.height / 2 - point.z,
    };
    setDragging(true);
  };

  const handleDragMove = (point: THREE.Vector3) => {
    const d = dragRef.current;
    if (!d || !onUpdateFurniture) return;
    const item = state.furniture.find((f) => f.id === d.id);
    if (!item) return;
    let nx = point.x + d.offX - item.width / 2;
    let ny = point.z + d.offY - item.height / 2;

    // Snap to wall inner faces (axis-aligned walls), like the 2D editor
    const SNAP = 14;
    let bestDX: number | null = null;
    let bestDY: number | null = null;
    for (const wall of state.walls) {
      const wdx = wall.end.x - wall.start.x;
      const wdy = wall.end.y - wall.start.y;
      const horizontal = Math.abs(wdx) >= Math.abs(wdy);
      const half = (wall.thickness || 5) / 2;
      if (horizontal) {
        const y = (wall.start.y + wall.end.y) / 2;
        const minX = Math.min(wall.start.x, wall.end.x) - 10;
        const maxX = Math.max(wall.start.x, wall.end.x) + 10;
        if (nx + item.width < minX || nx > maxX) continue;
        for (const face of [y + half, y - half - item.height]) {
          const delta = face - ny;
          if (Math.abs(delta) <= SNAP && (bestDY === null || Math.abs(delta) < Math.abs(bestDY))) bestDY = delta;
        }
      } else {
        const x = (wall.start.x + wall.end.x) / 2;
        const minY = Math.min(wall.start.y, wall.end.y) - 10;
        const maxY = Math.max(wall.start.y, wall.end.y) + 10;
        if (ny + item.height < minY || ny > maxY) continue;
        for (const face of [x + half, x - half - item.width]) {
          const delta = face - nx;
          if (Math.abs(delta) <= SNAP && (bestDX === null || Math.abs(delta) < Math.abs(bestDX))) bestDX = delta;
        }
      }
    }
    if (bestDX !== null) nx += bestDX;
    if (bestDY !== null) ny += bestDY;

    onUpdateFurniture(d.id, { x: Math.round(nx), y: Math.round(ny) });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const rotateSelected = () => {
    if (!selectedItem || !onUpdateFurniture) return;
    onPushUndo?.();
    const template = FURNITURE_LIBRARY.find((t) => t.type === selectedItem.type);
    const snap = template?.rotationSnap ?? 90;
    onUpdateFurniture(selectedItem.id, { rotation: (selectedItem.rotation + snap) % 360 });
  };

  const setItemColor = (color: string | undefined) => {
    if (!selectedItem || !onUpdateFurniture) return;
    onPushUndo?.();
    onUpdateFurniture(selectedItem.id, { colorOverride: color });
  };

  const setDoorStyle = (doorStyle: "flat" | "shaker") => {
    if (!selectedItem || !onUpdateFurniture) return;
    onPushUndo?.();
    onUpdateFurniture(selectedItem.id, { doorStyle });
  };

  const startSnapshot = () => {
    if (snapshotRequest) return;
    setSelectedId(null); // the selection ring must not appear in the photo
    const mobile = typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;
    trackEvent("snapshot_clicked", { mobile });
    snapshotStartRef.current = performance.now();
    setSnapshotProgress(0);
    setSnapshotRequest({ frames: mobile ? 70 : 140, width: mobile ? 1600 : 2560 });
  };

  const finishSnapshot = (dataUrl: string | null) => {
    setSnapshotRequest(null);
    if (!dataUrl) return;
    trackEvent("snapshot_rendered", {
      ms: Math.round(performance.now() - snapshotStartRef.current),
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "room-photo.jpg";
    a.click();
  };

  const updateStyle = (patch: Partial<StyleState>) => {
    setStyle((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("freeroomplanner-3d-style", JSON.stringify(next)); } catch { /* best effort */ }
      return next;
    });
  };

  const bgWatermark = useMemo(
    () => makeWatermarkTexture(style.evening ? "#232830" : isDark ? "#20242a" : "#dfe3e8"),
    [style.evening, isDark]
  );

  // Shadows are the main mobile GPU cost — leave them to bigger screens.
  const enableShadows = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
    []
  );

  // Apply style choices to the shared materials. Mutating them is safe here:
  // one scene exists at a time and the render loop picks changes up next frame.
  useEffect(() => {
    MAT.wall.color.set(style.wallColor);
    MAT.wallInterior.color.set(style.wallColor);
    MAT.kitchenUnit.color.set(style.unitColor);
    const wt = WORKTOPS.find((w) => w.id === style.worktop) ?? WORKTOPS[0];
    MAT.worktop.roughness = wt.roughness;
    if (wt.texture) {
      const img = new Image();
      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        if (MAT.worktop.map) MAT.worktop.map.dispose();
        MAT.worktop.map = tex;
        MAT.worktop.color.set(wt.color);
        MAT.worktop.needsUpdate = true;
      };
      img.src = wt.texture;
    } else {
      if (MAT.worktop.map) { MAT.worktop.map.dispose(); MAT.worktop.map = null; }
      MAT.worktop.color.set(wt.color);
      MAT.worktop.needsUpdate = true;
    }
  }, [style.wallColor, style.unitColor, style.worktop]);

  useEffect(() => {
    const floor = FLOORS.find((f) => f.id === style.floor) ?? FLOORS[0];
    if (!floor.texture) {
      if (MAT.floor.map) { MAT.floor.map.dispose(); MAT.floor.map = null; }
      MAT.floor.color.set(floor.color);
      MAT.floor.needsUpdate = true;
      return;
    }
    let cancelled = false;
    // Plain Image + THREE.Texture (rather than TextureLoader) so a failure is
    // loggable and the load path matches ordinary <img> behaviour exactly.
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const tex = new THREE.Texture(img);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      // Floor geometry UVs are in plan centimetres — repeat once per tileM metres
      tex.repeat.set(1 / (floor.tileM * 100), 1 / (floor.tileM * 100));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      if (MAT.floor.map) MAT.floor.map.dispose();
      MAT.floor.map = tex;
      MAT.floor.color.set("#ffffff");
      MAT.floor.needsUpdate = true;
      console.info("[3d-style] floor texture applied:", floor.id);
    };
    img.onerror = () => {
      if (!cancelled) console.error("[3d-style] floor texture failed to load:", floor.texture);
    };
    img.src = floor.texture;
    return () => { cancelled = true; };
  }, [style.floor]);

  const wallData = useMemo(
    () => buildWallData(state.walls, state.furniture),
    [state.walls, state.furniture]
  );

  const items = useMemo(
    () => state.furniture.filter((f) => !OPENING_TYPES.has(f.type)),
    [state.furniture]
  );

  const { runs: worktopRuns, covered: worktopCovered } = useMemo(
    () => computeWorktopRuns(items),
    [items]
  );

  // Scene bounds -> camera framing
  const { center, radius } = useMemo(() => {
    const box = new THREE.Box2();
    for (const w of state.walls) {
      box.expandByPoint(new THREE.Vector2(w.start.x, w.start.y));
      box.expandByPoint(new THREE.Vector2(w.end.x, w.end.y));
    }
    for (const f of state.furniture) {
      box.expandByPoint(new THREE.Vector2(f.x, f.y));
      box.expandByPoint(new THREE.Vector2(f.x + f.width, f.y + f.height));
    }
    if (box.isEmpty()) return { center: new THREE.Vector2(0, 0), radius: 500 };
    const c = new THREE.Vector2();
    box.getCenter(c);
    const size = new THREE.Vector2();
    box.getSize(size);
    return { center: c, radius: Math.max(size.x, size.y, 300) };
  }, [state.walls, state.furniture]);

  // Tile the watermark over the ground plane around the room too
  useEffect(() => {
    if (!FREE_WATERMARK) return;
    const tex = makeWatermarkTexture("#c8ccd0");
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const tiles = Math.max(3, Math.round((radius * 8) / 900));
    tex.repeat.set(tiles, tiles);
    if (MAT.ground.map) MAT.ground.map.dispose();
    MAT.ground.map = tex;
    MAT.ground.color.set("#ffffff");
    MAT.ground.needsUpdate = true;
    return () => {
      if (MAT.ground.map) { MAT.ground.map.dispose(); MAT.ground.map = null; }
      MAT.ground.color.set("#c8ccd0");
      MAT.ground.needsUpdate = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);


  const isEmpty = state.walls.length === 0 && state.furniture.length === 0;
  const camPos: [number, number, number] = [
    center.x + radius * 0.85,
    radius * 0.9,
    center.y + radius * 0.85,
  ];

  return (
    <div className="flex-1 relative overflow-hidden select-none" data-testid="view-3d">
      <Canvas
        frameloop={snapshotRequest ? "never" : "always"}
        shadows={enableShadows}
        dpr={[1, 2]}
        onPointerMissed={() => setSelectedId(null)}
        camera={{ fov: 45, near: 10, far: 50000, position: camPos }}
      >
        <Environment files="/textures/env_interior_1k.hdr" />
        {FREE_WATERMARK ? (
          <primitive attach="background" object={bgWatermark} />
        ) : (
          <color attach="background" args={[style.evening ? "#232830" : isDark ? "#20242a" : "#e9edf2"]} />
        )}
        <SceneSettings brightness={style.brightness} evening={style.evening} />
        <hemisphereLight
          intensity={style.evening ? 0.3 : 0.62}
          color={style.evening ? "#dfd4c0" : "#ffffff"}
          groundColor="#8a8a80"
        />
        <directionalLight
          ref={lightRef}
          position={[center.x + 900, 1500, center.y + 500]}
          color={style.evening ? "#ffd9a6" : "#ffffff"}
          intensity={style.evening ? 0.55 : 1.15}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-radius * 1.2}
          shadow-camera-right={radius * 1.2}
          shadow-camera-top={radius * 1.2}
          shadow-camera-bottom={-radius * 1.2}
          shadow-camera-near={100}
          shadow-camera-far={8000}
        />

        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -1, center.y]} material={MAT.ground} receiveShadow>
          <planeGeometry args={[radius * 8, radius * 8]} />
        </mesh>

        <Floors walls={state.walls} />
        {wallData.map((d) => (
          <WallMesh key={d.wall.id} data={d} height={wallHeight} />
        ))}
        {items.map((item) => (
          <Item3D
            key={item.id}
            item={item}
            wallHeight={wallHeight}
            inWorktopRun={worktopCovered.has(item.id)}
            selected={item.id === selectedId}
            onSelect={onUpdateFurniture ? setSelectedId : undefined}
            onDragStart={handleDragStart}
          />
        ))}
        {/* Invisible floor-plane that receives drag moves */}
        {dragging && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[center.x, 0.1, center.y]}
            onPointerMove={(e) => handleDragMove(e.point)}
            onPointerUp={endDrag}
          >
            <planeGeometry args={[radius * 10, radius * 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <WorktopRuns runs={worktopRuns} />

        <SnapshotEngine
          request={snapshotRequest}
          lightRef={lightRef}
          onProgress={setSnapshotProgress}
          onDone={finishSnapshot}
        />
        <OrbitControls
          enabled={!dragging}
          target={[center.x, 60, center.y]}
          maxPolarAngle={Math.PI / 2 - 0.03}
          minDistance={120}
          maxDistance={radius * 6}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      {/* Wall height + style controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 items-start">
        <div className="bg-card/90 backdrop-blur border border-border rounded-lg shadow-md px-3 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Wall height</span>
          <input
            type="range"
            min={200}
            max={320}
            step={10}
            value={wallHeight}
            onChange={(e) => setWallHeight(Number(e.target.value))}
            className="w-24 accent-primary"
            aria-label="Wall height"
          />
          <span className="text-xs font-medium tabular-nums w-9">{(formatMeters(wallHeight))}</span>
          <button
            type="button"
            onClick={startSnapshot}
            className="text-xs px-2 py-1 rounded-md border bg-background text-foreground border-border hover:border-primary/60"
            data-testid="btn-3d-photo"
          >
            📷 Photo
          </button>
          <button
            type="button"
            onClick={() => setStylePanelOpen((o) => !o)}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
              stylePanelOpen
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:border-primary/60"
            }`}
            data-testid="btn-3d-style"
          >
            Style
          </button>
        </div>

        {stylePanelOpen && (
          <div className="bg-card/95 backdrop-blur border border-border rounded-lg shadow-md p-3 w-64 space-y-3 max-h-[70vh] overflow-y-auto" data-testid="style-panel">
            <div>
              <p className="text-xs font-medium mb-1.5">Floor</p>
              <div className="grid grid-cols-3 gap-1.5">
                {FLOORS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateStyle({ floor: f.id })}
                    className={`rounded-md border-2 overflow-hidden ${style.floor === f.id ? "border-primary" : "border-transparent"}`}
                    title={f.label}
                    data-testid={`floor-${f.id}`}
                  >
                    {f.texture ? (
                      <img src={f.texture} alt={f.label} className="w-full h-10 object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-10" style={{ backgroundColor: f.color }} />
                    )}
                    <span className="block text-[10px] py-0.5 text-muted-foreground truncate">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">Wall colour</p>
              <div className="flex flex-wrap gap-1.5">
                {WALL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateStyle({ wallColor: c })}
                    className={`h-7 w-7 rounded-full border-2 ${style.wallColor === c ? "border-primary" : "border-border"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Wall colour ${c}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">Kitchen unit colour</p>
              <div className="flex flex-wrap gap-1.5">
                {UNIT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateStyle({ unitColor: c })}
                    className={`h-7 w-7 rounded-full border-2 ${style.unitColor === c ? "border-primary" : "border-border"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Unit colour ${c}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">Worktop</p>
              <div className="flex gap-1.5">
                {WORKTOPS.map((wt) => (
                  <button
                    key={wt.id}
                    type="button"
                    onClick={() => updateStyle({ worktop: wt.id })}
                    className={`flex-1 text-[11px] px-1.5 py-1 rounded-md border ${
                      style.worktop === wt.id ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <span className="inline-block h-3 w-3 rounded-sm mr-1 align-middle" style={{ backgroundColor: wt.color }} />
                    {wt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">Lighting</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Brightness</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={style.brightness}
                  onChange={(e) => updateStyle({ brightness: Number(e.target.value) })}
                  className="flex-1 accent-primary"
                  aria-label="Brightness"
                />
              </div>
              <div className="flex gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => updateStyle({ evening: false })}
                  className={`flex-1 text-[11px] py-1 rounded-md border ${!style.evening ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => updateStyle({ evening: true })}
                  className={`flex-1 text-[11px] py-1 rounded-md border ${style.evening ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  Evening
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Snapshot progress overlay */}
      {snapshotRequest && (
        <div className="absolute inset-0 z-20 bg-background/85 backdrop-blur-sm flex items-center justify-center" data-testid="snapshot-overlay">
          <div className="bg-card border border-border rounded-xl shadow-lg p-5 w-72 text-center space-y-3">
            <p className="text-sm font-semibold">Rendering your photo…</p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${snapshotProgress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Tracing real light — 20–60 seconds depending on your device
            </p>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSnapshotRequest(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Selected item panel */}
      {selectedItem && onUpdateFurniture && !snapshotRequest && (
        <div className="absolute top-3 right-3 z-10 bg-card/95 backdrop-blur border border-border rounded-lg shadow-md p-3 w-56 space-y-2.5" data-testid="item-3d-panel">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold truncate">{selectedItem.customName || selectedItem.label}</p>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div>
            <p className="text-xs font-medium mb-1">Colour</p>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setItemColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${selectedItem.colorOverride === c ? "border-primary" : "border-border"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Colour ${c}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setItemColor(undefined)}
                className={`h-6 px-1.5 rounded-full border text-[10px] ${!selectedItem.colorOverride ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
              >
                Default
              </button>
            </div>
          </div>

          {["worktop","kitchen_sink_s","kitchen_sink_d","floor_cupboard","drawer_unit_2","drawer_unit_3","larder_unit","wall_cupboard_single","wall_cupboard_double","wall_cupboard_corner","island"].includes(selectedItem.type) && (
            <div>
              <p className="text-xs font-medium mb-1">Door style</p>
              <div className="flex gap-1.5">
                {(["flat", "shaker"] as const).map((ds) => (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => setDoorStyle(ds)}
                    className={`flex-1 text-[11px] py-1 rounded-md border capitalize ${(selectedItem.doorStyle ?? "flat") === ds ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {ds}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={rotateSelected}
            className="w-full text-xs py-1.5 rounded-md border border-border hover:border-primary/60"
            data-testid="btn-3d-rotate"
          >
            ↻ Rotate
          </button>
          <p className="text-[10px] text-muted-foreground">
            Drag the selected item to move it · changes save with your plan
          </p>
        </div>
      )}

      {/* Hint / empty state */}
      {isEmpty ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-card/90 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground shadow-md">
            Draw some walls or add furniture in the 2D plan first, then flip back to 3D.
          </div>
        </div>
      ) : (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-card/80 backdrop-blur border border-border rounded-full px-3 py-1 text-[11px] text-muted-foreground shadow pointer-events-none">
          Drag to orbit &middot; Scroll or pinch to zoom &middot; Right-drag to pan
        </div>
      )}
    </div>
  );
}

function formatMeters(cm: number): string {
  return (cm / 100).toFixed(1) + "m";
}
