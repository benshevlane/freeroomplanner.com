import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// /api/track — tiny fire-and-forget usage events (no personal data).
// Currently used for "plan_started" so the daily report can compare how many
// people start planning vs how many save. Country comes from Vercel's
// geolocation header; room type from the "What are you planning?" answer.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const eventSchema = z.object({
  event: z.enum(["plan_started"]),
  roomType: z.string().max(40).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!db) return res.status(204).end(); // never bother the client about this

  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(204).end();

  const country =
    (req.headers["x-vercel-ip-country"] as string | undefined) ?? null;

  try {
    await db.from("usage_events").insert({
      event_type: parsed.data.event,
      room_type: parsed.data.roomType ?? null,
      country,
    });
  } catch {
    // Tracking must never surface errors to users.
  }
  return res.status(204).end();
}
