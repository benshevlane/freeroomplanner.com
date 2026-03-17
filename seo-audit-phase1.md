# Phase 1 SEO Audit — freeroomplanner.com

**Date:** 2026-03-17

---

## 1. Crawl & Analysis Results

### Title Tag

| Check | Result |
|-------|--------|
| Present? | Yes |
| Content | `Free Room Planner — Design Any Room Layout Online` |
| Includes "free room planner"? | Yes |
| Mentions use cases? | No — "Any Room" is generic; kitchen/bathroom/living room not mentioned |
| Under 60 chars? | No — **51 characters** (good, under 60) |

**Verdict:** Good. The title is clean and keyword-rich. Minor opportunity: it doesn't mention specific room types, but that's better handled by sub-page titles to avoid keyword stuffing on the homepage.

---

### Meta Description

| Check | Result |
|-------|--------|
| Present? | Yes |
| Content | `Plan any room for free — kitchens, bathrooms, bedrooms and living rooms. Draw walls, drag furniture, and export your floor plan as PNG. No login required.` |
| Leads with use case/benefit? | Yes — "Plan any room for free" |
| Length | **156 characters** (within 140–160 range) |

**Verdict:** Excellent. Hits key use cases, mentions the free aspect, and includes a clear benefit. No changes needed.

---

### H1 Tag

| Check | Result |
|-------|--------|
| Exactly one H1? | Yes |
| Content | `Free Room Planner: Design Any Room Layout Online` |
| Contains primary keyword? | Yes — "Free Room Planner" |

**Verdict:** Good. The H1 matches the title closely and contains the primary keyword.

---

### Structured Data (JSON-LD)

| Check | Result |
|-------|--------|
| Present? | Yes |
| Schema type | `SoftwareApplication` |
| Includes price? | Yes — £0 (free) |
| Includes category? | Yes — `DesignApplication` |
| Includes creator? | Yes — Organization |

**Current JSON-LD block:**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Free Room Planner",
  "url": "https://freeroomplanner.com",
  "description": "Free online room planner. Draw any room to scale, add furniture, and export floor plans as PNG. Works for kitchens, bathrooms, bedrooms, and living rooms.",
  "applicationCategory": "DesignApplication",
  "operatingSystem": "Web",
  "browserRequirements": "Requires a modern web browser with JavaScript enabled",
  "offers": {"@type": "Offer", "price": "0", "priceCurrency": "GBP"},
  "creator": {"@type": "Organization", "name": "Free Room Planner", "url": "https://freeroomplanner.com"}
}
```

**Verdict:** Solid. Could be enhanced with `aggregateRating`, `screenshot`, and `featureList` properties (see recommendations below).

---

### Sitemap (sitemap.xml)

| Check | Result |
|-------|--------|
| Exists? | Yes — `/client/public/sitemap.xml` |
| Valid XML? | Yes |
| Referenced in robots.txt? | Yes |

**URLs listed (18 total):**

| URL | Priority | Changefreq |
|-----|----------|------------|
| `/` | 1.0 | weekly |
| `/room-planner` | 0.9 | monthly |
| `/kitchen-planner` | 0.9 | monthly |
| `/bathroom-planner` | 0.9 | monthly |
| `/bedroom-planner` | 0.9 | monthly |
| `/living-room-planner` | 0.9 | monthly |
| `/floor-plan-maker` | 0.9 | monthly |
| `/how-it-works` | 0.8 | monthly |
| `/blog` | 0.8 | weekly |
| `/blog/kitchen-layout-guide` | 0.7 | monthly |
| `/blog/bathroom-planning-mistakes` | 0.7 | monthly |
| `/blog/brief-your-builder` | 0.7 | monthly |
| `/blog/small-bedroom-layouts` | 0.7 | monthly |
| `/blog/open-plan-living` | 0.7 | monthly |
| `/blog/extension-planning` | 0.7 | monthly |

**Verdict:** Excellent coverage. All key pages included.

---

### robots.txt

```
User-agent: *
Allow: /

