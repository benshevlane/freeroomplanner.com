import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import {
  savePlanToCloud,
  intentToRoomType,
  type SharedPlanResult,
} from "@/lib/plan-share";
import AffiliateNextSteps from "./AffiliateNextSteps";
import type { RoomType } from "@/lib/affiliates";

// ---------------------------------------------------------------------------
// The Save & Share window.
//
// Phase 1: a short saving loader (the save is real work; the pause also
//          keeps the result from appearing jarringly fast).
// Phase 2: the shareable link, front and centre, with a copy button.
//
// A slot is reserved below the link for the "next steps" affiliate cards
// (country + room aware) that arrive in a later phase. Nothing in this
// dialog ever blocks the save — closing is always available.
// ---------------------------------------------------------------------------

interface SavePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Returns the full multi-room plan (editor.exportAllRooms()). */
  getPlanData: () => unknown;
  /** Current plan name (first room / floor plan name). */
  planName: string;
  /** Code of the shared plan this session was loaded from, if any. */
  existingCode: string | null;
  /** Called after a successful save so the page URL can reflect the code. */
  onSaved?: (result: SharedPlanResult) => void;
  /** Downloads the plan as a PNG image (same as Export > Image). */
  onDownloadImage?: () => void;
}

type Phase = "saving" | "done" | "error";

const PREPARE_BEAT_MS = 1800;

// Testing aid: ?country=US forces the country used to pick affiliate cards,
// so any country's Save window can be previewed from anywhere. Affects only
// which cards render — never what's stored.
function overrideCountry(detected: string | null): string | null {
  if (typeof window === "undefined") return detected;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("country");
    if (fromUrl) {
      sessionStorage.setItem("frp-test-country", fromUrl.toUpperCase());
      return fromUrl.toUpperCase();
    }
    const remembered = sessionStorage.getItem("frp-test-country");
    if (remembered) return remembered;
  } catch {
    /* ignore */
  }
  return detected;
}

export default function SavePlanDialog({
  open,
  onOpenChange,
  getPlanData,
  planName,
  existingCode,
  onSaved,
  onDownloadImage,
}: SavePlanDialogProps) {
  const [phase, setPhase] = useState<Phase>("saving");
  const [result, setResult] = useState<SharedPlanResult | null>(null);
  const [copied, setCopied] = useState(false);
  const runIdRef = useRef(0);
  const [linkReady, setLinkReady] = useState(false);

  const runSave = useCallback(async () => {
    const runId = ++runIdRef.current;
    setPhase("saving");
    setCopied(false);
    setLinkReady(false);
    try {
      const saved = await savePlanToCloud(getPlanData(), {
        name: planName,
        roomType: intentToRoomType(),
        existingCode,
      });
      if (runId !== runIdRef.current) return; // dialog was reopened meanwhile
      // Show the full window straight away — link, next-step options and all —
      // so the affiliate options are visible during the short "preparing" beat.
      setResult(saved);
      setPhase("done");
      onSaved?.(saved);
      trackEvent("plan_saved", { plan_code: saved.code, updated: saved.updated });

      // A brief beat before the link + download so the moment registers
      // (the plan is already stored; this is deliberate pacing, not a wait).
      await new Promise((r) => setTimeout(r, PREPARE_BEAT_MS));
      if (runId !== runIdRef.current) return;
      setLinkReady(true);

      // One Save always downloads the file too — every save, not just the
      // first — so the user reliably gets an up-to-date image each time.
      if (onDownloadImage) {
        try { onDownloadImage(); } catch { /* download is best-effort */ }
        trackEvent("plan_image_downloaded", { plan_code: saved.code });
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "plan_downloaded", roomType: intentToRoomType() }) }).catch(() => {});
      }
    } catch {
      if (runId !== runIdRef.current) return;
      setPhase("error");
    }
  }, [getPlanData, planName, existingCode, onSaved, onDownloadImage]);

  useEffect(() => {
    if (open) void runSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copyLink = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      trackEvent("plan_link_copied", { plan_code: result.code });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard unavailable — the link stays selectable in the input.
    }
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="save-plan-dialog">
        {phase === "saving" && (
          <div className="py-10 text-center" data-testid="save-plan-loading">
            <Loader2 className="h-10 w-10 mx-auto mb-4 animate-spin text-primary" />
            <DialogHeader>
              <DialogTitle className="text-center">Saving your plan…</DialogTitle>
              <DialogDescription className="text-center">
                Downloading your plan and creating a shareable link…
              </DialogDescription>
            </DialogHeader>
          </div>
        )}

        {phase === "done" && result && (
          <div data-testid="save-plan-done">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {linkReady ? <Check className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                </span>
                {!linkReady
                  ? "Saving your plan…"
                  : result.updated
                  ? "Your plan is updated"
                  : "Your plan is saved"}
              </DialogTitle>
              <DialogDescription>
                Your design is stored at this link — reopen or share it anytime,
                no account needed. Save again to update the same link.
              </DialogDescription>
            </DialogHeader>

            {!linkReady ? (
              <div
                className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                data-testid="save-plan-link-preparing"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing your shareable link…
              </div>
            ) : (
              <>
                <div className="mt-4 flex gap-2">
                  <Input
                    readOnly
                    value={result.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-medium min-w-0 flex-1"
                    data-testid="save-plan-link"
                  />
                  <Button onClick={copyLink} className="shrink-0" data-testid="save-plan-copy">
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" /> Copy link
                      </>
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Tip: send it to your partner, builder, or future self.
                </p>
              </>
            )}

            <AffiliateNextSteps
              country={overrideCountry(result.country)}
              roomType={intentToRoomType() as RoomType | null}
              planUrl={result.url}
              planCode={result.code}
            />

            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="save-plan-close">
                Done
              </Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div data-testid="save-plan-error">
            <DialogHeader>
              <DialogTitle>Couldn’t save your plan</DialogTitle>
              <DialogDescription>
                Something went wrong reaching the server. Your work is still
                auto-saved in this browser — you can try again, or use Save
                Room (JSON) from the toolbar as a backup.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => void runSave()}>
                <Link2 className="h-4 w-4 mr-1" /> Try again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
