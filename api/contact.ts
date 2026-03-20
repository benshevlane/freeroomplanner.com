import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { contactFormSchema } from "../shared/email-schemas";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: "Email service not configured" });
  }

  const parsed = contactFormSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { name, email, subject, message } = parsed.data;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Free Room Planner <onboarding@resend.dev>",
      to: process.env.CONTACT_EMAIL || "delivered@resend.dev",
      replyTo: email,
      subject: `[Contact] ${subject}`,
      html: `<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Subject:</strong> ${subject}</p>
<hr/>
<p>${message.replace(/\n/g, "<br/>")}</p>`,
    });
    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    return res.status(500).json({ error: msg });
  }
}
