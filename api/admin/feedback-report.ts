import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdmin } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

// Admin feedback view: every rating and written comment from the in-app
// feedback flows, with a rating histogram and a tally of the "what are you
// using it for?" answers (parsed from the message body).

const DAY_MS = 24 * 60 * 60 * 1000;

interface FeedbackRow {
  created_at: string;
  type: string | null;
  message: string | null;
  email: string | null;
  rating: number | null;
  page: string | null;
  country: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isAdmin(req).authenticated) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });

  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * DAY_MS).toISOString();

  try {
    const q = await supabaseAdmin
      .from("feedback")
      .select("created_at, type, message, email, rating, page, country")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    if (q.error) throw q.error;
    const rows = (q.data ?? []) as FeedbackRow[];

    // Rating histogram
    const histogram: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let ratingSum = 0;
    let ratingCount = 0;
    for (const r of rows) {
      if (typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5) {
        histogram[String(r.rating)] += 1;
        ratingSum += r.rating;
        ratingCount += 1;
      }
    }

    // Use-case tally, parsed from the "Using it for: X" line the rating
    // dialog writes into the message body.
    const useCases: Record<string, number> = {};
    for (const r of rows) {
      const m = r.message?.match(/^Using it for: (.+)$/m);
      if (m) {
        const key = m[1].trim();
        useCases[key] = (useCases[key] ?? 0) + 1;
      }
    }

    // Written comments: strip the boilerplate rating/use-case lines so the
    // list shows only actual words from users (plus score + context).
    const comments = rows
      .map((r) => {
        const body = (r.message ?? "")
          .replace(/^In-app rating: \d\/5$/m, "")
          .replace(/^Using it for: .+$/m, "")
          .trim();
        return { ...r, body };
      })
      .filter((r) => r.body.length > 0);

    return res.status(200).json({
      days,
      total: rows.length,
      ratingAvg: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : null,
      ratingCount,
      histogram,
      useCases: Object.entries(useCases)
        .sort((a, b) => b[1] - a[1])
        .map(([useCase, count]) => ({ useCase, count })),
      comments: comments.slice(0, 100),
    });
  } catch (err) {
    console.error("feedback-report error", err);
    return res.status(500).json({ error: "Failed to load feedback report" });
  }
}
