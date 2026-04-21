/**
 * POST /api/blog/publish
 *
 * Publishes a new blog post to freeroomplanner.com by committing static
 * HTML to the GitHub repo (which triggers a Vercel redeploy).
 *
 * Auth:
 *   Authorization: Bearer <BLOG_PUBLISH_TOKEN>
 *
 * Body (application/json) — flexible, these fields are accepted:
 *   title        (required)            — article headline
 *   slug         (optional)            — url slug; auto-generated from title if missing
 *   description  (required)            — meta description / excerpt; ~150 chars
 *   tag          (optional)            — badge / category, e.g. "Kitchen Planning"
 *   body | html | content  (required)  — article body HTML fragment (or plain text)
 *   readingTime  (optional)            — e.g. "8 min read"; auto-calculated otherwise
 *   datePublished (optional)           — ISO yyyy-mm-dd
 *   canonicalUrl  (optional)           — defaults to https://freeroomplanner.com/blog/<slug>
 *   ogImage       (optional)
 *   overwrite     (optional bool)      — allow replacing an existing post at the same slug
 *
 * Response:
 *   200 { ok: true, slug, url, commitUrl }
 *   400 { error: string }  — validation failures
 *   401 { error: string }  — missing/invalid token
 *   409 { error: string }  — slug already exists and overwrite=false
 *   5xx { error: string }  — GitHub / config failures
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  renderPostHtml,
  renderPostCard,
  renderSitemapEntry,
  estimateReadingTime,
  normaliseBody,
  slugify,
} from "./_template.js";
import { ghFileExists, ghGetFile, ghCommitMany } from "./_github.js";

const schema = z
  .object({
    title: z.string().min(3).max(200),
    slug: z.string().min(1).max(100).optional(),
    description: z.string().min(10).max(500),
    tag: z.string().min(1).max(60).optional(),
    body: z.string().min(20).optional(),
    html: z.string().min(20).optional(),
    content: z.string().min(20).optional(),
    readingTime: z.string().max(30).optional(),
    datePublished: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "datePublished must be YYYY-MM-DD")
      .optional(),
    canonicalUrl: z.string().url().optional(),
    ogImage: z.string().url().optional(),
    overwrite: z.boolean().optional(),
  })
  .refine((v) => !!(v.body || v.html || v.content), {
    message: "One of body, html, or content is required",
    path: ["body"],
  });

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow external services (like ralfseo) to POST directly
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth
  //
  // Token is baked into source on purpose: this repo is private and the
  // dashboard auto-generates/rotates this file, so we avoid the need for a
  // Vercel env var to be set by hand. `process.env.BLOG_PUBLISH_TOKEN` is
  // still honoured if set (useful for local dev / rotation in-place).
  const BAKED_PUBLISH_TOKEN =
    "frp_pub_aJ3WWmkVWqVViQoim0rMNw3PdYUcolo3ndL_EZtLbNcWQ788oKSR2w";
  const expected = process.env.BLOG_PUBLISH_TOKEN || BAKED_PUBLISH_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: "Publishing is not configured (no token available)" });
  }
  const auth = String(req.headers["authorization"] || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const presented = match ? match[1].trim() : "";
  if (!presented || !timingSafeEq(presented, expected)) {
    return res.status(401).json({ error: "Invalid or missing Bearer token" });
  }

  // Parse + validate
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const input = parsed.data;

  const slug = slugify(input.slug || input.title);
  const bodyRaw = (input.body || input.html || input.content || "").trim();
  const body = normaliseBody(bodyRaw);
  const readingTime = input.readingTime || estimateReadingTime(body);
  const tag = input.tag || "Room Planning";
  const datePublished = input.datePublished || new Date().toISOString().slice(0, 10);

  const postPath = `client/public/blog/${slug}.html`;
  const indexPath = `client/public/blog/index.html`;
  const sitemapPath = `client/public/sitemap.xml`;

  try {
    // Existence check (unless overwrite)
    if (!input.overwrite) {
      const exists = await ghFileExists(postPath);
      if (exists) {
        return res.status(409).json({
          error: `A post already exists at /blog/${slug}. Pass overwrite: true to replace it, or provide a different slug.`,
          slug,
        });
      }
    }

    // Render the post HTML
    const postHtml = renderPostHtml({
      title: input.title,
      slug,
      description: input.description,
      tag,
      body,
      readingTime,
      datePublished,
      canonicalUrl: input.canonicalUrl,
      ogImage: input.ogImage,
    });

    // Read current index + sitemap so we can splice the new card/entry in
    const [indexFile, sitemapFile] = await Promise.all([
      ghGetFile(indexPath),
      ghGetFile(sitemapPath),
    ]);

    // Insert the new card at the top of the first grid-3 in the index
    const card = renderPostCard({
      title: input.title,
      slug,
      description: input.description,
      tag,
      readingTime,
    });

    const gridOpen = `<div class="grid-3" style="margin-top:var(--space-10)">`;
    const gridIdx = indexFile.content.indexOf(gridOpen);
    let newIndex: string;
    if (gridIdx === -1) {
      // Index structure unexpected — append the card inside a fallback section instead of failing
      newIndex = indexFile.content.replace(
        /<\/body>/i,
        `<section class="section"><div class="container"><div class="grid-3">${card}</div></div></section>\n</body>`,
      );
    } else {
      // If the same slug appears already in the index (overwrite case), strip the old card
      let base = indexFile.content;
      const dupRe = new RegExp(
        `<article[^>]*class="post-card[^"]*"[^>]*>[\\s\\S]*?href="/blog/${slug}"[\\s\\S]*?</article>`,
        "g",
      );
      base = base.replace(dupRe, "");
      const pos = base.indexOf(gridOpen) + gridOpen.length;
      newIndex = base.slice(0, pos) + card + base.slice(pos);
    }

    // Update sitemap — add or replace the entry for this slug
    const sitemapLine = renderSitemapEntry(slug, datePublished);
    let newSitemap: string;
    const urlRe = new RegExp(
      `\\s*<url>\\s*<loc>https://freeroomplanner\\.com/blog/${slug}</loc>[\\s\\S]*?</url>`,
      "g",
    );
    if (urlRe.test(sitemapFile.content)) {
      newSitemap = sitemapFile.content.replace(urlRe, `\n${sitemapLine}`);
    } else {
      // Insert before the closing </urlset>
      newSitemap = sitemapFile.content.replace(
        /<\/urlset>/i,
        `${sitemapLine}\n</urlset>`,
      );
    }

    // Atomic multi-file commit
    const { commitUrl } = await ghCommitMany(
      [
        { path: postPath, content: postHtml },
        { path: indexPath, content: newIndex },
        { path: sitemapPath, content: newSitemap },
      ],
      `blog: publish "${input.title}" (${slug})`,
    );

    const url = `https://freeroomplanner.com/blog/${slug}`;
    return res.status(200).json({
      ok: true,
      slug,
      url,
      commitUrl,
      note: "Post committed. Vercel will redeploy in ~30–60 seconds; the article will be live shortly after.",
    });
  } catch (err: any) {
    console.error("[/api/blog/publish] error", err);
    return res.status(500).json({
      error: err?.message || "Failed to publish post",
    });
  }
}
