import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { z } from "zod";

const embedSignupSchema = z.object({
  partnerId: z.string().min(1, "Partner ID is required"),
  contactName: z.string().min(1, "Name is required").max(200),
  businessName: z.string().min(1, "Business name is required").max(200),
  email: z.string().email("Please enter a valid email address"),
  websiteUrl: z.string().max(500).optional(),
  embedCode: z.string().min(1).max(50000),
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

    const { partnerId, contactName, businessName, email, websiteUrl, embedCode } = parsed.data;
    const fromAddr = process.env.EMAIL_FROM || "Free Room Planner <noreply@send.freeroomplanner.com>";
    const resend = new Resend(apiKey);

    // 1. Owner notification
    try {
      await resend.emails.send({
        from: fromAddr,
        to: process.env.CONTACT_EMAIL || "ben@freeroomplanner.com",
        replyTo: email,
        subject: `[New Embed Partner] ${businessName}`,
        html: `<h2>New Embed Partner Signup</h2>
<p>A new partner signed up and got their embed code.</p>
<p><strong>Name:</strong> ${contactName}</p>
<p><strong>Business:</strong> ${businessName}</p>
<p><strong>Partner ID:</strong> ${partnerId}</p>
<p><strong>Email:</strong> ${email}</p>
${websiteUrl ? `<p><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>` : ""}
<p><strong>Time:</strong> ${new Date().toUTCString()}</p>`,
      });
    } catch (err) {
      console.error("Failed to send owner notification:", err instanceof Error ? err.message : err);
    }

    // 2. User confirmation with embed code
    try {
      const escapedCode = embedCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await resend.emails.send({
        from: fromAddr,
        to: email,
        subject: "Your Free Room Planner Embed Code",
        html: `<h2>Your Embed Code is Ready!</h2>
<p>Hi ${contactName},</p>
<p>Thanks for choosing Free Room Planner! Below is your embed code for <strong>${businessName}</strong>.</p>
<h3>Your Embed Code</h3>
<p>Copy and paste this into your website's HTML where you'd like the room planner to appear:</p>
<pre style="background:#f4f4f4;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.4;"><code>${escapedCode}</code></pre>
<h3>How to Add It</h3>
<ul>
  <li><strong>WordPress:</strong> Add a "Custom HTML" block and paste the code</li>
  <li><strong>Squarespace:</strong> Add a "Code" block and paste the code</li>
  <li><strong>Wix:</strong> Add an "Embed HTML" element and paste the code</li>
  <li><strong>Other:</strong> Paste into your page's HTML source where you want the planner</li>
</ul>
<p>If you have any questions, just reply to this email.</p>
<p>— The Free Room Planner Team<br/>
<a href="https://freeroomplanner.com">freeroomplanner.com</a></p>`,
      });
    } catch (err) {
      console.error("Failed to send user confirmation:", err instanceof Error ? err.message : err);
    }

    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    return res.status(500).json({ error: msg });
  }
}
