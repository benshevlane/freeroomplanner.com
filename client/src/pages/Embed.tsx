import { useState, useEffect, useMemo, useCallback } from "react";
import { parseEmbedParams } from "../lib/embed-params";
import EditorCore from "../components/EditorCore";
import PoweredByBadge from "../components/PoweredByBadge";
import { trackEvent } from "@/lib/analytics";
import { trackEmbedEvent } from "@/lib/embed-analytics";
import FreeRoomPlannerLogo from "@/components/FreeRoomPlannerLogo";

export default function Embed() {
  const params = useMemo(
    () => parseEmbedParams(window.location.search),
    []
  );

  const [isDark, setIsDark] = useState(() => {
    if (params.dark === true) return true;
    if (params.dark === false) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Welcome screen state — show once per session
  const [started, setStarted] = useState(() => {
    if (!params.partner) return true; // skip if no partner
    return sessionStorage.getItem(`frp-embed-started-${params.partner}`) === "1";
  });
  const [welcomeFading, setWelcomeFading] = useState(false);

  const handleStart = useCallback(() => {
    setWelcomeFading(true);
    if (params.partner) {
      sessionStorage.setItem(`frp-embed-started-${params.partner}`, "1");
      trackEmbedEvent(params.partner, "embed_loaded");
    }
    // Signal parent page to expand iframe (homepage embed)
    try {
      window.parent.postMessage({ type: "frp-expand" }, "*");
    } catch {}
    setTimeout(() => setStarted(true), 400);
  }, [params.partner]);

  // Apply dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Track embed load (only when user has already started / returning visit)
  useEffect(() => {
    if (params.partner && started && !welcomeFading) {
      trackEvent("embed_loaded", {
        partner: params.partner,
        referrer: document.referrer,
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
            {/* Partner logo or default logo */}
            {params.logoUrl ? (
              <img
                src={params.logoUrl}
                alt=""
                style={{
                  maxHeight: 48,
                  maxWidth: 200,
                  objectFit: "contain",
                  margin: "0 auto 20px",
                  display: "block",
                }}
              />
            ) : (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <FreeRoomPlannerLogo size={48} className={isDark ? "text-[#5ba89a]" : "text-[#3d8a7c]"} />
              </div>
            )}

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

      {/* Optional branding strip */}
      {params.logoUrl && (
        <div
          className="flex items-center px-3 py-1 border-b border-border bg-card"
          style={params.brandColor ? { borderBottomColor: `var(--embed-brand-color)` } : undefined}
        >
          <img
            src={params.logoUrl}
            alt=""
            style={{
              maxHeight: "40px",
              maxWidth: "200px",
              objectFit: "contain",
            }}
          />
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