Sitemap: https://freeroomplanner.com/sitemap.xml
```

| Check | Result |
|-------|--------|
| Exists? | Yes |
| Blocking important paths? | No — allows everything |
| References sitemap? | Yes |

**Verdict:** Clean and correct. No issues.

---

### Core Web Vitals Proxy (HTML/JS Structure)

| Check | Result |
|-------|--------|
| Render-blocking JS? | Minimal — single `<script type="module">` at end of body (non-blocking) |
| Render-blocking CSS? | Two external font stylesheets in `<head>` (Google Fonts + Fontshare) — minor render-blocking |
| Pre-rendered HTML content? | **Yes** — full semantic HTML inside `<div id="root">` with nav, headings, paragraphs, lists |
| Client-side only? | **No** — hybrid approach. Content is in raw HTML, React hydrates on top |

**Verdict:** Good approach. The pre-rendered HTML ensures search engines see full content. The font stylesheets are mildly render-blocking but use `display=swap`. The single module script at the bottom is non-blocking. This is well-architected for SEO.

**Minor improvement:** Add `rel="preload"` or use `font-display: optional` to eliminate font-related layout shift.

---

### Internal Linking

| Target Page | Linked from homepage? |
|-------------|----------------------|
| `/room-planner` | Yes (nav) |
| `/kitchen-planner` | Yes (nav + body) |
| `/bathroom-planner` | Yes (nav + body) |
| `/bedroom-planner` | Yes (nav + body) |
| `/living-room-planner` | Yes (nav + body) |
| `/floor-plan-maker` | Yes (nav + body) |
| `/how-it-works` | Yes (nav) |
| `/blog` | Yes (nav) |
| `/app` | Yes (CTA in body) |

**Verdict:** Excellent internal linking. All sub-pages are linked from both navigation and contextual body links with descriptive anchor text.

---

### Alt Text (Images)

| Check | Result |
|-------|--------|
| `<img>` tags with missing alt? | No `<img>` tags in the homepage HTML |
| SVGs with accessibility? | Yes — SVGs use `aria-label` attributes |
| OG image specified? | Yes — `/og-image.png` (1200x630) |

**Verdict:** No issues. The homepage is text-heavy with SVG icons, all properly labelled.

---

### Open Graph & Twitter Cards

| Tag | Present? | Content |
|-----|----------|---------|
| `og:type` | Yes | `website` |
| `og:site_name` | Yes | `Free Room Planner` |
| `og:title` | Yes | `Free Room Planner — Design Any Room Layout Online` |
| `og:description` | Yes | Matches meta description |
| `og:url` | Yes | `https://freeroomplanner.com/` |
| `og:image` | Yes | `https://freeroomplanner.com/og-image.png` |
| `og:image:width` | Yes | `1200` |
| `og:image:height` | Yes | `630` |
| `twitter:card` | Yes | `summary_large_image` |
| `twitter:title` | Yes | Matches title |
| `twitter:description` | Yes | Matches description |

**Verdict:** Complete and correct. No changes needed.

---

### Other Technical SEO

| Check | Result |
|-------|--------|
| `<html lang="en">` | Yes |
| `<meta charset="UTF-8">` | Yes |
| Viewport meta | Yes |
| Canonical URL | Yes — `https://freeroomplanner.com/` |
| HTTPS | Yes |

---

## 2. Generated Missing/Improved Assets

### Enhanced JSON-LD Schema (with additional recommended properties)

