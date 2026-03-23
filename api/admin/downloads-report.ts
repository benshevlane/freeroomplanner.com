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
}
