import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdmin } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.json({ authenticated: isAdmin(req) });
}
