import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// ---------------------------------------------------------------------------
// /api/daily-report — emailed summary of yesterday's planner activity:
// plans started and plans saved, broken down by room type and country.
//
// Triggered by the Vercel cron in vercel.json every morning (production
// only — Vercel crons don't run on previews). Can also be invoked manually
// for testing; it returns the summary as JSON either way.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

type Row = { room_type: string | null; country: string | null };

function breakdown(rows: Row[]) {
  const byRoom: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  for (const r of rows) {
    const room = r.room_type || "unknown";
    const country = r.country || "unknown";
    byRoom[room] = (byRoom[room] ?? 0) + 1;
    byCountry[country] = (byCountry[country] ?? 0) + 1;
  }
  const sort = (o: Record<string, number>) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { byRoom: sort(byRoom), byCountry: sort(byCountry) };
}

function tableHtml(title: string, entries: [string, number][]): string {
  if (entries.length === 0) return "";
  const rows = entries
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#374151">${k}</td><td style="padding:4px 0;font-weight:600">${v}</td></tr>`
    )
    .join("");
  return `<h3 style="margin:18px 0 6px;font-size:14px;color:#0f766e">${title}</h3><table style="border-collapse:collapse;font-size:14px">${rows}</table>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only Vercel's cron scheduler (or a manual call with the secret, when one
  // is configured) may trigger the email.
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = (req.headers["user-agent"] ?? "").includes("vercel-cron");
  const hasSecret =
    cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;
  const sendAllowed = isVercelCron || hasSecret || req.query.dry === "1";
  if (!sendAllowed) {
    return res.status(403).json({ error: "Not allowed" });
  }

  if (!db) return res.status(503).json({ error: "Storage not configured" });

  try {
    // Yesterday, UTC.
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const dateLabel = start.toISOString().slice(0, 10);

    const [startsQ, savesQ, totalPlansQ] = await Promise.all([
      db
        .from("usage_events")
        .select("room_type, country")
        .eq("event_type", "plan_started")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
      db
        .from("room_plans")
        .select("room_type, country")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
      db.from("room_plans").select("id", { count: "exact", head: true }),
    ]);
    if (startsQ.error) throw startsQ.error;
    if (savesQ.error) throw savesQ.error;

    const starts = (startsQ.data ?? []) as Row[];
    const saves = (savesQ.data ?? []) as Row[];
    const startsB = breakdown(starts);
    const savesB = breakdown(saves);

    const summary = {
      date: dateLabel,
      plansStarted: starts.length,
      plansSaved: saves.length,
      savedByRoom: Object.fromEntries(savesB.byRoom),
      savedByCountry: Object.fromEntries(savesB.byCountry),
      startedByRoom: Object.fromEntries(startsB.byRoom),
      startedByCountry: Object.fromEntries(startsB.byCountry),
      totalPlansAllTime: totalPlansQ.count ?? null,
    };

    // Dry run: report the numbers without emailing (used for testing).
    if (req.query.dry === "1" && !isVercelCron && !hasSecret) {
      return res.status(200).json({ sent: false, dryRun: true, ...summary });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res
        .status(200)
        .json({ sent: false, reason: "email not configured", ...summary });
    }

    const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px">
  <h2 style="color:#0f766e;margin-bottom:2px">Free Room Planner — daily report</h2>
  <p style="color:#6b7280;margin-top:0;font-size:13px">${dateLabel} (UTC)</p>
  <table style="border-collapse:collapse;font-size:15px;margin:10px 0">
    <tr><td style="padding:4px 12px 4px 0">Plans started</td><td style="font-weight:700">${summary.plansStarted}</td></tr>
    <tr><td style="padding:4px 12px 4px 0">Plans saved (new links)</td><td style="font-weight:700">${summary.plansSaved}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Total saved plans, all time</td><td style="color:#6b7280">${summary.totalPlansAllTime ?? "—"}</td></tr>
  </table>
  ${tableHtml("Saved — by room", savesB.byRoom)}
  ${tableHtml("Saved — by country", savesB.byCountry)}
  ${tableHtml("Started — by room", startsB.byRoom)}
  ${tableHtml("Started — by country", startsB.byCountry)}
  <p style="color:#9ca3af;font-size:12px;margin-top:22px">Automated daily report · freeroomplanner.com</p>
</div>`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
      to: process.env.REPORT_EMAIL || "ben@freeroomplanner.com",
      subject: `Room Planner daily: ${summary.plansSaved} saved / ${summary.plansStarted} started — ${dateLabel}`,
      html,
    });
    if (error) {
      return res.status(500).json({ sent: false, error: error.message, ...summary });
    }

    return res.status(200).json({ sent: true, ...summary });
  } catch (err) {
    console.error("[daily-report] error:", err);
    return res.status(500).json({ error: "Report failed" });
  }
}
