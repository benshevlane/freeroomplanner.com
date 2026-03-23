import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validatePassword, setAuthCookie } from "./_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ error: "Password required" });
  }

  if (!validatePassword(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  setAuthCookie(res);
  return res.json({ ok: true });
}
