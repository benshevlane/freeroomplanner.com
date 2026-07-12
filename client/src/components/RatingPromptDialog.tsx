import { useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";

// Where 5-star raters are invited to leave a public review.
// Free Trustpilot review page for the claimed freeroomplanner.com domain.
const REVIEW_URL = "https://uk.trustpilot.com/evaluate/freeroomplanner.com";
const REVIEW_SITE_NAME = "Trustpilot";

interface RatingPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "rate" | "feedback" | "review" | "thanks";

export default function RatingPromptDialog({ open, onOpenChange }: RatingPromptDialogProps) {
  const [stage, setStage] = useState<Stage>("rate");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      // Reset for the (unlikely) next open
      setTimeout(() => { setStage("rate"); setRating(0); setHovered(0); setFeedback(""); }, 300);
    }
  };

  const handleStarClick = (n: number) => {
    setRating(n);
    trackEvent("rating_submitted", { rating: n });
    if (n === 5) {
      // Record the 5-star straight away. Previously this only happened if the
      // rater went on to click through to the review site, so anyone who tapped
      // 5 stars and then "No thanks" was never counted — which quietly skewed
      // the feedback inbox towards unhappy ratings only.
      apiRequest("POST", "/api/feedback", {
        type: "praise",
        message: "In-app rating: 5/5",
        rating: 5,
        page: window.location.pathname,
      }).catch(() => {});

      if (REVIEW_URL) {
        setStage("review");
        trackEvent("review_prompt_shown");
      } else {
        setStage("thanks");
      }
    } else {
      setStage("feedback");
    }
  };

  const handleFeedbackSubmit = async () => {
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/feedback", {
        type: "general",
        message: `In-app rating: ${rating}/5${feedback.trim() ? `\n\n${feedback.trim()}` : ""}`,
        rating,
        page: window.location.pathname,
      });
    } catch {
      /* never block the user on feedback delivery */
    }
    setSubmitting(false);
    setStage("thanks");
  };

  const handleReviewClick = () => {
    // The 5/5 was already recorded on the star click, so don't post it twice.
    trackEvent("review_link_clicked");
    window.open(REVIEW_URL, "_blank", "noopener,noreferrer");
    setStage("thanks");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm" data-testid="rating-prompt">
        {stage === "rate" && (
          <>
            <DialogHeader>
              <DialogTitle>Are you enjoying Free Room Planner?</DialogTitle>
              <DialogDescription>Tap a star to rate us — it takes two seconds.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center gap-2 py-4" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onMouseEnter={() => setHovered(n)}
                  onClick={() => handleStarClick(n)}
                  className="p-1 transition-transform hover:scale-110"
                  data-testid={`rating-star-${n}`}
                >
                  <Star
                    className={`h-8 w-8 ${
                      n <= (hovered || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground mx-auto"
              onClick={() => close(false)}
            >
              Maybe later
            </button>
          </>
        )}

        {stage === "feedback" && (
          <>
            <DialogHeader>
              <DialogTitle>Thanks — what could we do better?</DialogTitle>
              <DialogDescription>
                Your feedback goes straight to the person building this.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What was annoying, missing, or confusing?"
              rows={4}
              maxLength={5000}
              data-testid="rating-feedback-input"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => handleFeedbackSubmit()} disabled={submitting}>
                Skip
              </Button>
              <Button size="sm" onClick={() => handleFeedbackSubmit()} disabled={submitting} data-testid="rating-feedback-send">
                {submitting ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </>
        )}

        {stage === "review" && (
          <>
            <DialogHeader>
              <DialogTitle>Brilliant — thanks!</DialogTitle>
              <DialogDescription>
                Would you mind sharing that in a quick {REVIEW_SITE_NAME} review? It genuinely
                helps other people find the planner.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => close(false)}>
                No thanks
              </Button>
              <Button size="sm" onClick={handleReviewClick} data-testid="rating-review-link">
                Leave a {REVIEW_SITE_NAME} review
              </Button>
            </div>
          </>
        )}

        {stage === "thanks" && (
          <>
            <DialogHeader>
              <DialogTitle>Thank you!</DialogTitle>
              <DialogDescription>We read every bit of feedback. Happy planning!</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => close(false)}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
