import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import path from "path";
import fs from "fs";

const HERO_IMAGE_PATH = path.join(
  import.meta.dirname,
  "..",
  "client",
  "public",
  "hero-floorplan.png"
);

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

  // Admin: upload hero image (accepts JSON with base64 data)
  app.post("/api/admin/hero-image", (req, res) => {
    try {
      const { data } = req.body;
      if (!data || typeof data !== "string") {
        return res.status(400).json({ error: "Missing image data" });
      }
      // Strip data URL prefix if present (e.g. "data:image/png;base64,...")
      const base64 = data.includes(",") ? data.split(",")[1] : data;
      const buf = Buffer.from(base64, "base64");
      fs.writeFileSync(HERO_IMAGE_PATH, buf);
      return res.json({ ok: true, size: buf.length });
    } catch {
      return res.status(400).json({ error: "Invalid image data" });
    }
  });

  // Admin: check if hero image exists
  app.get("/api/admin/hero-image", (_req, res) => {
    const exists = fs.existsSync(HERO_IMAGE_PATH);
    res.json({ exists, path: "/hero-floorplan.png" });
  });

  // Admin: delete hero image
  app.delete("/api/admin/hero-image", (_req, res) => {
    if (fs.existsSync(HERO_IMAGE_PATH)) {
      fs.unlinkSync(HERO_IMAGE_PATH);
    }
    res.json({ ok: true });
  });

  return httpServer;
}
