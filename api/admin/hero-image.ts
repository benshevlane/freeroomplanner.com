import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdmin } from "./_auth";
import { supabaseAdmin } from "./_supabase";

const BUCKET = "hero-images";
const OBJECT_PATH = "hero-floorplan.jpg";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

async function heroImageExists(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list("", { search: OBJECT_PATH });
  if (error || !data) return false;
  return data.some((f) => f.name === OBJECT_PATH);
}

function getHeroPublicUrl(): string | null {
  if (!supabaseAdmin) return null;
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(OBJECT_PATH);
  return data.publicUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  if (req.method === "GET") {
    const exists = await heroImageExists();
    const url = exists ? getHeroPublicUrl() : null;
    return res.json({ exists, url });
  }

  if (req.method === "POST") {
    const buf = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === "string"
        ? Buffer.from(req.body, "base64")
        : null;
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "Missing image data" });
    }
    try {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(OBJECT_PATH, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const url = getHeroPublicUrl();
      return res.json({ ok: true, size: buf.length, url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    await supabaseAdmin.storage.from(BUCKET).remove([OBJECT_PATH]);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
