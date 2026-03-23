import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdmin } from "./_auth";
import { supabaseAdmin } from "./_supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
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
}
