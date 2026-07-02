import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { getOffers, type RoomType } from "@/lib/affiliates";

// ---------------------------------------------------------------------------
// "Next steps" cards shown under the plan link in the Save window.
// Country + room aware, driven entirely by the affiliate lookup table.
// Renders nothing when there's no relevant partner — never a broken slot.
// Styling uses the site theme tokens (teal primary, General Sans) so it
// matches the rest of Free Room Planner; only a partner's own logo keeps
// its brand colour.
// ---------------------------------------------------------------------------

interface Props {
  country: string | null;
  roomType: RoomType | null;
  planUrl: string;
  planCode: string;
}

export default function AffiliateNextSteps({ country, roomType, planUrl, planCode }: Props) {
  const [copied, setCopied] = useState(false);
  const { products, trade } = getOffers(country, roomType, planCode);

  const copyMessage = useCallback(async () => {
    const roomWord =
      roomType === "kitchen" ? "kitchen" : roomType === "bathroom" ? "bathroom" : "room";
    const msg = `Hi — I'd like quotes for the ${roomWord} I've planned. Here's my exact floor plan: ${planUrl}`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      trackEvent("affiliate_message_copied", { partner: trade?.partner, plan_code: planCode });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable — the primary button still works */
    }
  }, [roomType, planUrl, planCode, trade]);

  if (products.length === 0 && !trade) return null;

  return (
    <div className="mt-5" data-testid="affiliate-next-steps">
      <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {trade ? "Get it built" : "Next steps"}
        <span className="h-px flex-1 bg-border" />
      </div>

      {products.map((o) => (
        <a
          key={o.partner}
          href={o.url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={() => trackEvent("affiliate_click", { partner: o.partner, role: "product", plan_code: planCode })}
          className="mb-2 flex items-center gap-3 rounded-xl border border-border p-3 no-underline transition hover:border-primary hover:bg-accent"
          data-testid="affiliate-product-card"
        >
          <div className="flex-1">
            <b className="block text-sm text-foreground">{o.headline}</b>
            <span className="text-xs text-muted-foreground">{o.blurb} · {o.partner}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-primary" />
        </a>
      ))}

      {trade && (
        <div
          className="rounded-xl border border-border bg-accent/50 p-4"
          data-testid="affiliate-trade-card"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-white text-sm font-extrabold tracking-tight text-[#e0301e]">
              {trade.partner}
            </div>
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] text-foreground">{trade.headline}</b>
              <span className="mt-0.5 block text-xs text-muted-foreground">{trade.blurb}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button asChild className="flex-1">
              <a
                href={trade.url}
                target="_blank"
                rel="sponsored noopener noreferrer"
                onClick={() => trackEvent("affiliate_click", { partner: trade.partner, role: "trade", plan_code: planCode })}
                data-testid="affiliate-trade-cta"
              >
                Get free quotes on {trade.partner}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={copyMessage}
              data-testid="affiliate-copy-message"
            >
              <ClipboardCheck className="mr-1 h-4 w-4" />
              {copied ? "Copied" : "Copy plan message"}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        {trade ? `${trade.partner} is a partner link` : "These are partner links"} — if you buy or book
        through {trade && products.length === 0 ? "it" : "them"} we may earn a commission, at no extra
        cost to you. It helps keep Free Room Planner free.
      </p>
    </div>
  );
}
