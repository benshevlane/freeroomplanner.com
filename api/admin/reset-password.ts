import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase.js";
import { hashPassword } from "./_passwords.js";

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

  const { token, password } = body ?? {};
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
}
