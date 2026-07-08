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

// Escape user-supplied feedback text before placing it in the email HTML.
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    !!cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;
  // Every caller must be the Vercel cron or present the secret — including
  // the ?dry=1 preview, which returns aggregate counts.
  if (!isVercelCron && !hasSecret) {
    return res.status(403).json({ error: "Not allowed" });
  }
  const dryRun = req.query.dry === "1";

  if (!db) return res.status(503).json({ error: "Storage not configured" });

  try {
    // Yesterday, UTC.
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const dateLabel = start.toISOString().slice(0, 10);

    const [startsQ, savesQ, totalPlansQ, downloadsQ, ratingsQ, feedbackQ] = await Promise.all([
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
      db
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "plan_downloaded")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
      db
        .from("feedback")
        .select("rating")
        .not("rating", "is", null)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
      db
        .from("feedback")
        .select("rating, message, created_at")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (startsQ.error) throw startsQ.error;
    if (savesQ.error) throw savesQ.error;

    const starts = (startsQ.data ?? []) as Row[];
    const saves = (savesQ.data ?? []) as Row[];
    const startsB = breakdown(starts);
    const savesB = breakdown(saves);

    // Category breakdown for saved plans this window (top 8, skip null).
    const categoryBreakdown = savesB.byRoom
      .filter(([k]) => k && k !== "unknown")
      .slice(0, 8);

    // Ratings + recent feedback from the feedback table (this window).
    const ratingRows = (ratingsQ.data ?? []) as { rating: number | null }[];
    const ratingValues = ratingRows
      .map((r) => r.rating)
      .filter((v): v is number => typeof v === "number");
    const ratingCount = ratingValues.length;
    const ratingAvg =
      ratingCount > 0
        ? Number(
            (ratingValues.reduce((a, b) => a + b, 0) / ratingCount).toFixed(1)
          )
        : null;
    const recentFeedback = ((feedbackQ.data ?? []) as {
      rating: number | null;
      message: string | null;
      created_at: string | null;
    }[]).map((r) => ({
      rating: r.rating,
      message: (r.message ?? "").slice(0, 200),
      created_at: r.created_at,
    }));

    const summary = {
      date: dateLabel,
      plansStarted: starts.length,
      plansSaved: saves.length,
      plansDownloaded: downloadsQ.count ?? 0,
      savedByRoom: Object.fromEntries(savesB.byRoom),
      savedByCountry: Object.fromEntries(savesB.byCountry),
      startedByRoom: Object.fromEntries(startsB.byRoom),
      startedByCountry: Object.fromEntries(startsB.byCountry),
      categoryBreakdown: Object.fromEntries(categoryBreakdown),
      ratingAvg,
      ratingCount,
      recentFeedback,
      totalPlansAllTime: totalPlansQ.count ?? null,
    };

    // Dry run: report the numbers without emailing (used for testing).
    if (dryRun) {
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
    <tr><td style="padding:4px 12px 4px 0">Plans downloaded</td><td style="font-weight:700">${summary.plansDownloaded}</td></tr>
    <tr><td style="padding:4px 12px 4px 0">Avg rating</td><td style="font-weight:700">${summary.ratingAvg != null ? `${summary.ratingAvg} (${summary.ratingCount})` : "—"}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Total saved plans, all time</td><td style="color:#6b7280">${summary.totalPlansAllTime ?? "—"}</td></tr>
  </table>
  ${tableHtml("By category", categoryBreakdown)}
  ${tableHtml("Saved — by room", savesB.byRoom)}
  ${tableHtml("Saved — by country", savesB.byCountry)}
  ${tableHtml("Started — by room", startsB.byRoom)}
  ${tableHtml("Started — by country", startsB.byCountry)}
  ${
    recentFeedback.length
      ? `<h3 style="margin:18px 0 6px;font-size:14px;color:#0f766e">Recent feedback</h3>` +
        recentFeedback
          .map(
            (f) =>
              `<div style="font-size:13px;color:#374151;margin:0 0 8px;padding:6px 8px;background:#f9fafb;border-radius:6px"><strong>${
                f.rating != null ? `${f.rating}★` : "—"
              }</strong> ${esc(f.message)}<div style="color:#9ca3af;font-size:11px;margin-top:2px">${
                f.created_at ? new Date(f.created_at).toISOString().slice(0, 16).replace("T", " ") : ""
              }</div></div>`
          )
          .join("")
      : ""
  }
  <p style="color:#9ca3af;font-size:12px;margin-top:22px">Automated daily report · freeroomplanner.com</p>
</div>`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Free Room Planner <noreply@freeroomplanner.com>",
      to: process.env.REPORT_EMAIL || "ben@freeroomplanner.com",
      subject: `Room Planner daily: ${summary.plansSaved} saved / ${summary.plansStarted} started / ${summary.plansDownloaded} downloaded — ${dateLabel}`,
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
