import { useState, useEffect, useMemo, useCallback } from "react";
import { parseEmbedParams } from "../lib/embed-params";
import EditorCore from "../components/EditorCore";
import PoweredByBadge from "../components/PoweredByBadge";
import { safeSessionGetItem, safeSessionSetItem } from "../lib/safe-storage";
import { trackEvent } from "@/lib/analytics";
import { trackEmbedEvent } from "@/lib/embed-analytics";
import { safeMatchMediaMatches } from "../lib/safe-match-media";
import FreeRoomPlannerLogo from "@/components/FreeRoomPlannerLogo";

export default function Embed() {
  const params = useMemo(
    () => parseEmbedParams(window.location.search),
    []
  );

  const [isDark, setIsDark] = useState(() => {
    if (params.dark === true) return true;
    if (params.dark === false) return false;
    return safeMatchMediaMatches("(prefers-color-scheme: dark)");
  });

  // Welcome screen state — show once per session; skip on direct navigation
  const [started, setStarted] = useState(() => {
    if (!params.partner) return true; // skip if no partner
    if (!params.embed) return true; // skip welcome on direct navigation
    if (params.type === "homepage") return true; // skip welcome for homepage embeds — the card CTA already serves as the intro
    return safeSessionGetItem(`frp-embed-started-${params.partner}`) === "1";
  });
  const [welcomeFading, setWelcomeFading] = useState(false);

  const handleStart = useCallback(() => {
    setWelcomeFading(true);
    if (params.partner) {
      safeSessionSetItem(`frp-embed-started-${params.partner}`, "1");
      trackEmbedEvent(params.partner, "embed_loaded");
    }
    // Signal parent page to expand iframe (homepage embed only)
    if (params.type === "homepage" || params.type === null) {
      try {
        window.parent.postMessage({ type: "frp-expand" }, "*");
      } catch {}
    }
    setTimeout(() => setStarted(true), 400);
  }, [params.partner]);

  // Apply dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Remove favicon links so the embed iframe doesn't override the host page's favicon
  useEffect(() => {
    const selectors =
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="manifest"]';
    const links = Array.from(document.head.querySelectorAll(selectors));
    links.forEach((link) => link.remove());
    return () => {
      links.forEach((link) => document.head.appendChild(link));
    };
  }, []);

  // Track embed load (only when user has already started / returning visit)
  useEffect(() => {
    if (params.partner && started && !welcomeFading) {
      trackEvent("embed_loaded", {
        partner: params.partner,
        referrer: document.referrer,
        ...(params.source ? { source: params.source } : {}),
        ...(params.type ? { type: params.type } : {}),
      });
    }
  }, [params.partner, started, welcomeFading]);

  // Error state: no valid partner
  if (!params.partner) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#666",
          fontSize: "16px",
          padding: "20px",
          textAlign: "center",
        }}
      >
        Embed configuration error: a valid partner ID is required.
      </div>
    );
  }

  const brandColor = params.brandColor ? `#${params.brandColor}` : "#3d8a7c";

  const rootStyle: React.CSSProperties = {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    ...(params.brandColor
      ? ({ "--embed-brand-color": `#${params.brandColor}` } as React.CSSProperties)
      : {}),
  };

  return (
    <div className="bg-background" style={rootStyle} data-testid="embed-page">
      {/* Welcome overlay — editor mounts behind it */}
      {!started && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isDark
              ? "rgba(26, 26, 24, 0.92)"
              : "rgba(250, 248, 244, 0.92)",
            backdropFilter: "blur(6px)",
            transition: "opacity 0.4s ease",
            opacity: welcomeFading ? 0 : 1,
            pointerEvents: welcomeFading ? "none" : "auto",
          }}
        >
          <div
            style={{
              textAlign: "center",
              maxWidth: 400,
              padding: "32px 24px",
              fontFamily: "'General Sans', 'DM Sans', system-ui, sans-serif",
            }}
          >
            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <FreeRoomPlannerLogo size={48} className={isDark ? "text-[#5ba89a]" : "text-[#3d8a7c]"} />
            </div>

            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                margin: "0 0 8px",
                color: isDark ? "#f0ede6" : "#1a1a18",
                lineHeight: 1.2,
              }}
            >
              Plan your room layout
            </h1>
            <p
              style={{
                fontSize: 15,
                color: isDark ? "#a09a8c" : "#6b6457",
                margin: "0 0 24px",
                lineHeight: 1.5,
              }}
            >
              Draw walls, drag furniture, and design your space — right here in your browser.
            </p>

            <button
              onClick={handleStart}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 32px",
                fontSize: 16,
                fontWeight: 600,
                color: "#fff",
                background: brandColor,
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "filter 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.9)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
            >
              Start planning
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>

            <p
              style={{
                fontSize: 12,
                color: isDark ? "#6b6457" : "#a09a8c",
                marginTop: 16,
              }}
            >
              Free to use. Powered by freeroomplanner.com
            </p>
          </div>
        </div>
      )}

      <EditorCore
        storageKey="freeroomplanner-embed-autosave"
        units={params.units}
        hideToolbar={params.hideToolbar}
        isDark={isDark}
        onExport={() => trackEmbedEvent(params.partner!, "plan_exported")}
      />

      <PoweredByBadge partnerId={params.partner} />
    </div>
  );
}
