import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { Resend } from "resend";
import { supabaseAdmin } from "./_supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const { email } = body ?? {};
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

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["host"] || "freeroomplanner.com";
      const resetUrl = `${proto}://${host}/admin?reset=${token}`;
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
}
