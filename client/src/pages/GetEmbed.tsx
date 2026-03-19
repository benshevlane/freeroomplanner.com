import { useState, useEffect, useCallback } from "react";
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
  logoUrl: string;
  units: "m" | "ft";
}

const DEFAULT_BRAND_COLOR = "#6bbfa0";

const INITIAL_FORM: FormState = {
  businessName: "",
  email: "",
  websiteUrl: "",
  brandColor: DEFAULT_BRAND_COLOR,
  logoUrl: "",
  units: "m",
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

function buildEmbedSrc(partnerId: string, form: FormState): string {
  const params = new URLSearchParams();
  params.set("partner", partnerId);
  if (form.brandColor !== DEFAULT_BRAND_COLOR) {
    params.set("brand_color", form.brandColor.replace("#", ""));
  }
  if (form.units === "ft") {
    params.set("units", "ft");
  }
  if (form.logoUrl.trim()) {
    params.set("logo_url", form.logoUrl.trim());
  }
  return `https://freeroomplanner.com/embed?${params.toString()}`;
}

function buildSnippet(partnerId: string, form: FormState): string {
  const src = buildEmbedSrc(partnerId, form);
  return `<!-- Free Room Planner Embed -->
<!-- Free to use. Powered by freeroomplanner.com -->
<iframe
  src="${src}"
  width="100%"
  height="700"
  style="border: none; border-radius: 8px;"
  title="Free Room Planner"
  loading="lazy"
></iframe>`;
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
  if (form.logoUrl.trim()) {
    params.set("logo_url", form.logoUrl.trim());
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
  const [logoError, setLogoError] = useState<string | null>(null);

  // Result state
  const [partnerId, setPartnerId] = useState("");
  const [resultName, setResultName] = useState("");

  // Copy state
  const [copied, setCopied] = useState(false);

  // Preview loading state
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Dark mode
  useEffect(() => {
    setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Scroll to top on stage change
  useEffect(() => {
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

  /* ---- Logo URL blur validation ---- */
  const validateLogoOnBlur = useCallback(() => {
    const val = form.logoUrl.trim();
    if (val && !val.startsWith("https://")) {
      setLogoError("Logo URL must start with https://");
    } else {
      setLogoError(null);
    }
  }, [form.logoUrl]);

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
      if (form.logoUrl.trim() && !form.logoUrl.trim().startsWith("https://")) {
        newErrors.logoUrl = "Logo URL must start with https://";
      }
      if (form.websiteUrl.trim()) {
        try {
          new URL(form.websiteUrl.trim());
        } catch {
          newErrors.websiteUrl = "Please enter a valid URL.";
        }
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
                logo_url: form.logoUrl.trim() || null,
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

  /* ---- Start over handler ---- */
  const handleStartOver = useCallback(() => {
    setStage("form");
    setForm(INITIAL_FORM);
    setErrors({});
    setSubmitError(null);
    setLogoError(null);
    setPartnerId("");
    setResultName("");
    setCopied(false);
    setPreviewLoaded(false);
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
                Add a free room planner to your website
              </h1>
              <p className={`text-base max-w-md mx-auto mb-6 ${muted}`}>
                Give your customers a tool to plan their space before they contact you. One line of code.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Up and running in minutes", "Your branding", "Powered by freeroomplanner.com"].map(
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
                <label className="block text-sm font-medium mb-1.5">Website URL</label>
                <input
                  type="text"
                  placeholder="https://yoursite.com"
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

              {/* Logo URL */}
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1.5">Logo URL</label>
                <input
                  type="text"
                  placeholder="https://yoursite.com/logo.png"
                  value={form.logoUrl}
                  onChange={(e) => setField("logoUrl", e.target.value)}
                  onBlur={validateLogoOnBlur}
                  className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#3d8a7c]/40 transition ${inputBg}`}
                />
                {(errors.logoUrl || logoError) && (
                  <p className="text-red-500 text-xs mt-1">{errors.logoUrl || logoError}</p>
                )}
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
                {submitting ? "Generating..." : "Generate my embed code \u2192"}
              </button>
            </form>
          </section>
        ) : (
          /* ========================================================= */
          /*  STAGE 2: Snippet + Preview                               */
          /* ========================================================= */
          <section className="py-10">
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

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              {/* LEFT: Code snippet */}
              <div className={`rounded-xl border p-5 sm:p-6 ${cardBg} ${border}`}>
                <h2 className="text-lg font-semibold mb-1">Your embed code</h2>
                <p className={`text-sm mb-4 ${muted}`}>
                  Paste this into any page on your website
                </p>

                {/* Code block */}
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

                <p className={`text-xs mt-4 ${muted}`}>
                  This is your unique embed code. It will always show the &lsquo;Powered by
                  freeroomplanner.com&rsquo; badge.
                </p>
                <p className={`text-xs mt-2 ${muted}`}>
                  Want to remove the badge or use your own branding?{" "}
                  <a
                    href="mailto:hello@freeroomplanner.com"
                    className={`${teal} hover:underline`}
                  >
                    Contact us about our partner plan &rarr;
                  </a>
                </p>
              </div>

              {/* RIGHT: Live preview */}
              <div className={`rounded-xl border p-5 sm:p-6 ${cardBg} ${border}`}>
                <h2 className="text-lg font-semibold mb-1">Preview</h2>
                <p className={`text-sm mb-4 ${muted}`}>
                  This is exactly what your customers will see
                </p>

                <div
                  className={`relative rounded-lg border overflow-hidden ${border}`}
                  style={{ height: 600 }}
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

                <p className={`text-xs mt-3 ${muted}`}>
                  The &lsquo;Powered by freeroomplanner.com&rsquo; badge appears in the bottom-right
                  corner.
                </p>
              </div>
            </div>

            {/* Installation instructions */}
            <div className={`rounded-xl border p-5 sm:p-6 ${cardBg} ${border}`}>
              <h2 className="text-lg font-semibold mb-4">How to add this to your website</h2>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="wordpress" className={border}>
                  <AccordionTrigger className={`${text} hover:no-underline`}>
                    WordPress
                  </AccordionTrigger>
                  <AccordionContent className={muted}>
                    <ol className="list-decimal list-inside space-y-1.5 text-sm">
                      <li>Go to the page or post you want to add it to</li>
                      <li>Add a &ldquo;Custom HTML&rdquo; block</li>
                      <li>Paste the embed code</li>
                      <li>Publish</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="squarespace" className={border}>
                  <AccordionTrigger className={`${text} hover:no-underline`}>
                    Squarespace
                  </AccordionTrigger>
                  <AccordionContent className={muted}>
                    <ol className="list-decimal list-inside space-y-1.5 text-sm">
                      <li>Edit the page where you want to add it</li>
                      <li>Add a &ldquo;Code&rdquo; block</li>
                      <li>Paste the embed code</li>
                      <li>Save and publish</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="wix" className={border}>
                  <AccordionTrigger className={`${text} hover:no-underline`}>
                    Wix
                  </AccordionTrigger>
                  <AccordionContent className={muted}>
                    <ol className="list-decimal list-inside space-y-1.5 text-sm">
                      <li>Open the Wix Editor on the page you want</li>
                      <li>Click Add &rarr; Embed &rarr; Custom Code</li>
                      <li>Paste the embed code</li>
                      <li>Publish</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="html" className={`border-b-0 ${border}`}>
                  <AccordionTrigger className={`${text} hover:no-underline`}>
                    Other / HTML
                  </AccordionTrigger>
                  <AccordionContent className={muted}>
                    <p className="text-sm">
                      Paste the embed code directly into your HTML where you want the planner to
                      appear.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
