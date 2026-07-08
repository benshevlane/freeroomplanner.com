import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { z } from "zod";

// Service-role Supabase client for persisting feedback (mirrors api/track.ts).
// If the env is unset we simply skip the insert — feedback still emails.
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Escape user-supplied text before placing it in the notification email HTML.
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const feedbackFormSchema = z.object({
  type: z.enum(["bug", "feature", "general", "praise"], {
    required_error: "Please select a feedback type",
  }),
  message: z.string().min(1, "Message is required").max(5000),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  rating: z.number().int().min(1).max(5).optional(),
  page: z.string().max(200).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Email service not configured" });
    }

    const parsed = feedbackFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const { type, message, email, rating, page } = parsed.data;

    // Persist the feedback for the daily report / admin views. Best-effort:
    // an insert failure must never break the user's feedback submission.
    if (db) {
      const country =
        (req.headers["x-vercel-ip-country"] as string | undefined) ?? null;
      try {
        await db.from("feedback").insert({
          type,
          message,
          email: email ?? null,
          rating: rating ?? null,
          page: page ?? null,
          country,
        });
      } catch {
        // Persistence must never surface errors to users.
      }
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
      to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
      ...(email ? { replyTo: email } : {}),
      subject: `[Feedback - ${type}] New feedback from Free Room Planner`,
      html: `<p><strong>Type:</strong> ${esc(type)}</p>
${email ? `<p><strong>Email:</strong> ${esc(email)}</p>` : ""}
<hr/>
<p>${esc(message).replace(/\n/g, "<br/>")}</p>`,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    return res.status(500).json({ error: msg });
  }
}
