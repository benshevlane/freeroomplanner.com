import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import FreeRoomPlannerLogo from "@/components/FreeRoomPlannerLogo";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface FormState {
  businessName: string;
  email: string;
  websiteUrl: string;
  brandColor: string;
  units: "m" | "ft";
  embedType: "fullpage" | "homepage" | "homepage-link";
  plannerPageUrl: string;
}

const DEFAULT_BRAND_COLOR = "#6bbfa0";

// Logo URL for embed snippets — uses the actual website logo
const LOGO_URL = "https://freeroomplanner.com/logo.png";

const INITIAL_FORM: FormState = {
  businessName: "",
  email: "",
  websiteUrl: "",
  brandColor: DEFAULT_BRAND_COLOR,
  units: "m",
  embedType: "fullpage",
  plannerPageUrl: "",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function generatePartnerId(businessName: string): string {
  const slug = businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "partner";
}

function buildEmbedSrc(partnerId: string, form: FormState, typeOverride?: string): string {
  const params = new URLSearchParams();
  params.set("partner", partnerId);
  if (form.brandColor !== DEFAULT_BRAND_COLOR) {
    params.set("brand_color", form.brandColor.replace("#", ""));
  }
  if (form.units === "ft") {
    params.set("units", "ft");
  }
  params.set("embed", "true");
  params.set("source", "embed");
  const embedType = typeOverride || form.embedType;
  if (embedType === "fullpage" || embedType === "homepage" || embedType === "homepage-link") {
    params.set("type", embedType === "homepage-link" ? "link" : embedType);
  }
  return `https://freeroomplanner.com/embed?${params.toString()}`;
}

function buildHomepageLinkSnippet(form: FormState): string {
  const brandColor = form.brandColor || DEFAULT_BRAND_COLOR;
  const plannerUrl = form.plannerPageUrl.trim() || "https://freeroomplanner.com/embed";
  return `<!-- Free Room Planner — Homepage Link -->
<!-- Free to use. Powered by freeroomplanner.com -->
<div style="max-width: 560px; margin: 0 auto; font-family: 'DM Sans', system-ui, -apple-system, sans-serif; box-sizing: border-box;">
  <div style="border: 1px solid #e8e3d8; border-radius: 12px; padding: 20px 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: #fff;">
    <img
      src="${LOGO_URL}"
      alt="Free Room Planner"
      width="40"
      height="40"
      style="flex-shrink: 0; border-radius: 6px;"
    />
    <div style="flex: 1; min-width: 160px;">
      <div style="font-size: 16px; font-weight: 700; color: #1a1a18; margin: 0 0 2px; line-height: 1.3;">Plan your room layout</div>
      <div style="font-size: 13px; color: #6b6457; line-height: 1.4; margin: 0;">Design your space with our free drag-and-drop room planner.</div>
    </div>
    <a
      href="${plannerUrl}"
      style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; font-size: 14px; font-weight: 600; color: #fff; background: ${brandColor}; border-radius: 10px; text-decoration: none; white-space: nowrap; flex-shrink: 0; font-family: inherit;"
    >Start planning &#x2192;</a>
  </div>
  <div style="text-align: center; margin-top: 6px; font-size: 11px; color: #a09a8c;">
    Powered by <a href="https://freeroomplanner.com" style="color: #a09a8c; text-decoration: underline;" target="_blank" rel="noopener">freeroomplanner.com</a>
  </div>
</div>`;
}

function buildFullPageSnippet(partnerId: string, form: FormState): string {
  const src = buildEmbedSrc(partnerId, form, "fullpage");
  return `<!-- Free Room Planner Embed — Full Page -->
<!-- Free to use. Powered by freeroomplanner.com -->
<div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; margin: 0; padding: 0; overflow: hidden;">
  <iframe
    src="${src}"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: block;"
    title="Free Room Planner"
    loading="lazy"
    allow="clipboard-write"
  ></iframe>
</div>
<script>document.body.style.overflow='hidden';</script>`;
}

function buildHomepageEmbedSnippet(partnerId: string, form: FormState): string {
  const src = buildEmbedSrc(partnerId, form, "homepage");
  const brandColor = form.brandColor || DEFAULT_BRAND_COLOR;
  return `<!-- Free Room Planner – Homepage Embed -->
<div id="frp-embed-root" style="width:100%;font-family:inherit;"></div>
<script>
(function() {
  var BRAND   = '${brandColor}';
  var SRC     = '${src}';

  var root    = document.getElementById('frp-embed-root');
  var wrapEl  = null;

  // ── Styles ──────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#frp-embed-root *{box-sizing:border-box;margin:0;padding:0;}',
    '#frp-card{width:100%;border:1px solid #e2ddd5;border-radius:12px;background:#fff;overflow:hidden;',
      'box-shadow:0 2px 8px rgba(0,0,0,.05);transition:box-shadow .3s;}',
    '#frp-card.open{box-shadow:0 8px 32px rgba(0,0,0,.10);}',
    '#frp-header{display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px 24px;',
      'transition:padding .3s;}',
    '#frp-card.open #frp-header{flex-direction:row;padding:14px 20px;border-bottom:1px solid #ede9e3;}',
    '#frp-logo{width:56px;height:56px;flex-shrink:0;}',
    '#frp-card.open #frp-logo{display:none;}',
    '#frp-title{font-size:18px;font-weight:600;color:#1a1a1a;letter-spacing:-.01em;text-align:center;}',
    '#frp-card.open #frp-title{font-size:15px;text-align:left;}',
    '#frp-desc{margin-top:6px;font-size:14px;color:#6b6b6b;line-height:1.5;text-align:center;}',
    '#frp-card.open #frp-desc{display:none;}',
    '#frp-cta{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;',
      'background:' + BRAND + ';color:#fff;border:none;border-radius:8px;font-size:15px;',
      'font-weight:600;cursor:pointer;letter-spacing:-.01em;transition:opacity .2s;}',
    '#frp-cta:hover{opacity:.88;}',
    '#frp-collapse{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;',
      'background:transparent;color:#6b6b6b;border:1px solid #ddd;border-radius:6px;',
      'font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .2s,color .2s;}',
    '#frp-collapse:hover{background:#f5f5f5;color:#333;}',
    '#frp-attr{font-size:12px;color:#aaa;}',
    '#frp-attr a{color:' + BRAND + ';text-decoration:none;}',
    '#frp-iframe-wrap{position:relative;width:100%;height:min(720px,80vh);}',
    '#frp-spinner-wrap{position:absolute;inset:0;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;gap:12px;background:#f9f7f4;',
      'color:#999;font-size:14px;}',
    '@keyframes frp-spin{to{transform:rotate(360deg)}}',
    '#frp-spinner{width:36px;height:36px;border:3px solid #e0e0e0;',
      'border-top-color:' + BRAND + ';border-radius:50%;animation:frp-spin .8s linear infinite;}',
    '#frp-iframe{width:100%;height:100%;border:none;display:block;opacity:0;transition:opacity .3s;}',
    '#frp-iframe.loaded{opacity:1;}',
  ].join('');
  document.head.appendChild(style);

  // ── Build collapsed card ─────────────────────────────────────
  var card = document.createElement('div');
  card.id = 'frp-card';
  card.innerHTML =
    '<div id="frp-header">' +
      '<img id="frp-logo" src="${LOGO_URL}" alt="Free Room Planner" width="56" height="56" style="border-radius:8px;">' +
      '<div id="frp-text" style="flex:1">' +
        '<p id="frp-title">Plan your room layout</p>' +
        '<p id="frp-desc">Design your space with our free drag-and-drop room planner.</p>' +
      '</div>' +
      '<button id="frp-cta">Start planning &#8594;</button>' +
      '<p id="frp-attr">Powered by <a href="https://freeroomplanner.com" target="_blank" rel="noopener">freeroomplanner.com</a></p>' +
    '</div>';
  root.appendChild(card);

  // ── Expand ───────────────────────────────────────────────────
  function expand() {
    card.classList.add('open');

    // Swap CTA for collapse button
    var header = card.querySelector('#frp-header');
    var cta = header.querySelector('#frp-cta');
    var attr = header.querySelector('#frp-attr');
    if (cta) cta.remove();
    if (attr) attr.remove();
    var collapseBtn = document.createElement('button');
    collapseBtn.id = 'frp-collapse';
    collapseBtn.innerHTML = '&#8593; Collapse planner';
    collapseBtn.addEventListener('click', collapse);
    header.appendChild(collapseBtn);

    // Spinner + iframe (create via DOM to avoid HTML-entity issues with & in URL)
    wrapEl = document.createElement('div');
    wrapEl.id = 'frp-iframe-wrap';

    var spinnerWrap = document.createElement('div');
    spinnerWrap.id = 'frp-spinner-wrap';
    spinnerWrap.innerHTML = '<div id="frp-spinner"></div>Loading planner\\u2026';
    wrapEl.appendChild(spinnerWrap);

    var iframe = document.createElement('iframe');
    iframe.id = 'frp-iframe';
    iframe.src = SRC;
    iframe.title = 'Free Room Planner';
    iframe.allow = 'fullscreen';
    iframe.addEventListener('load', function() {
      iframe.classList.add('loaded');
      if (spinnerWrap.parentNode) spinnerWrap.remove();
    });
    wrapEl.appendChild(iframe);

    card.appendChild(wrapEl);

    setTimeout(function() {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // ── Collapse ─────────────────────────────────────────────────
  function collapse() {
    card.classList.remove('open');

    // Remove iframe
    if (wrapEl) { wrapEl.remove(); wrapEl = null; }

    // Restore CTA + attribution
    var header = card.querySelector('#frp-header');
    var collapseBtn = header.querySelector('#frp-collapse');
    if (collapseBtn) collapseBtn.remove();

    var ctaBtn = document.createElement('button');
    ctaBtn.id = 'frp-cta';
    ctaBtn.innerHTML = 'Start planning &#8594;';
    ctaBtn.addEventListener('click', expand);
    header.appendChild(ctaBtn);

    var attr = document.createElement('p');
    attr.id = 'frp-attr';
    attr.innerHTML = 'Powered by <a href="https://freeroomplanner.com" target="_blank" rel="noopener">freeroomplanner.com</a>';
    header.appendChild(attr);

    setTimeout(function() {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  // ── Initial bind ─────────────────────────────────────────────
  card.querySelector('#frp-cta').addEventListener('click', expand);
})();
<\/script>`;
}

function buildFullPageSnippetForLink(partnerId: string, form: FormState): string {
  return buildFullPageSnippet(partnerId, { ...form, embedType: "fullpage" });
}

function buildSnippet(partnerId: string, form: FormState): string {
  if (form.embedType === "homepage-link") {
    return buildHomepageLinkSnippet(form);
  }
  if (form.embedType === "homepage") {
    return buildHomepageEmbedSnippet(partnerId, form);
  }
  return buildFullPageSnippet(partnerId, form);
}

function buildPreviewSrc(partnerId: string, form: FormState): string {
  const params = new URLSearchParams();
  params.set("partner", partnerId);
  if (form.brandColor !== DEFAULT_BRAND_COLOR) {
    params.set("brand_color", form.brandColor.replace("#", ""));
  }
  if (form.units === "ft") {
    params.set("units", "ft");
  }
  params.set("embed", "true");
  params.set("source", "embed");
  if (form.embedType === "fullpage" || form.embedType === "homepage") {
    params.set("type", form.embedType);
  }
  return `/embed?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function GetEmbed() {
  useDocumentMeta({
    title: "Add a Free Room Planner to Your Website | Free Room Planner",
    description:
      "Give your customers a free drag-and-drop room planner. One line of code, no sign-up required.",
  });

  const [, navigate] = useLocation();
  const [isDark, setIsDark] = useState(false);
  const [stage, setStage] = useState<"form" | "result">("form");

  // Form state
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Result state
  const [partnerId, setPartnerId] = useState("");
  const [resultName, setResultName] = useState("");

  // Copy state
  const [copied, setCopied] = useState(false);
  const [copiedPlanner, setCopiedPlanner] = useState(false);

  // Preview loading state
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [platformTab, setPlatformTab] = useState<"wordpress" | "squarespace" | "wix" | "html">("wordpress");

  // Dark mode
  useEffect(() => {
    setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Scroll to top on initial mount (fixes mobile opening scrolled down)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Scroll to top on stage change (skip initial mount)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stage]);

  /* ---- Form field updater ---- */
  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  /* ---- Submit handler ---- */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      // Validate
      const newErrors: Partial<Record<keyof FormState, string>> = {};
      if (!form.businessName.trim()) newErrors.businessName = "Business name is required.";
      if (!form.email.trim()) {
        newErrors.email = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        newErrors.email = "Please enter a valid email address.";
      }
      if (!form.websiteUrl.trim()) {
        newErrors.websiteUrl = "Website URL is required.";
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setSubmitting(true);
      const baseSlug = generatePartnerId(form.businessName);
      let finalId = baseSlug;

      if (supabase) {
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            const candidateId =
              attempt === 0
                ? baseSlug
                : `${baseSlug}-${String(Math.floor(1000 + Math.random() * 9000))}`;

            const { data: existing, error: selectErr } = await supabase
              .from("partners")
              .select("id")
              .eq("partner_id", candidateId)
              .maybeSingle();

            if (selectErr) {
              console.warn("Supabase select error:", selectErr.message);
              finalId = candidateId;
              break;
            }

            if (!existing) {
              // No collision — write
              const brandChanged = form.brandColor !== DEFAULT_BRAND_COLOR;
              const { error: insertErr } = await supabase.from("partners").insert({
                partner_id: candidateId,
                business_name: form.businessName.trim(),
                email: form.email.trim(),
                website_url: form.websiteUrl.trim() || null,
                brand_color: brandChanged ? form.brandColor.replace("#", "") : null,
                units: form.units,
              });

              if (insertErr) {
                console.warn("Supabase insert error:", insertErr.message);
                setSubmitError("Something went wrong — please try again.");
              }
              finalId = candidateId;
              break;
            }
            // Collision — try next attempt
            finalId = candidateId;
          }
        } catch (err) {
          console.warn("Supabase error:", err);
          setSubmitError("Something went wrong — please try again.");
        }
      }

      // Notify admin of new partner signup (fire-and-forget)
      fetch("/api/embed-notify-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: finalId,
          businessName: form.businessName.trim(),
          email: form.email.trim(),
          websiteUrl: form.websiteUrl.trim() || undefined,
        }),
      }).catch(() => {});

      // Always proceed to Stage 2
      setPartnerId(finalId);
      setResultName(form.businessName.trim());
      setSubmitting(false);
      setStage("result");
    },
    [form],
  );

  /* ---- Copy handler ---- */
  const handleCopy = useCallback(async () => {
    const snippet = buildSnippet(partnerId, form);
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = snippet;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [partnerId, form]);

  /* ---- Copy handler for planner snippet (homepage-link step 2) ---- */
  const handleCopyPlanner = useCallback(async () => {
    const snippet = buildFullPageSnippetForLink(partnerId, form);
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = snippet;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedPlanner(true);
    setTimeout(() => setCopiedPlanner(false), 2000);
  }, [partnerId, form]);

  /* ---- Start over handler ---- */
  const handleStartOver = useCallback(() => {
    setStage("form");
    setForm(INITIAL_FORM);
    setErrors({});
    setSubmitError(null);
    setPartnerId("");
    setResultName("");
    setCopied(false);
    setCopiedPlanner(false);
    setPreviewLoaded(false);
    setShowPreview(true);
    setPlatformTab("wordpress");
  }, []);

  /* ---- Shared styles ---- */
  const bg = isDark ? "bg-[#1a1a18]" : "bg-[#faf8f4]";
  const text = isDark ? "text-[#f0ede6]" : "text-[#1a1a18]";
  const muted = isDark ? "text-[#a09a8c]" : "text-[#6b6457]";
  const cardBg = isDark ? "bg-[#222220]" : "bg-white";
  const border = isDark ? "border-[#2e2e2a]" : "border-[#e8e3d8]";
  const teal = isDark ? "text-[#5ba89a]" : "text-[#3d8a7c]";
  const pillBg = isDark ? "bg-[#2e2e2a] text-[#5ba89a]" : "bg-[#e8f4f1] text-[#3d8a7c]";
  const inputBg = isDark
    ? "bg-[#2e2e2a] border-[#3e3e3a] text-[#f0ede6] placeholder:text-[#6b6457]"
    : "bg-white border-[#d8d2c4] text-[#1a1a18] placeholder:text-[#a09a8c]";

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <div className={`min-h-screen font-sans ${bg} ${text} transition-colors duration-300`}>
      {/* Header */}
      <header
        className={`sticky top-0 z-50 border-b ${isDark ? "bg-[#1a1a18]/95 border-[#2e2e2a]" : "bg-[#faf8f4]/95 border-[#e8e3d8]"} backdrop-blur-sm`}
      >
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5"
          >
            <FreeRoomPlannerLogo size={24} className={teal} />
            <span className="font-semibold text-[15px] tracking-tight">Free Room Planner</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDark((d) => !d)}
              className={`p-1.5 rounded-md ${isDark ? "hover:bg-[#2e2e2a] text-[#a09a8c]" : "hover:bg-[#f0ede6] text-[#6b6457]"} transition-colors`}
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              )}
            </button>
            <button
              onClick={() => navigate("/app")}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[#3d8a7c] hover:bg-[#327368] text-white transition-colors"
            >
              Start planning
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-5">
        {stage === "form" ? (
          /* ========================================================= */
          /*  STAGE 1: Onboarding Form                                 */
          /* ========================================================= */
          <section className="py-16 max-w-lg mx-auto">
            {/* Value proposition */}
            <div className="text-center mb-10">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4">
                Turn visitors into ready-to-quote leads by embedding Free Room Planner into your website
              </h1>
              <p className={`text-base max-w-md mx-auto mb-6 ${muted}`}>
                Customers who plan their room arrive at enquiry knowing their space. You spend less time measuring — and more time closing.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Higher quality enquiries", "Faster quotes", "Free to embed", "Live in minutes"].map(
                  (pill) => (
                    <span
                      key={pill}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full ${pillBg}`}
                    >
                      {pill}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className={`rounded-xl border p-6 sm:p-8 ${cardBg} ${border}`}
              noValidate
            >
              {/* Business name */}
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1.5">
                  Business name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Johnson Kitchens"
                  value={form.businessName}
                  onChange={(e) => setField("businessName", e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#3d8a7c]/40 transition ${inputBg}`}
                />
                {errors.businessName && (
                  <p className="text-red-500 text-xs mt-1">{errors.businessName}</p>
                )}
              </div>

              {/* Email */}
              <div className="mb-1">
                <label className="block text-sm font-medium mb-1.5">
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="hello@johnsonkitchens.co.uk"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#3d8a7c]/40 transition ${inputBg}`}
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                )}
              </div>
              <p className={`text-xs mb-5 ${muted}`}>
                We'll only contact you about your embed. No spam, ever.
              </p>

              {/* Website URL */}
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1.5">
                  Website URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="yoursite.com"
                  value={form.websiteUrl}
                  onChange={(e) => setField("websiteUrl", e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#3d8a7c]/40 transition ${inputBg}`}
                />
                {errors.websiteUrl && (
                  <p className="text-red-500 text-xs mt-1">{errors.websiteUrl}</p>
                )}
              </div>

              {/* Brand colour */}
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1.5">Brand colour</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.brandColor}
                    onChange={(e) => setField("brandColor", e.target.value)}
                    className="w-10 h-10 rounded-lg border cursor-pointer p-0.5"
                    style={{ backgroundColor: isDark ? "#2e2e2a" : "#fff" }}
                  />
                  <div
                    className="w-10 h-10 rounded-lg border"
                    style={{
                      backgroundColor: form.brandColor,
                      borderColor: isDark ? "#3e3e3a" : "#d8d2c4",
                    }}
                  />
                  <span className={`text-sm font-mono ${muted}`}>{form.brandColor}</span>
                </div>
              </div>

              {/* Units preference */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-1.5">Units preference</label>
                <div className={`inline-flex rounded-lg border ${border} overflow-hidden`}>
                  {(["m", "ft"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setField("units", unit)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        form.units === unit
                          ? "bg-[#3d8a7c] text-white"
                          : `${isDark ? "hover:bg-[#2e2e2a] text-[#a09a8c]" : "hover:bg-[#f0ede6] text-[#6b6457]"}`
                      }`}
                    >
                      {unit === "m" ? "Metres" : "Feet"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Embed type — visual cards */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Embed type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    {
                      value: "fullpage" as const,
                      title: "Full page",
                      desc: "Fills the entire page",
                      bestFor: "Dedicated planner pages",
                      icon: (
                        <svg width="48" height="36" viewBox="0 0 48 36" fill="none" className="mx-auto mb-2">
                          <rect x="1" y="1" width="46" height="34" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                          <rect x="3" y="5" width="42" height="28" rx="2" fill="currentColor" opacity="0.15" />
                          <rect x="3" y="1" width="42" height="4" rx="1" fill="currentColor" opacity="0.1" />
                          <circle cx="6" cy="3" r="1" fill="currentColor" opacity="0.3" />
                          <circle cx="10" cy="3" r="1" fill="currentColor" opacity="0.3" />
                        </svg>
                      ),
                    },
                    {
                      value: "homepage" as const,
                      title: "Homepage embed",
                      desc: "Compact, expands on use",
                      bestFor: "Embedding alongside content",
                      icon: (
                        <svg width="48" height="36" viewBox="0 0 48 36" fill="none" className="mx-auto mb-2">
                          <rect x="1" y="1" width="46" height="34" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                          <rect x="5" y="4" width="38" height="3" rx="1" fill="currentColor" opacity="0.1" />
                          <rect x="5" y="10" width="38" height="18" rx="2" fill="currentColor" opacity="0.15" />
                          <rect x="5" y="31" width="38" height="2" rx="1" fill="currentColor" opacity="0.1" />
                        </svg>
                      ),
                    },
                    {
                      value: "homepage-link" as const,
                      title: "Homepage link",
                      desc: "Static banner with link",
                      bestFor: "Promoting from your homepage",
                      icon: (
                        <svg width="48" height="36" viewBox="0 0 48 36" fill="none" className="mx-auto mb-2">
                          <rect x="1" y="1" width="46" height="34" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                          <rect x="5" y="4" width="38" height="3" rx="1" fill="currentColor" opacity="0.1" />
                          <rect x="8" y="14" width="32" height="10" rx="5" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
                          <rect x="28" y="16" width="10" height="6" rx="3" fill="currentColor" opacity="0.2" />
                          <rect x="5" y="31" width="38" height="2" rx="1" fill="currentColor" opacity="0.1" />
                        </svg>
                      ),
                    },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField("embedType", opt.value)}
                      className={`text-center p-4 rounded-lg border transition-colors ${
                        form.embedType === opt.value
                          ? `border-[#3d8a7c] ${isDark ? "bg-[#1a332e]" : "bg-[#e8f4f1]"}`
                          : `${border} ${isDark ? "hover:bg-[#2e2e2a]" : "hover:bg-[#f5f3ee]"}`
                      }`}
                    >
                      <div className={form.embedType === opt.value ? "text-[#3d8a7c]" : muted}>
                        {opt.icon}
                      </div>
                      <span className="text-sm font-semibold block">{opt.title}</span>
                      <p className={`text-xs mt-0.5 ${muted}`}>{opt.desc}</p>
                      <p className={`text-[11px] mt-1.5 font-medium ${form.embedType === opt.value ? "text-[#3d8a7c]" : muted}`}>
                        Best for: {opt.bestFor}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instructions — contextual per embed type */}
              <div className={`mb-6 rounded-lg border p-4 ${border} ${isDark ? "bg-[#1e1e1c]" : "bg-[#f9f7f3]"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#3d8a7c" }}>
                  Instructions
                </p>
                <ol className={`space-y-2 text-sm ${muted} list-decimal list-inside`}>
                  {form.embedType === "fullpage" && (
                    <>
                      <li>Create a <span className={`font-semibold ${text}`}>new blank page</span> on your website (e.g. <code className="text-xs px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">/room-planner</code>)</li>
                      <li>Paste the embed code into the page's HTML — it will <span className={`font-semibold ${text}`}>fill the entire viewport</span></li>
                      <li>Remove any headers, footers, or sidebars so the planner runs <span className={`font-semibold ${text}`}>edge-to-edge</span></li>
                      <li>Link to the page from your navigation or a <span className={`font-semibold ${text}`}>call-to-action button</span></li>
                    </>
                  )}
                  {form.embedType === "homepage" && (
                    <>
                      <li>Paste the embed code <span className={`font-semibold ${text}`}>wherever you want the planner card</span> to appear on your page</li>
                      <li>It loads as a compact card with a <span className={`font-semibold ${text}`}>"Start planning"</span> button — no iframe until clicked</li>
                      <li>When a visitor clicks, the card <span className={`font-semibold ${text}`}>expands inline</span> to reveal the full planner</li>
                      <li>Works alongside your existing content — <span className={`font-semibold ${text}`}>no extra pages needed</span></li>
                    </>
                  )}
                  {form.embedType === "homepage-link" && (
                    <>
                      <li>Create a <span className={`font-semibold ${text}`}>dedicated planner page</span> on your site and embed the full-page code there (provided after signup)</li>
                      <li>Enter that page's URL in the <span className={`font-semibold ${text}`}>"Planner page URL"</span> field below</li>
                      <li>Paste the <span className={`font-semibold ${text}`}>banner code</span> on your homepage or any page where you want to promote the planner</li>
                      <li>Visitors click the banner and are <span className={`font-semibold ${text}`}>taken to your planner page</span></li>
                    </>
                  )}
                </ol>
              </div>

              {/* Decision guide */}
              <div className="mb-6">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="decision-guide" className={border}>
                    <AccordionTrigger className={`${muted} text-sm hover:no-underline`}>
                      Which should I choose?
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className={`space-y-2.5 text-sm ${muted}`}>
                        <p>
                          Have a dedicated page for the planner? &rarr;{" "}
                          <strong className={text}>Full page</strong>
                        </p>
                        <p>
                          Want to add it alongside other content on your homepage? &rarr;{" "}
                          <strong className={text}>Homepage embed</strong>
                        </p>
                        <p>
                          Prefer a simple link without embedding an iframe? &rarr;{" "}
                          <strong className={text}>Homepage link</strong>
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* Planner page URL — only for homepage-link */}
              {form.embedType === "homepage-link" && (
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1.5">
                    Room planner page path
                  </label>
                  <input
                    type="text"
                    placeholder="/room-planner"
                    value={form.plannerPageUrl}
                    onChange={(e) => setField("plannerPageUrl", e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#3d8a7c]/40 transition ${inputBg}`}
                  />
                  {errors.plannerPageUrl && (
                    <p className="text-red-500 text-xs mt-1">{errors.plannerPageUrl}</p>
                  )}
                  <p className={`text-xs mt-1 ${muted}`}>
                    The path on your site where you'll host the full page embed (e.g. /room-planner).
                  </p>
                </div>
              )}

              {/* Submit error */}
              {submitError && (
                <p className="text-red-500 text-sm mb-4">{submitError}</p>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl text-base font-semibold bg-[#3d8a7c] hover:bg-[#327368] text-white transition-colors shadow-sm disabled:opacity-60"
              >
                {submitting ? "Generating..." : "Get my free embed code \u2192"}
              </button>
              <p className={`text-xs text-center mt-3 ${muted}`}>
                We'll send you one line of code to paste into your site. That's it.
              </p>
            </form>
          </section>
        ) : (
          /* ========================================================= */
          /*  STAGE 2: Snippet + Preview                               */
          /* ========================================================= */
          <section className="py-10 max-w-3xl mx-auto">
            {/* Confirmation banner */}
            <div
              className={`rounded-xl px-5 py-4 mb-6 ${isDark ? "bg-[#1a332e] border border-[#2a4a42]" : "bg-[#e8f4f1] border border-[#c0ddd5]"}`}
            >
              <p className={`font-semibold ${teal}`}>
                Your embed is ready, {resultName}. Partner ID:{" "}
                <code
                  className={`text-sm font-mono px-1.5 py-0.5 rounded ${isDark ? "bg-[#2e2e2a]" : "bg-[#d4ece5]"}`}
                >
                  {partnerId}
                </code>
              </p>
            </div>

            {/* Start over */}
            <button
              onClick={handleStartOver}
              className={`text-sm mb-8 ${teal} hover:underline`}
            >
              &larr; Start over
            </button>

            {/* Recap sentence */}
            <p className={`text-sm mb-6 ${muted}`}>
              {form.embedType === "fullpage"
                ? "You chose the full page embed \u2014 your visitors will land directly on the planner."
                : form.embedType === "homepage"
                ? "You chose the homepage embed \u2014 a compact button that expands to full screen when clicked."
                : "You chose the homepage link \u2014 a banner linking to a dedicated planner page. You\u2019ll need two code snippets."}
            </p>

            {form.embedType === "homepage-link" ? (
              <>
                {/* Step 1: Homepage link snippet */}
                <div className={`rounded-xl border p-5 sm:p-6 mb-6 ${cardBg} ${border}`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: "#3d8a7c" }}
                    >
                      1
                    </span>
                    <h2 className="text-lg font-semibold">Add this to your homepage</h2>
                  </div>
                  <p className={`text-sm mb-4 ${muted}`}>
                    Paste this banner on your homepage to link visitors to your planner page.
                  </p>
                  <div className="relative">
                    <pre className="bg-[#1a1a18] text-[#e8e3d8] rounded-lg p-4 text-sm overflow-x-auto font-mono leading-relaxed">
                      <code>{buildHomepageLinkSnippet(form)}</code>
                    </pre>
                    <button
                      onClick={handleCopy}
                      className={`absolute top-2 right-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        copied
                          ? "bg-[#3d8a7c] text-white"
                          : "bg-[#2e2e2a] hover:bg-[#3e3e3a] text-[#a09a8c]"
                      }`}
                    >
                      {copied ? "Copied! \u2713" : "Copy code"}
                    </button>
                  </div>
                </div>

                {/* Step 2: Full page planner snippet */}
                <div className={`rounded-xl border p-5 sm:p-6 mb-6 ${cardBg} ${border}`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: "#3d8a7c" }}
                    >
                      2
                    </span>
                    <h2 className="text-lg font-semibold">Add this to your planner page</h2>
                  </div>
                  <p className={`text-sm mb-4 ${muted}`}>
                    Paste this on the dedicated page your banner links to (e.g.{" "}
                    <code className={`text-xs font-mono px-1 py-0.5 rounded ${isDark ? "bg-[#2e2e2a]" : "bg-[#f0ede6]"}`}>
                      {form.plannerPageUrl.trim() || "/room-planner"}
                    </code>
                    ).
                  </p>
                  <div className="relative">
                    <pre className="bg-[#1a1a18] text-[#e8e3d8] rounded-lg p-4 text-sm overflow-x-auto font-mono leading-relaxed">
                      <code>{buildFullPageSnippetForLink(partnerId, form)}</code>
                    </pre>
                    <button
                      onClick={handleCopyPlanner}
                      className={`absolute top-2 right-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        copiedPlanner
                          ? "bg-[#3d8a7c] text-white"
                          : "bg-[#2e2e2a] hover:bg-[#3e3e3a] text-[#a09a8c]"
                      }`}
                    >
                      {copiedPlanner ? "Copied! \u2713" : "Copy code"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Single snippet for fullpage / homepage */
              <div className={`rounded-xl border p-5 sm:p-6 mb-6 ${cardBg} ${border}`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: "#3d8a7c" }}
                  >
                    1
                  </span>
                  <h2 className="text-lg font-semibold">Copy your code</h2>
                </div>
                <p className={`text-sm mb-4 ${muted}`}>
                  Paste this into any page on your website.
                </p>

                <div className="relative">
                  <pre className="bg-[#1a1a18] text-[#e8e3d8] rounded-lg p-4 text-sm overflow-x-auto font-mono leading-relaxed">
                    <code>{buildSnippet(partnerId, form)}</code>
                  </pre>
                  <button
                    onClick={handleCopy}
                    className={`absolute top-2 right-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      copied
                        ? "bg-[#3d8a7c] text-white"
                        : "bg-[#2e2e2a] hover:bg-[#3e3e3a] text-[#a09a8c]"
                    }`}
                  >
                    {copied ? "Copied! \u2713" : "Copy code"}
                  </button>
                </div>

              </div>
            )}

            {/* Platform instructions step */}
            <div className={`rounded-xl border p-5 sm:p-6 mb-6 ${cardBg} ${border}`}>
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: "#3d8a7c" }}
                >
                  {form.embedType === "homepage-link" ? 3 : 2}
                </span>
                <h2 className="text-lg font-semibold">Add it to your site</h2>
              </div>

              {/* Platform tabs */}
              <div className={`flex gap-1 mb-4 rounded-lg p-1 ${isDark ? "bg-[#2e2e2a]" : "bg-[#f0ede6]"}`}>
                {(["wordpress", "squarespace", "wix", "html"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setPlatformTab(tab)}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      platformTab === tab
                        ? `${cardBg} shadow-sm ${text}`
                        : `${muted} hover:${text}`
                    }`}
                  >
                    {tab === "wordpress"
                      ? "WordPress"
                      : tab === "squarespace"
                      ? "Squarespace"
                      : tab === "wix"
                      ? "Wix"
                      : "HTML"}
                  </button>
                ))}
              </div>

              {/* Platform instructions */}
              <div className={`text-sm ${muted}`}>
                {platformTab === "wordpress" && (
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Go to the page or post you want to add it to</li>
                    <li>Add a &ldquo;Custom HTML&rdquo; block</li>
                    <li>Paste the embed code</li>
                    <li>Publish</li>
                  </ol>
                )}
                {platformTab === "squarespace" && (
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Edit the page where you want to add it</li>
                    <li>Add a &ldquo;Code&rdquo; block</li>
                    <li>Paste the embed code</li>
                    <li>Save and publish</li>
                  </ol>
                )}
                {platformTab === "wix" && (
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Open the Wix Editor on the page you want</li>
                    <li>Click Add &rarr; Embed &rarr; Custom Code</li>
                    <li>Paste the embed code</li>
                    <li>Publish</li>
                  </ol>
                )}
                {platformTab === "html" && (
                  <p>
                    Paste the embed code directly into your HTML where you want the planner to
                    appear.
                  </p>
                )}
              </div>
            </div>

            {/* Test it step */}
            <div className={`rounded-xl border p-5 sm:p-6 mb-8 ${cardBg} ${border}`}>
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: "#3d8a7c" }}
                >
                  {form.embedType === "homepage-link" ? 4 : 3}
                </span>
                <h2 className="text-lg font-semibold">Test it</h2>
              </div>
              <p className={`text-sm ${muted}`}>
                Visit your page and check the planner loads correctly. The &lsquo;Powered by
                freeroomplanner.com&rsquo; badge should appear in the bottom-right corner.
              </p>
            </div>

            {/* Preview section with toggle */}
            <div className={`rounded-xl border p-5 sm:p-6 ${cardBg} ${border}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Preview</h2>
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
                    isDark ? "hover:bg-[#2e2e2a]" : "hover:bg-[#f0ede6]"
                  } ${teal}`}
                >
                  {showPreview ? "Hide preview" : "Show preview"}
                </button>
              </div>

              {showPreview && (
                <>
                  <p className={`text-sm mb-4 ${muted}`}>
                    This is exactly what your customers will see.
                  </p>

                  {form.embedType === "homepage-link" ? (
                    <div
                      className={`rounded-lg border p-6 flex items-center justify-center ${border}`}
                      style={{ minHeight: 140 }}
                    >
                      <div dangerouslySetInnerHTML={{ __html: buildSnippet(partnerId, form) }} />
                    </div>
                  ) : (
                    <div
                      className={`relative rounded-lg border overflow-hidden ${border}`}
                      style={{ height: form.embedType === "fullpage" ? 700 : 500 }}
                    >
                      {!previewLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 border-2 border-[#3d8a7c] border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      <iframe
                        src={buildPreviewSrc(partnerId, form)}
                        width="100%"
                        height="100%"
                        style={{ border: "none", borderRadius: 8 }}
                        title="Free Room Planner Preview"
                        loading="lazy"
                        onLoad={() => setPreviewLoaded(true)}
                      />
                    </div>
                  )}

                  <p className={`text-xs mt-3 ${muted}`}>
                    {form.embedType === "homepage-link"
                      ? "This is the banner your visitors will see on your homepage."
                      : "The \u2018Powered by freeroomplanner.com\u2019 badge appears in the bottom-right corner."}
                  </p>
                </>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
