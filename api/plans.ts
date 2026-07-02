import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------
// /api/plans — save, update and fetch shareable room plans.
//
//   POST /api/plans            { data, name?, roomType? }        -> { id, editKey, url }
//   PUT  /api/plans            { id, editKey, data, name? }      -> { id, url, updated: true }
//   GET  /api/plans?id=CODE                                      -> { id, name, data, roomType }
//
// Plans are stored in the `room_plans` table. Row-level security is enabled
// with no policies, so the table is only reachable through this endpoint
// (which uses the service-role key), never directly from the browser.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

/** Max serialized plan size — a generous multiple of a typical plan (~5–30 KB). */
const MAX_PLAN_BYTES = 400_000;

/** Unambiguous alphabet (no 0/O, 1/I/L) for short codes people may read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{8}$`);

// Accepts the editor's multi-room export (version 2) and the legacy
// single-room shape (version 1) so old JSON files can be re-shared.
const planDataSchema = z.union([
  z.object({ version: z.literal(2), tabs: z.array(z.unknown()).min(1).max(40) }).passthrough(),
  z.object({ version: z.number(), walls: z.array(z.unknown()) }).passthrough(),
]);

const createSchema = z.object({
  data: planDataSchema,
  name: z.string().max(120).optional(),
  roomType: z.string().max(40).optional(),
});

const updateSchema = z.object({
  id: z.string().regex(CODE_RE),
  editKey: z.string().min(16).max(128),
  data: planDataSchema,
  name: z.string().max(120).optional(),
  roomType: z.string().max(40).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!db) {
    return res.status(503).json({ error: "Plan storage is not configured" });
  }

  try {
    // ---- GET: fetch a shared plan --------------------------------------
    if (req.method === "GET") {
      const id = String(req.query.id ?? "").toUpperCase();
      if (!CODE_RE.test(id)) {
        return res.status(400).json({ error: "Invalid plan code" });
      }
      const { data: row, error } = await db
        .from("room_plans")
        .select("id, name, data, room_type")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: "Plan not found" });

      // Fire-and-forget open counter; never blocks the response.
      db.rpc("increment_plan_opens", { plan_id: id }).then(
        () => {},
        () => {}
      );

      res.setHeader("Cache-Control", "public, max-age=30");
      return res.status(200).json({
        id: row.id,
        name: row.name,
        data: row.data,
        roomType: row.room_type,
      });
    }

    // Shared body checks for POST / PUT
    if (req.method === "POST" || req.method === "PUT") {
      const size = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
      if (size > MAX_PLAN_BYTES) {
        return res.status(413).json({ error: "Plan is too large to save" });
      }
    }

    // ---- POST: create a new shared plan --------------------------------
    if (req.method === "POST") {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid plan data" });
      }
      const { data, name, roomType } = parsed.data;
      const editKey = randomBytes(24).toString("base64url");
      const country =
        (req.headers["x-vercel-ip-country"] as string | undefined) ?? null;

      // Retry a couple of times in the (unlikely) event of a code collision.
      for (let attempt = 0; attempt < 3; attempt++) {
        const id = makeCode();
        const { error } = await db.from("room_plans").insert({
          id,
          name: name || "My floor plan",
          data,
          room_type: roomType ?? null,
          country,
          edit_key_hash: hashKey(editKey),
        });
        if (!error) {
          return res.status(200).json({ id, editKey, url: `/p/${id}`, country });
        }
        if (error.code !== "23505") throw error; // 23505 = unique violation
      }
      return res.status(500).json({ error: "Could not allocate a plan code" });
    }

    // ---- PUT: update an existing plan (requires the creator's edit key) -
    if (req.method === "PUT") {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid plan data" });
      }
      const { id, editKey, data, name, roomType } = parsed.data;
      const putCountry =
        (req.headers["x-vercel-ip-country"] as string | undefined) ?? null;

      const { data: row, error: fetchErr } = await db
        .from("room_plans")
        .select("edit_key_hash")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return res.status(404).json({ error: "Plan not found" });
      if (!row.edit_key_hash || row.edit_key_hash !== hashKey(editKey)) {
        return res.status(403).json({ error: "Not allowed to update this plan" });
      }

      const { error: updateErr } = await db
        .from("room_plans")
        .update({
          data,
          ...(name ? { name } : {}),
          ...(roomType ? { room_type: roomType } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return res.status(200).json({ id, url: `/p/${id}`, updated: true, country: putCountry });
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[plans] error:", err);
    return res.status(500).json({ error: "Something went wrong saving the plan" });
  }
}
