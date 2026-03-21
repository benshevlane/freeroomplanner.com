import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { z } from "zod";

const feedbackFormSchema = z.object({
  type: z.enum(["bug", "feature", "general", "praise"], {
    required_error: "Please select a feedback type",
  }),
  message: z.string().min(1, "Message is required").max(5000),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Email service not configured" });
    }

    const parsed = feedbackFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const { type, message, email } = parsed.data;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
      to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
      ...(email ? { replyTo: email } : {}),
      subject: `[Feedback - ${type}] New feedback from Free Room Planner`,
      html: `<p><strong>Type:</strong> ${type}</p>
${email ? `<p><strong>Email:</strong> ${email}</p>` : ""}
<hr/>
<p>${message.replace(/\n/g, "<br/>")}</p>`,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    return res.status(500).json({ error: msg });
  }
}
