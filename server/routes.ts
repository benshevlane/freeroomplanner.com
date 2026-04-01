import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { Resend } from "resend";
import crypto from "crypto";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { hashPassword, verifyPassword } from "./auth";
import { contactFormSchema, feedbackFormSchema, embedSignupNotificationSchema } from "../shared/email-schemas";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// Rate limiting for login
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

function checkRateLimit(ip: string): { blocked: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { blocked: false };
  if (now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(ip);
    return { blocked: false };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.firstAttempt + WINDOW_MS - now) / 1000);
    return { blocked: true, retryAfterSeconds };
  }
  return { blocked: false };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
  }
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
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);
    if (rateCheck.blocked) {
      res.setHeader("Retry-After", String(rateCheck.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many login attempts. Please try again later.",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
    }

    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || email.length === 0) {
      return res.status(400).json({ error: "Email required" });
    }
    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ error: "Password required" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const { data: admin, error: dbError } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, password_hash")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (dbError) {
      console.error("Admin login DB error:", dbError.message);
      return res.status(500).json({ error: "Internal error" });
    }

    if (!admin) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    loginAttempts.delete(ip);
    req.session.isAdmin = true;
    req.session.adminEmail = admin.email;
    return res.json({ ok: true });
  });

  // Admin: check auth status
  app.get("/api/admin/auth-status", (req, res) => {
    if (req.session?.isAdmin) {
      return res.json({ authenticated: true, email: req.session.adminEmail });
    }
    return res.json({ authenticated: false });
  });

  // Admin: logout
  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });

  // Admin: forgot password — send reset email
  app.post("/api/admin/forgot-password", async (req, res) => {
    const { email } = req.body ?? {};
    if (typeof email !== "string" || email.length === 0) {
      return res.status(400).json({ error: "Email required" });
    }

    // Always return success to avoid leaking which emails exist
    if (!supabaseAdmin) {
      return res.json({ ok: true });
    }

    const { data: admin } = await supabaseAdmin
      .from("admin_users")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (!admin) {
      return res.json({ ok: true });
    }

    // Generate a secure token and set 1-hour expiry
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("admin_users")
      .update({ reset_token: token, reset_token_expires_at: expiresAt })
      .eq("id", admin.id);

    if (updateErr) {
      console.error("Failed to store reset token:", updateErr.message);
      return res.json({ ok: true });
    }

    // Send reset email
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const resetUrl = `${baseUrl}/admin?reset=${token}`;
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
          to: admin.email,
          subject: "Reset your admin password",
          html: `<h2>Password Reset</h2>
<p>You requested a password reset for your Free Room Planner admin account.</p>
<p><a href="${resetUrl}" style="display:inline-block;background:#3d8a7c;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a></p>
<p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
        });
      } catch (err) {
        console.error("Failed to send reset email:", err instanceof Error ? err.message : err);
      }
    }

    return res.json({ ok: true });
  });

  // Admin: reset password with token
  app.post("/api/admin/reset-password", async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || token.length === 0) {
      return res.status(400).json({ error: "Token required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const { data: admin, error: dbErr } = await supabaseAdmin
      .from("admin_users")
      .select("id, reset_token, reset_token_expires_at")
      .eq("reset_token", token)
      .maybeSingle();

    if (dbErr || !admin) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    if (!admin.reset_token_expires_at || new Date(admin.reset_token_expires_at) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    const newHash = await hashPassword(password);
    const { error: updateErr } = await supabaseAdmin
      .from("admin_users")
      .update({
        password_hash: newHash,
        reset_token: null,
        reset_token_expires_at: null,
      })
      .eq("id", admin.id);

    if (updateErr) {
      console.error("Failed to update password:", updateErr.message);
      return res.status(500).json({ error: "Failed to reset password" });
    }

    return res.json({ ok: true });
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

  // Admin: downloads report
  app.get("/api/admin/downloads-report", requireAdmin, async (_req, res) => {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase not configured" });
    }
    try {
      // Get all plan_exported events with partner info
      const { data: events, error: eErr } = await supabaseAdmin
        .from("embed_events")
        .select("partner_id, event_type, referrer, created_at")
        .eq("event_type", "plan_exported");
      if (eErr) throw eErr;

      const { data: partners, error: pErr } = await supabaseAdmin
        .from("partners")
        .select("partner_id, business_name");
      if (pErr) throw pErr;

      const partnerNames: Record<string, string> = {};
      for (const p of partners ?? []) {
        partnerNames[p.partner_id] = p.business_name;
      }

      // Per-partner breakdown
      const perPartner: Record<string, number> = {};
      for (const ev of events ?? []) {
        perPartner[ev.partner_id] = (perPartner[ev.partner_id] ?? 0) + 1;
      }

      const partnerBreakdown = Object.entries(perPartner)
        .map(([partner_id, count]) => ({
          partner_id,
          business_name: partnerNames[partner_id] ?? partner_id,
          plan_exported_count: count,
        }))
        .sort((a, b) => b.plan_exported_count - a.plan_exported_count);

      return res.json({
        total_downloads: (events ?? []).length,
        embed_partner_downloads: partnerBreakdown,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch downloads report";
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

  // Embed partner signup notification + user confirmation
  app.post("/api/embed-notify-signup", async (req, res) => {
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: "Email service not configured" });
    }
    const parsed = embedSignupNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }
    const { partnerId, contactName, businessName, email, websiteUrl, embedCode } = parsed.data;
    const fromAddr = process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>";
    const resend = new Resend(process.env.RESEND_API_KEY);

    // 1. Owner notification
    try {
      await resend.emails.send({
        from: fromAddr,
        to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
        replyTo: email,
        subject: `[New Embed Partner] ${businessName}`,
        html: `<h2>New Embed Partner Signup</h2>
<p>A new partner signed up and got their embed code.</p>
<p><strong>Name:</strong> ${contactName}</p>
<p><strong>Business:</strong> ${businessName}</p>
<p><strong>Partner ID:</strong> ${partnerId}</p>
<p><strong>Email:</strong> ${email}</p>
${websiteUrl ? `<p><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>` : ""}
<p><strong>Time:</strong> ${new Date().toUTCString()}</p>`,
      });
    } catch (err) {
      console.error("Failed to send owner notification:", err instanceof Error ? err.message : err);
    }

    // 2. User confirmation with embed code
    try {
      const escapedCode = embedCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await resend.emails.send({
        from: fromAddr,
        to: email,
        subject: "Your Free Room Planner Embed Code",
        html: `<h2>Your Embed Code is Ready!</h2>
<p>Hi ${contactName},</p>
<p>Thanks for choosing Free Room Planner! Below is your embed code for <strong>${businessName}</strong>.</p>
<h3>Your Embed Code</h3>
<p>Copy and paste this into your website's HTML where you'd like the room planner to appear:</p>
<pre style="background:#f4f4f4;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.4;"><code>${escapedCode}</code></pre>
<h3>How to Add It</h3>
<ul>
  <li><strong>WordPress:</strong> Add a "Custom HTML" block and paste the code</li>
  <li><strong>Squarespace:</strong> Add a "Code" block and paste the code</li>
  <li><strong>Wix:</strong> Add an "Embed HTML" element and paste the code</li>
  <li><strong>Other:</strong> Paste into your page's HTML source where you want the planner</li>
</ul>
<p>If you have any questions, just reply to this email.</p>
<p>— The Free Room Planner Team<br/>
<a href="https://freeroomplanner.com">freeroomplanner.com</a></p>`,
      });
    } catch (err) {
      console.error("Failed to send user confirmation:", err instanceof Error ? err.message : err);
    }

    return res.json({ ok: true });
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
