import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { EditorState, Wall, FurnitureItem, Point } from "../lib/types";
import { detectRooms } from "../lib/room-detection";

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
  floor: std("#d6c4a3", { roughness: 0.95 }),
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
// Wall construction with door/window openings
// ---------------------------------------------------------------------------
interface Opening {
  t0: number;
  t1: number;
  kind: "door" | "window" | "archway";
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
    if (t1 - t0 > 5) best.d.openings.push({ t0, t1, kind });
  }

  for (const d of data) d.openings.sort((a, b) => a.t0 - b.t0);
  return data;
}

function WallMesh({ data, height }: { data: WallWithOpenings; height: number }) {
  const { wall, length, angle, openings } = data;
  const th = Math.max(wall.thickness, 4);
  const material = wall.wallType === "interior" ? MAT.wallInterior : MAT.wall;

  const parts: { x: number; y: number; w: number; h: number; mat?: THREE.Material; depth?: number }[] = [];
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
    </group>
  );
}

// ---------------------------------------------------------------------------
// Floors from detected rooms
// ---------------------------------------------------------------------------
function Floors({ walls }: { walls: Wall[] }) {
  const shapes = useMemo(() => {
    const rooms = detectRooms(walls);
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

function ItemShape({ item, wallHeight }: { item: FurnitureItem; wallHeight: number }) {
  const w = item.width;
  const d = item.height;
  const t = item.type;
  const catMat = categoryMaterial(item.category);

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
    return (
      <>
        <Box w={w} h={87} d={d} mat={appliance ? MAT.appliance : MAT.kitchenUnit} />
        <Box w={w + 3} h={4} d={d + 3} y={89} mat={MAT.worktop} />
        {sink && <Box w={Math.min(w - 16, w * 0.75)} h={3} d={Math.min(d - 16, 44)} y={92} mat={MAT.chrome} />}
        {(t === "cooker" || t === "range_cooker") && <Box w={w - 10} h={2} d={d - 10} y={92} mat={MAT.screen} />}
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
    return <Box w={w} h={tallUnits[t]} d={d} mat={applianceTall ? MAT.appliance : t === "wardrobe" ? catMat : MAT.wood} />;
  }
  if (item.heightFromFloor !== undefined || t.startsWith("wall_cupboard")) {
    const lift = item.heightFromFloor ?? 145;
    return <Box w={w} h={70} d={d} y={lift + 35} mat={MAT.kitchenUnit} />;
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

function Item3D({ item, wallHeight }: { item: FurnitureItem; wallHeight: number }) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  return (
    <group position={[cx, 0, cy]} rotation={[0, -(item.rotation * Math.PI) / 180, 0]}>
      <group scale={[item.mirrored ? -1 : 1, 1, 1]}>
        <ItemShape item={item} wallHeight={wallHeight} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
interface View3DProps {
  state: EditorState;
  isDark: boolean;
}

export default function View3D({ state, isDark }: View3DProps) {
  const [wallHeight, setWallHeight] = useState(DEFAULT_WALL_HEIGHT);

  const wallData = useMemo(
    () => buildWallData(state.walls, state.furniture),
    [state.walls, state.furniture]
  );

  const items = useMemo(
    () => state.furniture.filter((f) => !OPENING_TYPES.has(f.type)),
    [state.furniture]
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

  const isEmpty = state.walls.length === 0 && state.furniture.length === 0;
  const camPos: [number, number, number] = [
    center.x + radius * 0.85,
    radius * 0.9,
    center.y + radius * 0.85,
  ];

  return (
    <div className="flex-1 relative overflow-hidden select-none" data-testid="view-3d">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45, near: 10, far: 50000, position: camPos }}
      >
        <color attach="background" args={[isDark ? "#20242a" : "#e9edf2"]} />
        <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#8a8a80" />
        <directionalLight
          position={[center.x + 900, 1500, center.y + 500]}
          intensity={1.15}
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
          <Item3D key={item.id} item={item} wallHeight={wallHeight} />
        ))}

        <OrbitControls
          target={[center.x, 60, center.y]}
          maxPolarAngle={Math.PI / 2 - 0.03}
          minDistance={120}
          maxDistance={radius * 6}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      {/* Wall height control */}
      <div className="absolute top-3 left-3 z-10 bg-card/90 backdrop-blur border border-border rounded-lg shadow-md px-3 py-2 flex items-center gap-2">
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
      </div>

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
