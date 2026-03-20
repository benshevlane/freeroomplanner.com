import type { VercelRequest, VercelResponse } from "@vercel/node";
import { contactFormSchema } from "../shared/email-schemas";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return res.json({ ok: true, hasSchema: !!contactFormSchema });
}
