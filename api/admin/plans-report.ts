import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdmin } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

// Admin summary: plans started, plans saved, and affiliate clicks — broken
// down by country and room type. Reads room_plans (saves) + usage_events
// (starts, affiliate clicks). Confirmed leads & revenue live in CJ and are
// reported there (SubID = country_room_plancode); this view covers the
// on-site funnel up to the click.

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = { room_type: string | null; country: string | null };

function tally(rows: Row[]) {
  const byRoom: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  for (const r of rows) {
    const room = r.room_type || "unknown";
    const country = r.country || "unknown";
    byRoom[room] = (byRoom[room] ?? 0) + 1;
    byCountry[country] = (byCountry[country] ?? 0) + 1;
  }
  return { total: rows.length, byRoom, byCountry };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isAdmin(req).authenticated) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });

  // ?days=N window (default 30, max 365)
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * DAY_MS).toISOString();

  try {
    const [savesQ, startsQ, clicksQ, totalQ] = await Promise.all([
      supabaseAdmin.from("room_plans").select("room_type, country").gte("created_at", since),
      supabaseAdmin.from("usage_events").select("room_type, country").eq("event_type", "plan_started").gte("created_at", since),
      supabaseAdmin.from("usage_events").select("room_type, country").eq("event_type", "affiliate_click").gte("created_at", since),
      supabaseAdmin.from("room_plans").select("id", { count: "exact", head: true }),
    ]);
    if (savesQ.error) throw savesQ.error;
    if (startsQ.error) throw startsQ.error;
    if (clicksQ.error) throw clicksQ.error;

    return res.json({
      days,
      totalPlansAllTime: totalQ.count ?? null,
      starts: tally((startsQ.data ?? []) as Row[]),
      saves: tally((savesQ.data ?? []) as Row[]),
      affiliateClicks: tally((clicksQ.data ?? []) as Row[]),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch report";
    return res.status(500).json({ error: msg });
  }
}
