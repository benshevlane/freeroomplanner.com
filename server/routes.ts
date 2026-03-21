import crypto from "crypto";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { Resend } from "resend";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { contactFormSchema, feedbackFormSchema } from "../shared/email-schemas";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

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

  // Admin: login
  app.post("/api/admin/login", async (req, res) => {
    const { password } = req.body ?? {};
    const expected = process.env.ADMIN_PASSWORD || "Rayleigh11";
    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ error: "Password required" });
    }
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!valid) {
      return res.status(401).json({ error: "Invalid password" });
    }
    req.session.isAdmin = true;
    return res.json({ ok: true });
  });

  // Admin: check auth status
  app.get("/api/admin/auth-status", (req, res) => {
    res.json({ authenticated: !!req.session?.isAdmin });
  });

  // Admin: embed users report
  app.get("/api/admin/embed-report", requireAdmin, async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase not configured" });
    }
    try {
      const { data: partners, error: pErr } = await supabaseAdmin
        .from("partners")
        .select("partner_id, business_name, email, website_url, created_at");
      if (pErr) throw pErr;

      const { data: events, error: eErr } = await supabaseAdmin
        .from("embed_events")
        .select("partner_id, event_type")
        .in("event_type", ["plan_exported", "embed_loaded"]);
      if (eErr) throw eErr;

      // Aggregate event counts per partner
      const counts: Record<string, { embed_loaded: number; plan_exported: number }> = {};
      for (const ev of events ?? []) {
        if (!counts[ev.partner_id]) {
          counts[ev.partner_id] = { embed_loaded: 0, plan_exported: 0 };
        }
        if (ev.event_type === "embed_loaded") counts[ev.partner_id].embed_loaded++;
        if (ev.event_type === "plan_exported") counts[ev.partner_id].plan_exported++;
      }

      const result = (partners ?? []).map((p) => ({
        partner_id: p.partner_id,
        business_name: p.business_name,
        email: p.email,
        website_url: p.website_url,
        created_at: p.created_at,
        embed_loaded_count: counts[p.partner_id]?.embed_loaded ?? 0,
        plan_exported_count: counts[p.partner_id]?.plan_exported ?? 0,
      }));

      return res.json({ partners: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch report";
      return res.status(500).json({ error: msg });
    }
  });

  // Admin: upload hero image
  app.post("/api/admin/hero-image",
    requireAdmin,
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
  app.get("/api/admin/hero-image", requireAdmin, async (_req, res) => {
    const exists = await heroImageExists();
    const url = exists ? getHeroPublicUrl() : null;
    res.json({ exists, url });
  });

  // Admin: delete hero image
  app.delete("/api/admin/hero-image", requireAdmin, async (_req, res) => {
    await deleteHeroImage();
    res.json({ ok: true });
  });

  // Contact form
  app.post("/api/contact", async (req, res) => {
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: "Email service not configured" });
    }
    const parsed = contactFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { name, email, subject, message } = parsed.data;
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
        to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
        replyTo: email,
        subject: `[Contact] ${subject}`,
        html: `<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Subject:</strong> ${subject}</p>
<hr/>
<p>${message.replace(/\n/g, "<br/>")}</p>`,
      });
      return res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      return res.status(500).json({ error: msg });
    }
  });

  // Feedback form
  app.post("/api/feedback", async (req, res) => {
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: "Email service not configured" });
    }
    const parsed = feedbackFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { type, message, email } = parsed.data;
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
        to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
        ...(email ? { replyTo: email } : {}),
        subject: `[Feedback - ${type}] New feedback from Free Room Planner`,
        html: `<p><strong>Type:</strong> ${type}</p>
${email ? `<p><strong>Email:</strong> ${email}</p>` : ""}
<hr/>
<p>${message.replace(/\n/g, "<br/>")}</p>`,
      });
      return res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      return res.status(500).json({ error: msg });
    }
  });

  return httpServer;
}
