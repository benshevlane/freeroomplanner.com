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

  // Admin: upload hero image
  app.post("/api/admin/hero-image", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      // Find the boundary from content-type
      const contentType = req.headers["content-type"] || "";
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        return res.status(400).json({ error: "Missing multipart boundary" });
      }
      const boundary = boundaryMatch[1];
      const boundaryBuf = Buffer.from(`--${boundary}`);

      // Split on boundary
      const parts: Buffer[] = [];
      let start = 0;
      while (true) {
        const idx = body.indexOf(boundaryBuf, start);
        if (idx === -1) break;
        if (start > 0) parts.push(body.subarray(start, idx));
        start = idx + boundaryBuf.length;
      }

      // Find the file part
      for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;
        const headers = part.subarray(0, headerEnd).toString();
        if (!headers.includes("filename=")) continue;

        // File data starts after \r\n\r\n and ends before trailing \r\n
        let fileData = part.subarray(headerEnd + 4);
        if (fileData[fileData.length - 1] === 10 && fileData[fileData.length - 2] === 13) {
          fileData = fileData.subarray(0, fileData.length - 2);
        }

        fs.writeFileSync(HERO_IMAGE_PATH, fileData);
        return res.json({ ok: true, size: fileData.length });
      }

      return res.status(400).json({ error: "No file found in upload" });
    });
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
