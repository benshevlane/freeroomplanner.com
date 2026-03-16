import { Point, Wall } from "./types";

export interface DetectedRoom {
  vertices: Point[];
  area: number;
  centroid: Point;
}

const CONNECT_THRESHOLD = 15; // cm

function pointsClose(a: Point, b: Point): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= CONNECT_THRESHOLD;
}

interface GraphNode {
  point: Point;
  neighbors: number[];
}

function findPointIndex(nodes: GraphNode[], p: Point): number {
  for (let i = 0; i < nodes.length; i++) {
    if (pointsClose(nodes[i].point, p)) return i;
  }
  return -1;
}

function addPoint(nodes: GraphNode[], p: Point): number {
  const existing = findPointIndex(nodes, p);
  if (existing >= 0) return existing;
  nodes.push({ point: p, neighbors: [] });
  return nodes.length - 1;
}

function shoelaceArea(vertices: Point[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

function centroid(vertices: Point[]): Point {
  let cx = 0;
  let cy = 0;
  for (const v of vertices) {
    cx += v.x;
    cy += v.y;
  }
  return { x: cx / vertices.length, y: cy / vertices.length };
}

export function detectRooms(walls: Wall[]): DetectedRoom[] {
  if (walls.length < 3) return [];

  // Build adjacency graph
  const nodes: GraphNode[] = [];

  for (const wall of walls) {
    const si = addPoint(nodes, wall.start);
    const ei = addPoint(nodes, wall.end);
    if (si !== ei) {
      if (!nodes[si].neighbors.includes(ei)) nodes[si].neighbors.push(ei);
      if (!nodes[ei].neighbors.includes(si)) nodes[ei].neighbors.push(si);
    }
  }

  // Find minimal cycles using DFS
  const rooms: DetectedRoom[] = [];
  const visitedCycles = new Set<string>();

  function findCycles(startIdx: number, currentIdx: number, path: number[], visited: Set<number>): void {
    if (path.length > 2 && currentIdx === startIdx) {
      // Found a cycle
      const sorted = [...path].sort((a, b) => a - b);
      const key = sorted.join(",");
      if (!visitedCycles.has(key)) {
        visitedCycles.add(key);
        const vertices = path.map((i) => nodes[i].point);
        const area = shoelaceArea(vertices);
        // Only include reasonable-sized rooms (at least 0.1 m²)
        if (area >= 1000) { // 1000 cm² = 0.1 m²
          rooms.push({
            vertices,
            area: area / 10000, // convert cm² to m²
            centroid: centroid(vertices),
          });
        }
      }
      return;
    }

    if (path.length > 12) return; // limit cycle length

    for (const neighbor of nodes[currentIdx].neighbors) {
      if (neighbor === startIdx && path.length > 2) {
        findCycles(startIdx, neighbor, path, visited);
      } else if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        findCycles(startIdx, neighbor, path, visited);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].neighbors.length >= 2) {
      const visited = new Set<number>([i]);
      findCycles(i, i, [i], visited);
    }
  }

  // Filter out duplicate rooms (keep smallest cycles only)
  // Sort by area ascending and remove rooms whose vertices are a superset of a smaller room
  rooms.sort((a, b) => a.area - b.area);

  return rooms;
}