The existing schema is good. Here's an enhanced version with `featureList`, `screenshot`, and `aggregateRating` placeholder:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Free Room Planner",
  "url": "https://freeroomplanner.com",
  "description": "Free online room planner. Draw any room to scale, add furniture, and export floor plans as PNG. Works for kitchens, bathrooms, bedrooms, and living rooms.",
  "applicationCategory": "DesignApplication",
  "operatingSystem": "Web",
  "browserRequirements": "Requires a modern web browser with JavaScript enabled",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "GBP"
  },
  "creator": {
    "@type": "Organization",
    "name": "Free Room Planner",
    "url": "https://freeroomplanner.com"
  },
  "screenshot": "https://freeroomplanner.com/og-image.png",
  "featureList": [
    "Draw walls to scale with snap-to-grid",
    "30+ furniture items including sofas, beds, tables, and kitchen units",
    "Live wall measurements",
    "Export floor plans as PNG",
    "Works on mobile, tablet, and desktop",
    "No account or login required"
  ]
}
```

> **Note:** Only add `aggregateRating` when you have real user ratings to display. Do not fabricate ratings — Google penalises fake review markup.

---

## 3. Prioritised Fix List

| # | Issue | Severity | What to Fix | Where to Fix It |
|---|-------|----------|-------------|-----------------|
| 1 | Font stylesheets are render-blocking | Med | Add `media="print" onload="this.media='all'"` pattern or `<link rel="preload" as="style">` for the two font CSS links to eliminate render-blocking | `client/index.html` lines 33–36 |
| 2 | JSON-LD schema missing `featureList` and `screenshot` | Low | Add `featureList` array and `screenshot` URL to the existing SoftwareApplication schema (see enhanced version above) | `client/index.html` lines 37–48 |
| 3 | No `FAQPage` schema on homepage | Med | The homepage has FAQ content in `<dl>` tags but no corresponding `FAQPage` JSON-LD. Add a second schema block for FAQ markup to qualify for FAQ rich results | `client/index.html` — add after line 48 |
| 4 | Missing `twitter:image` meta tag | Low | Add `<meta name="twitter:image" content="https://freeroomplanner.com/og-image.png">` so Twitter shows the image without relying on OG fallback | `client/index.html` — after line 30 |
| 5 | No `hreflang` tags | Low | If targeting UK audience specifically (GBP in schema), consider adding `<link rel="alternate" hreflang="en-gb">` | `client/index.html` `<head>` |
| 6 | `lastmod` dates in sitemap are all identical | Low | Update `lastmod` to reflect actual last-modified dates for each page, not today's date for all | `client/public/sitemap.xml` |
| 7 | No dynamic meta tag management in SPA | Med | When navigating to `/app` via client-side routing, the title/description still shows the homepage meta. Consider adding `document.title` updates in the React router or using `react-helmet-async` | `client/src/App.tsx` or add `react-helmet-async` |

---

## 4. Landing Page Briefs

### 4.1 /kitchen-planner

| Field | Value |
|-------|-------|
| **URL slug** | `/kitchen-planner` |
| **Target keyword** | `free kitchen planner` |
| **Suggested H1** | `Free Kitchen Planner — Design Your Kitchen Layout Online` |
| **Meta title** | `Free Kitchen Planner — Design Your Layout Online` (50 chars) |
| **Meta description** | `Plan your kitchen layout for free. Place units, appliances, and islands to scale. Export your floor plan as PNG and share it with your fitter. No login needed.` (159 chars) |

**Content the page should include:**
- **Hero section** with H1 and a CTA to open the planner pre-loaded with kitchen furniture. Explain that users can draw their kitchen walls and drag in units, appliances, and islands.
- **"How to plan your kitchen" section** — 3–4 step guide: measure your room, draw walls, place the work triangle (sink, cooker, fridge), add storage. This doubles as `HowTo` schema content.
- **Kitchen furniture library preview** — show/list the kitchen-specific items available (base units, wall units, island, oven, hob, fridge-freezer, dishwasher, sink). Use icons or screenshots with alt text.
- **FAQ block** — 3–4 questions like "Can I plan an L-shaped kitchen?", "Does it include appliance dimensions?", "Can I share the plan with my kitchen fitter?" — mark up as `FAQPage` schema.

---

### 4.2 /bathroom-planner

| Field | Value |
|-------|-------|
| **URL slug** | `/bathroom-planner` |
| **Target keyword** | `free bathroom planner` |
| **Suggested H1** | `Free Bathroom Planner — Plan Your Bathroom Layout Online` |
| **Meta title** | `Free Bathroom Planner — Plan Your Layout Online` (49 chars) |
| **Meta description** | `Design your bathroom layout for free. Position your bath, shower, toilet, and basin to scale. Download a PNG floor plan to share with your plumber or tiler.` (156 chars) |

**Content the page should include:**
- **Hero section** with H1 and CTA to open the planner with bathroom items pre-selected. Explain how users can check clearances and door swings.
- **"How to plan your bathroom" guide** — step-by-step: measure the room including pipe locations, draw walls, place sanitaryware, check clearances. Mark up as `HowTo` schema.
- **Bathroom items library** — list available items: bath, shower tray, toilet, basin, vanity unit, heated towel rail, door. Include minimum clearance guidance.
- **FAQ block** — e.g., "Can I plan an en-suite?", "Does it show plumbing clearances?", "Can I plan a wet room layout?" — `FAQPage` schema.

---

### 4.3 /living-room-planner

| Field | Value |
|-------|-------|
| **URL slug** | `/living-room-planner` |
| **Target keyword** | `free living room planner` |
| **Suggested H1** | `Free Living Room Planner — Arrange Your Living Space Online` |
| **Meta title** | `Free Living Room Planner — Arrange Your Space Online` (53 chars) |
| **Meta description** | `Plan your living room layout for free. Arrange sofas, tables, TV units, and shelving to scale. Export a PNG floor plan — no sign-up or download required.` (153 chars) |

**Content the page should include:**
- **Hero section** with H1 and CTA. Emphasise finding the right sofa position, TV viewing distance, and traffic flow.
- **Layout tips section** — cover common living room layouts (L-shape sofa arrangement, open-plan zoning, TV wall vs fireplace wall). This is valuable long-tail content.
- **Furniture library preview** — sofas (2-seater, 3-seater, corner), coffee table, TV unit, bookshelf, armchair, rug, side table.
- **FAQ block** — e.g., "Can I plan an open-plan living/dining room?", "Does it work for small living rooms?", "Can I try different sofa sizes?" — `FAQPage` schema.

---

### 4.4 /floor-plan-maker

| Field | Value |
|-------|-------|
| **URL slug** | `/floor-plan-maker` |
| **Target keyword** | `free floor plan maker` |
| **Suggested H1** | `Free Floor Plan Maker — Create Accurate Floor Plans Online` |
| **Meta title** | `Free Floor Plan Maker — Create Floor Plans Online` (50 chars) |
| **Meta description** | `Create accurate floor plans for free. Draw multiple rooms, add doors and windows, place furniture, and export as PNG. Perfect for renovations and new builds.` (157 chars) |

**Content the page should include:**
- **Hero section** with H1 and CTA. Position this page for users planning whole-house or multi-room layouts, not just single rooms.
- **Use cases section** — who uses floor plan makers: homeowners planning renovations, people selling a house (estate agent floor plans), tenants documenting a flat layout, architects sketching initial concepts.
- **Feature highlights** — multi-room support, accurate scale grid, door/window placement, furniture from all room categories, PNG export for sharing with builders.
- **FAQ block** — e.g., "Can I draw multiple rooms?", "Is this accurate enough for a builder?", "Can I make a floor plan of my whole house?" — `FAQPage` schema.

---

## 5. Production-Ready FAQPage Schema for Homepage

Add this as a second `<script type="application/ld+json">` block in `client/index.html`, after the existing SoftwareApplication schema:

```html
<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Free Room Planner really free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes — completely free. No account required, no credit card, no hidden fees, no ads."
      }
    },
    {
      "@type": "Question",
      "name": "Does it work on mobile?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Free Room Planner works on tablets and mobile phones."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need to install anything?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Nothing at all. Free Room Planner runs entirely in your web browser."
      }
    }
  ]
}</script>
```

---

## Summary

**Overall SEO health: Strong foundation.** The site has the fundamentals right — good title, meta description, H1, canonical URL, OG tags, structured data, pre-rendered HTML, clean robots.txt, and a comprehensive sitemap with all key pages.

**Top 3 actions to take:**
1. Add `FAQPage` schema to the homepage (quick win for rich results)
2. Fix render-blocking font stylesheets (CWV improvement)
3. Add `featureList` and `screenshot` to the SoftwareApplication schema (richer search appearance)

The sub-pages (/kitchen-planner, /bathroom-planner, etc.) already exist as static HTML files in the codebase with their own meta tags, schemas, and content. The landing page briefs above can guide content improvements on those pages.
