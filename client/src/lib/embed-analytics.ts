import { supabase } from "./supabase";

export async function trackEmbedEvent(
  partnerId: string,
  eventType: "embed_loaded" | "plan_exported" | "badge_clicked",
): Promise<void> {
  if (!supabase) return;
  try {
    const referrer = (document.referrer || "").slice(0, 500);
    await supabase.from("embed_events").insert({
      partner_id: partnerId,
      event_type: eventType,
      referrer: referrer || null,
    });
  } catch (err) {
    // Tracking must never break the tool
    console.warn("embed tracking error:", err);
  }
}
