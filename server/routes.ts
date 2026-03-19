import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";

const BUCKET = "hero-images";
const OBJECT_PATH = "hero-floorplan.jpg";

async function heroImageExists(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list("", { search: OBJECT_PATH });
  if (error || !data) return false;
  return data.some((f) => f.name === OBJECT_PATH);
}

function getHeroPublicUrl(): string | null {
  if (!supabaseAdmin) return null;
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(OBJECT_PATH);
  return data.publicUrl;
}

async function writeHeroImage(buf: Buffer): Promise<string> {
  if (!supabaseAdmin) throw new Error("Supabase Storage not configured");
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(OBJECT_PATH, buf, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) throw error;
  return getHeroPublicUrl()!;
}

async function deleteHeroImage(): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.storage.from(BUCKET).remove([OBJECT_PATH]);
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

  // Admin: upload hero image
  app.post("/api/admin/hero-image",
    express.raw({ type: "application/octet-stream", limit: "20mb" }),
    async (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: "Missing image data" });
      }
      try {
        const url = await writeHeroImage(buf);
        return res.json({ ok: true, size: buf.length, url });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        return res.status(500).json({ error: msg });
      }
    },
  );

  // Admin: check if hero image exists
  app.get("/api/admin/hero-image", async (_req, res) => {
    const exists = await heroImageExists();
    const url = exists ? getHeroPublicUrl() : null;
    res.json({ exists, url });
  });

  // Admin: delete hero image
  app.delete("/api/admin/hero-image", async (_req, res) => {
    await deleteHeroImage();
    res.json({ ok: true });
  });

  return httpServer;
}
