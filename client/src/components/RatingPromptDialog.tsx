import { useEffect, useRef, useState } from "react";
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

// Public review page for the claimed freeroomplanner.com domain.
const REVIEW_URL = "https://uk.trustpilot.com/evaluate/freeroomplanner.com";
const REVIEW_SITE_NAME = "Trustpilot";

/**
 * The acknowledgement shown after someone taps a star, above the feedback box.
 * The empathy varies with the score — a frustrated person shouldn't get the
 * same chirpy line as someone who loved it.
 *
 * IMPORTANT: the *review invite* that follows is identical for every score.
 * Only inviting (or more warmly inviting) happy raters is "review gating",
 * which breaches Trustpilot's Guidelines for Businesses and, since April 2025,
 * the UK DMCC Act 2024 — the CMA lists "preventing some users from leaving
 * reviews" as a misleading practice. Vary the sympathy, never the ask.
 */
const ACKNOWLEDGEMENTS: Record<number, { title: string; body: string }> = {
  1: {
    title: "Really sorry — that's not the experience we wanted for you.",
    body: "Something's clearly gone wrong. If you've got thirty seconds, tell us what happened. It comes straight to me and I read every one.",
  },
  2: {
    title: "Sorry it's falling short.",
    body: "We'd rather know than not. What got in your way? Your note comes straight to the person building this.",
  },
  3: {
    title: "Thanks — sounds like there's room to improve.",
    body: "What would have made this better? The specific, annoying stuff is the most useful thing you can tell us.",
  },
  4: {
    title: "Thanks, that's good to hear.",
    body: "What's the one thing that would have made it a five? We're always chipping away at the rough edges.",
  },
  5: {
    title: "Brilliant — thank you.",
    body: "Anything we could still do better? And if not, no need to write anything.",
  },
};

interface RatingPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "rating" — full flow: stars, then the acknowledgement + feedback box, then
   *            the review invite.
   * "review" — the later re-ask: the review invite on its own.
   */
  mode?: "rating" | "review";
  /** Fired when the user opens the review site, so we stop asking. */
  onReviewOpened?: () => void;
}

type Stage = "rate" | "feedback" | "review" | "thanks";

export default function RatingPromptDialog({
  open,
  onOpenChange,
  mode = "rating",
  onReviewOpened,
}: RatingPromptDialogProps) {
  const [stage, setStage] = useState<Stage>(mode === "review" ? "review" : "rate");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Guards against sending more than one feedback email per rating flow. The
  // score used to be emailed the instant a star was tapped AND again when the
  // feedback box was submitted, so anyone who left a comment generated two
  // emails (and two saved rows) for the same rating. We now record the rating
  // exactly once — at the end of the flow, or when the dialog is dismissed.
  const emailedRef = useRef(false);

  /**
   * Send the rating to the inbox / feedback table exactly once. Called when the
   * user finishes (with their comment, if any) or dismisses the dialog after
   * choosing a score (so an abandoned rating is still captured). No-op if a
   * score hasn't been chosen yet, or if this flow has already been recorded.
   */
  const recordRating = (includeFeedback: boolean) => {
    if (emailedRef.current || rating <= 0) return;
    emailedRef.current = true;
    const note = feedback.trim();
    const message =
      includeFeedback && note
        ? `In-app rating: ${rating}/5\n\n${note}`
        : `In-app rating: ${rating}/5`;
    apiRequest("POST", "/api/feedback", {
      type: rating >= 4 ? "praise" : "general",
      message,
      rating,
      page: window.location.pathname,
    }).catch(() => {});
  };

  // The re-ask opens straight at the review invite.
  useEffect(() => {
    if (open) {
      setStage(mode === "review" ? "review" : "rate");
      emailedRef.current = false; // fresh flow — allow one email again
      if (mode === "review") trackEvent("review_prompt_shown", { reask: true });
    }
  }, [open, mode]);

  const close = (o: boolean) => {
    // Safety net: if they picked a score but dismissed without pressing
    // Skip/Send, still record it once (recordRating no-ops for score 0 or if
    // it's already been sent, so this never produces a duplicate).
    if (!o) recordRating(false);
    onOpenChange(o);
    if (!o) {
      setTimeout(() => {
        setStage(mode === "review" ? "review" : "rate");
        setRating(0);
        setHovered(0);
        setFeedback("");
        emailedRef.current = false;
      }, 300);
    }
  };

  const handleStarClick = (n: number) => {
    setRating(n);
    trackEvent("rating_submitted", { rating: n });
    // Don't record yet — the score is sent once at the end of the flow (or on
    // dismiss). This also means changing your mind between stars no longer
    // fires an email per tap.
    setStage("feedback");
  };

  const handleFeedbackSubmit = () => {
    setSubmitting(true);
    // Single recording of the rating for this flow, including the comment if
    // one was written. Fire-and-forget so the user is never blocked.
    recordRating(true);

    // Everyone is invited to review, whatever they scored.
    if (REVIEW_URL) {
      setStage("review");
      trackEvent("review_prompt_shown", { reask: false, rating });
    } else {
      setStage("thanks");
    }
  };

  const handleReviewClick = () => {
    trackEvent("review_link_clicked", { mode, rating });
    onReviewOpened?.();
    window.open(REVIEW_URL, "_blank", "noopener,noreferrer");
    setStage("thanks");
  };

  const handleReviewDecline = () => {
    trackEvent("review_prompt_declined", { mode, rating });
    if (mode === "review") close(false);
    else setStage("thanks");
  };

  const ack = ACKNOWLEDGEMENTS[rating] ?? ACKNOWLEDGEMENTS[3];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm" data-testid="rating-prompt">
        {stage === "rate" && (
          <>
            <DialogHeader>
              <DialogTitle>How are you finding Free Room Planner?</DialogTitle>
              <DialogDescription>Tap a star to rate it — it takes two seconds.</DialogDescription>
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
              <DialogTitle data-testid="rating-ack-title">{ack.title}</DialogTitle>
              <DialogDescription>{ack.body}</DialogDescription>
            </DialogHeader>
            <Textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={
                rating <= 2
                  ? "What went wrong?"
                  : rating === 5
                    ? "Anything we could still improve? (optional)"
                    : "What was annoying, missing or confusing?"
              }
              rows={4}
              maxLength={5000}
              data-testid="rating-feedback-input"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleFeedbackSubmit} disabled={submitting}>
                Skip
              </Button>
              <Button
                size="sm"
                onClick={handleFeedbackSubmit}
                disabled={submitting}
                data-testid="rating-feedback-send"
              >
                {submitting ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </>
        )}

        {/* Identical for every score — the empathy varies above, the ask never does. */}
        {stage === "review" && (
          <>
            <DialogHeader>
              <DialogTitle>Could you review us?</DialogTitle>
              <DialogDescription>
                Free Room Planner is free to use, and honest reviews on {REVIEW_SITE_NAME} help
                other people find it. Would you share your experience — whatever it is?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReviewDecline}
                data-testid="rating-review-decline"
              >
                No thanks
              </Button>
              <Button size="sm" onClick={handleReviewClick} data-testid="rating-review-link">
                Write a {REVIEW_SITE_NAME} review
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
              <Button size="sm" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
