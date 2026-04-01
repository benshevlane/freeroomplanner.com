import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { isAdmin } = await import("./_auth");
    const result = isAdmin(req);
    if (result.authenticated) {
      return res.json({ authenticated: true, email: result.email });
    }
    return res.json({ authenticated: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("auth-status error:", message, stack);
    return res.status(500).json({ error: "Internal error", message, stack });
  }
}
