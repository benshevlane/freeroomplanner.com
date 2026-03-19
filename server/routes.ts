import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_SIZE = 500 * 1024; // 500 KB

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

  // Logo upload: accepts raw binary, uploads to Supabase Storage
  app.post(
    "/api/upload-logo",
    express.raw({ type: ALLOWED_TYPES, limit: "600kb" }),
    async (req, res) => {
      try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!serviceKey || !supabaseUrl) {
          return res.status(500).json({ error: "Storage not configured" });
        }

        const contentType = req.headers["content-type"] || "";
        if (!ALLOWED_TYPES.includes(contentType)) {
          return res.status(400).json({ error: "Unsupported file type" });
        }

        const body = req.body as Buffer;
        if (!body || body.length === 0) {
          return res.status(400).json({ error: "No file provided" });
        }
        if (body.length > MAX_SIZE) {
          return res.status(400).json({ error: "File too large (max 500 KB)" });
        }

        const ext = contentType.split("/")[1]?.replace("svg+xml", "svg").replace("jpeg", "jpg") || "png";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const admin = createClient(supabaseUrl, serviceKey);
        const { error } = await admin.storage
          .from("partner-logos")
          .upload(path, body, { contentType, upsert: false });

        if (error) {
          console.error("Logo upload error:", error.message);
          return res.status(500).json({ error: "Upload failed" });
        }

        const { data } = admin.storage
          .from("partner-logos")
          .getPublicUrl(path);

        return res.json({ url: data.publicUrl });
      } catch (e) {
        console.error("Logo upload error:", e);
        return res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  return httpServer;
}
