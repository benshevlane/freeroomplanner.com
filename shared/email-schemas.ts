import { z } from "zod";

export const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Please enter a valid email address"),
  subject: z.string().min(1, "Subject is required").max(300),
  message: z.string().min(1, "Message is required").max(5000),
});

export const feedbackFormSchema = z.object({
  type: z.enum(["bug", "feature", "general", "praise"], {
    required_error: "Please select a feedback type",
  }),
  message: z.string().min(1, "Message is required").max(5000),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
});

export const embedSignupNotificationSchema = z.object({
  partnerId: z.string().min(1).max(64),
  businessName: z.string().min(1).max(200),
  email: z.string().email(),
  websiteUrl: z.string().max(500).optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;
export type FeedbackFormData = z.infer<typeof feedbackFormSchema>;
export type EmbedSignupNotification = z.infer<typeof embedSignupNotificationSchema>;
