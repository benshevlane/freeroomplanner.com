import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import path from "path";
import fs from "fs";


// In production the server runs from dist/ and serves dist/public/.
// In dev, Vite serves from client/public/. Write to both so the file
// is reachable regardless of environment.
function getHeroImagePaths(): string[] {
  const paths: string[] = [];
  // Production: dist/public/ (where static.ts serves from)
  const distPublic = path.resolve(__dirname, "public", "hero-floorplan.png");
  paths.push(distPublic);
  // Development: client/public/
  const clientPublic = path.resolve(__dirname, "..", "client", "public", "hero-floorplan.png");
  if (clientPublic !== distPublic) paths.push(clientPublic);
  return paths;
}

function heroImageExists(): boolean {
  return getHeroImagePaths().some((p) => fs.existsSync(p));
}

function writeHeroImage(buf: Buffer): void {
  for (const p of getHeroImagePaths()) {
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) {
      fs.writeFileSync(p, buf);
    }
  }
}

function deleteHeroImage(): void {
  for (const p of getHeroImagePaths()) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/plans", async (req, res) => {
    try {
      const plan = await storage.createRoomPlan(req.body);
      res.json(plan);
    } catch (e) {
      res.status(400).json({ error: "Invalid plan data" });
    }
  });

  app.get("/api/plans/:id", async (req, res) => {
    const plan = await storage.getRoomPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
  });

  // Admin: upload hero image (reads raw body to avoid middleware issues)
  app.post("/api/admin/hero-image", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        if (!body || body.length < 10) {
          return res.status(400).json({ error: "Missing image data" });
        }
        const base64 = body.includes(",") ? body.split(",")[1] : body;
        const buf = Buffer.from(base64, "base64");
        writeHeroImage(buf);
        return res.json({ ok: true, size: buf.length });
      } catch {
        return res.status(400).json({ error: "Invalid image data" });
      }
    });
    req.on("error", () => {
      res.status(400).json({ error: "Upload error" });
    });
  });

  // Admin: check if hero image exists
  app.get("/api/admin/hero-image", (_req, res) => {
    res.json({ exists: heroImageExists(), path: "/hero-floorplan.png" });
  });

  // Admin: delete hero image
  app.delete("/api/admin/hero-image", (_req, res) => {
    deleteHeroImage();
    res.json({ ok: true });
  });

  return httpServer;
}
