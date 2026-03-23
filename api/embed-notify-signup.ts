import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { z } from "zod";

const embedSignupSchema = z.object({
  partnerId: z.string().min(1, "Partner ID is required"),
  businessName: z.string().min(1, "Business name is required"),
  email: z.string().email("Please enter a valid email address"),
  websiteUrl: z.string().optional(),
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

    const parsed = embedSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const { partnerId, businessName, email, websiteUrl } = parsed.data;
    const timestamp = new Date().toISOString();

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>",
      to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
      replyTo: email,
      subject: `[New Embed Partner] ${businessName}`,
      html: `<h2>New Embed Partner Signup</h2>
<p><strong>Business Name:</strong> ${businessName}</p>
<p><strong>Partner ID:</strong> ${partnerId}</p>
<p><strong>Email:</strong> ${email}</p>
${websiteUrl ? `<p><strong>Website URL:</strong> ${websiteUrl}</p>` : ""}
<p><strong>Signup Timestamp:</strong> ${timestamp}</p>`,
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
