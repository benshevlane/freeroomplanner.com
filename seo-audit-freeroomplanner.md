# SEO Audit: freeroomplanner.com — Phase 1

**Date:** 2026-03-17
**Auditor:** Automated crawl + manual analysis

---

## 1. Crawl & Analysis Results

### Pages Discovered

| URL | Exists | SSR Content | Meta Desc | Schema |
|-----|--------|-------------|-----------|--------|
| `/` (homepage) | Yes | **Minimal — likely SPA shell** | **Missing** | **Not found** |
| `/room-planner` | Yes | Yes (SSR) | Yes | WebApplication + FAQPage + Breadcrumb |
| `/kitchen-planner` | Yes | Yes (SSR) | **Missing** | WebApplication + HowTo + Breadcrumb |
| `/bathroom-planner` | Yes | Yes (SSR) | **Missing** | WebApplication + Breadcrumb |
| `/bedroom-planner` | Yes (in nav) | Not checked | Unknown | Unknown |
| `/how-it-works` | Yes | Yes (SSR) | Yes | WebApplication + Breadcrumb |
| `/blog` | Yes (in nav) | Not checked | Unknown | Unknown |
| `/living-room-planner` | **No — returns homepage shell** | No | No | No |
| `/floor-plan-maker` | **No — returns homepage shell** | No | No | No |
| `/sitemap.xml` | **Not found** | — | — | — |
| `/robots.txt` | **Not found** | — | — | — |

---

### Page-by-Page Analysis

#### Homepage (`/`)

| Element | Finding | Verdict |
|---------|---------|---------|
| **Title** | `Free Room Planner — Free Room Planning Tool` | **Weak** — redundant ("Free Room Planner" repeated), no use-case keywords, 49 chars (under limit but wastes space) |
| **Meta description** | **Missing** | **Critical gap** |
| **H1** | **Not found in raw HTML** | **Critical gap** — content likely rendered client-side only |
| **Structured data** | **None found** | **Missing** |
| **Rendering** | Only the `<title>` tag was extractable; body appears to be a JS-rendered shell (`<div id="root">` or similar) | **HIGH severity** — Googlebot may see an empty page |
| **Internal links** | **None in raw HTML** — links only render after JS executes | **Critical** for crawlability |
| **Images / alt text** | None found | N/A if page is empty pre-JS |
| **Canonical** | Not found | Missing |
| **OG tags** | Not found | Missing |

#### `/room-planner`

| Element | Finding | Verdict |
|---------|---------|---------|
| **Title** | `Free Room Planner Online — Draw Any Room \| Free Room Planner` (62 chars) | **Good** — slightly over 60 chars, may truncate the brand suffix |
| **Meta description** | `Draw accurate room floor plans in minutes. Free, no login. Drag furniture, export PNG. Perfect for briefing builders and fitters.` | **Good** — leads with benefit, ~130 chars (slightly under 140 target) |
| **H1** | `Free Room Planner: Draw Any Room in Minutes` — single H1 | **Good** |
| **Structured data** | WebApplication + FAQPage + BreadcrumbList | **Good** — but uses `WebApplication`, not `SoftwareApplication` |
| **Internal links** | Links to `/kitchen-planner`, `/bathroom-planner`, `/bedroom-planner`, `/how-it-works`, `/blog`, `/app` | **Good** — but missing `/living-room-planner`, `/floor-plan-maker` |
| **Images / alt text** | **No alt text found** | **Flag** |

#### `/kitchen-planner`

| Element | Finding | Verdict |
|---------|---------|---------|
| **Title** | `Free Kitchen Planner Online — Plan Your Kitchen Layout \| Free Room Planner` (76 chars) | **Too long** — will be truncated in SERPs |
| **Meta description** | **Missing** | **Gap** |
| **H1** | **Two H1 tags:** `Free Kitchen Planner` and `Plan Your Kitchen Layout Online` | **Issue** — should be exactly one H1 |
| **Structured data** | WebApplication + HowTo + BreadcrumbList | **Good** |
| **Internal links** | Links to `/`, `/room-planner`, `/bathroom-planner`, `/bedroom-planner`, `/how-it-works`, `/blog`, `/app` | **Good** |
| **Images / alt text** | **No alt text found** | **Flag** |

#### `/bathroom-planner`

| Element | Finding | Verdict |
|---------|---------|---------|
| **Title** | `Free Bathroom Planner Online — Design Your Bathroom Layout \| Free Room Planner` (80 chars) | **Too long** — will be truncated |
| **Meta description** | **Missing** | **Gap** |
| **H1** | `Free Bathroom Planner Design Your Bathroom Layout Online` — single H1 but very long | **Acceptable** but could be tighter |
| **Structured data** | WebApplication + BreadcrumbList | **Good** (missing HowTo/FAQ compared to other pages) |
| **Internal links** | Links to `/`, `/room-planner`, `/kitchen-planner`, `/bedroom-planner`, `/how-it-works`, `/blog`, `/app` | **Good** |
| **Images / alt text** | **No alt text found** | **Flag** |

#### `/how-it-works`

| Element | Finding | Verdict |
|---------|---------|---------|
| **Title** | `How Free Room Planner Works — Free Room Planner Guide` (54 chars) | **Good** |
| **Meta description** | `Step-by-step guide to drawing floor plans in Free Room Planner. Walls, furniture, labels, keyboard shortcuts, and export — all explained.` | **Good** — ~138 chars |
| **H1** | `How Free Room Planner Works` — single H1 | **Good** |
| **Structured data** | WebApplication + BreadcrumbList | **Good** |

---

### Sitemap (`/sitemap.xml`)

**Status: NOT FOUND**

The fetch returned the homepage shell title, indicating no dedicated sitemap.xml exists. This means search engines have no map of the site's pages and must discover them solely through crawling links.

### robots.txt (`/robots.txt`)

**Status: NOT FOUND**

The fetch returned the homepage shell title, indicating no robots.txt exists. While this means nothing is *blocked*, the absence means:
- No sitemap directive for crawlers
- No crawl guidance at all

### Core Web Vitals Proxy (Rendering Analysis)

**CRITICAL FINDING:** The homepage appears to be **entirely client-side rendered**. When fetched without JS execution, only the `<title>` tag is visible — no body content, no links, no headings. This means:

- **Googlebot's primary crawler** will see an almost-empty page
- While Google can render JS, it happens in a second pass (delayed indexing)
- All internal links on the homepage are invisible to crawlers until JS executes
- The homepage is likely the most-linked page and the entry point for crawl budget

**Sub-pages** (`/room-planner`, `/kitchen-planner`, `/bathroom-planner`, `/how-it-works`) **appear to be server-side rendered** — full content was extractable without JS. This is a positive sign but makes the homepage gap more puzzling and urgent.

---

## 2. Generated Missing Assets

### Optimised Title Tag (Homepage)

```html
<title>Free Room Planner — Design Kitchen, Bathroom & Living Room Layouts Online</title>
```
*(74 chars — slightly over 60 but front-loads "Free Room Planner" and key rooms. Alternative under 60:)*

```html
<title>Free Room Planner — Kitchen, Bathroom & Room Layouts</title>
```
*(56 chars)*

### Optimised Meta Description (Homepage)

```html
<meta name="description" content="Plan any room for free — kitchens, bathrooms, bedrooms and living rooms. Draw walls, drag furniture, and export your floor plan as PNG. No login required." />
```
*(157 chars)*

### Optimised Meta Descriptions (Sub-pages missing them)

**`/kitchen-planner`:**
```html
<meta name="description" content="Plan your kitchen layout for free. Draw walls to scale, position units and appliances, check the work triangle, then share with your fitter. No login needed." />
```
*(158 chars)*

**`/bathroom-planner`:**
```html
<meta name="description" content="Design your bathroom layout for free. Place sanitaryware, check clearances, plan door swings, and share with your plumber. No sign-up or download required." />
```
*(156 chars)*

### Optimised Title Tags (Sub-pages that are too long)

**`/kitchen-planner`:**
```html
<title>Free Kitchen Planner — Plan Your Layout Online | FRP</title>
```
*(56 chars)*

**`/bathroom-planner`:**
```html
<title>Free Bathroom Planner — Design Your Layout Online | FRP</title>
```
*(58 chars)*

### Recommended H1 (Homepage)

```html
<h1>Free Room Planner: Design Any Room Layout Online</h1>
```

### Fixed H1 (`/kitchen-planner` — merge the two H1s into one)

```html
<h1>Free Kitchen Planner — Plan Your Kitchen Layout Online</h1>
```

### SoftwareApplication JSON-LD Schema (Homepage)

```html
<script type="application/ld+json">
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
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "ratingCount": "1"
  }
}
</script>
```

> **Note:** Only include `aggregateRating` if you have real user ratings. Remove it if not — fake ratings violate Google's structured data guidelines.

### sitemap.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://freeroomplanner.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/room-planner</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/kitchen-planner</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/bathroom-planner</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/bedroom-planner</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/living-room-planner</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/floor-plan-maker</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/how-it-works</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://freeroomplanner.com/app</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
```

### robots.txt

```
User-agent: *
Allow: /

Sitemap: https://freeroomplanner.com/sitemap.xml
```

---

## 3. Prioritised Fix List

| # | Issue | Severity | What to Fix | Where to Fix It |
|---|-------|----------|-------------|-----------------|
| 1 | **Homepage is client-side rendered only** | **HIGH** | Add SSR/SSG for the homepage so crawlers see real content (H1, text, internal links) in raw HTML. At minimum, pre-render the homepage shell with static content. | Homepage route / build config (Next.js `getStaticProps`, or equivalent SSR setup) |
| 2 | **No sitemap.xml** | **HIGH** | Add the sitemap.xml provided above to the public root. Reference it in robots.txt. | `/public/sitemap.xml` |
| 3 | **No robots.txt** | **HIGH** | Add the robots.txt provided above to the public root. | `/public/robots.txt` |
| 4 | **Homepage meta description missing** | **HIGH** | Add the meta description tag provided above. | Homepage `<head>` |
| 5 | **Homepage has no H1 in raw HTML** | **HIGH** | Ensure the SSR output includes an H1 with primary keyword. | Homepage template/component |
| 6 | **Homepage has no structured data** | **MED** | Add the SoftwareApplication JSON-LD block provided above. | Homepage `<head>` |
| 7 | **`/kitchen-planner` has two H1 tags** | **MED** | Merge into a single H1. Demote the second to H2 or a `<p>` subtitle. | Kitchen planner page component |
| 8 | **`/kitchen-planner` meta description missing** | **MED** | Add the meta description provided above. | Kitchen planner `<head>` |
| 9 | **`/bathroom-planner` meta description missing** | **MED** | Add the meta description provided above. | Bathroom planner `<head>` |
| 10 | **Title tags too long** on `/kitchen-planner` (76 chars) and `/bathroom-planner` (80 chars) | **MED** | Shorten to under 60 chars using the optimised titles above. | Page `<head>` `<title>` tags |
| 11 | **`/living-room-planner` doesn't exist** | **MED** | Create this landing page (see brief below). | New page/route |
| 12 | **`/floor-plan-maker` doesn't exist** | **MED** | Create this landing page (see brief below). | New page/route |
| 13 | **No internal links to `/living-room-planner` or `/floor-plan-maker`** | **MED** | Add these to the navigation and to cross-link sections on existing pages. | Nav component + page content |
| 14 | **No canonical tags detected** | **MED** | Add `<link rel="canonical" href="...">` to every page. | All page `<head>` sections |
| 15 | **No Open Graph / Twitter Card tags** | **MED** | Add OG title, description, image, and Twitter card meta tags to all pages. | All page `<head>` sections |
| 16 | **Schema uses `WebApplication` not `SoftwareApplication`** | **LOW** | Both are valid but `SoftwareApplication` gives richer SERP features. Update existing schema on sub-pages. | JSON-LD blocks on all pages |
| 17 | **No image alt text anywhere** | **LOW** | Add descriptive alt attributes to all images (screenshots, icons, illustrations). | All `<img>` tags site-wide |
| 18 | **Homepage title is repetitive** | **LOW** | Replace with the optimised title provided above. | Homepage `<title>` tag |
| 19 | **`/bathroom-planner` missing FAQPage schema** | **LOW** | Add FAQPage JSON-LD matching the FAQ section content (kitchen planner already has HowTo). | Bathroom planner JSON-LD |
| 20 | **Meta description on `/room-planner` is 130 chars** | **LOW** | Extend to 140–160 chars to use full SERP space. | `/room-planner` `<head>` |

---

## 4. Landing Page Briefs

### `/living-room-planner`

| Field | Value |
|-------|-------|
| **URL slug** | `/living-room-planner` |
| **Target keyword** | `free living room planner` (secondary: `living room layout tool`, `living room design online`) |
| **H1** | `Free Living Room Planner — Arrange Your Living Room Online` |
| **Meta title** | `Free Living Room Planner — Layout & Design Tool Online` (55 chars) |
| **Meta description** | `Plan your living room layout for free. Arrange sofas, tables, and TV units to scale, test different configurations, and share your design. No sign-up needed.` (158 chars) |

**Content the page should contain:**
- **Hero section** with H1, a short intro paragraph (what the tool does, who it's for — homeowners rearranging furniture, people moving house), and a prominent CTA to `/app`
- **3-step how-it-works section** (Draw your room → Add furniture → Export and share) with H3 subheadings — mirroring the pattern on `/kitchen-planner` and `/bathroom-planner`
- **Feature cards** highlighting living-room-specific capabilities: sofa and TV distance planning, traffic flow visualisation, rug/coffee table placement, natural light and window positioning
- **Living room layout tips section** (H2) with 4–5 planning tips: the conversation zone, TV viewing distances, traffic paths between doors, balancing symmetry, and choosing a focal point. This gives the page topical depth for long-tail queries
- **FAQ section** (with FAQPage schema) covering: "What size living room do I need for an L-shaped sofa?", "How far should the TV be from the sofa?", "How do I plan an open-plan living/dining room?"
- **Cross-links** to `/kitchen-planner`, `/bathroom-planner`, `/bedroom-planner`, `/room-planner`

---

### `/bathroom-planner` (already exists — no new page needed)

*(Included above in the fix list for meta description and schema improvements.)*

---

### `/kitchen-planner` (already exists — no new page needed)

*(Included above in the fix list for dual-H1, meta description, and title length.)*

---

### `/floor-plan-maker`

| Field | Value |
|-------|-------|
| **URL slug** | `/floor-plan-maker` |
| **Target keyword** | `free floor plan maker` (secondary: `floor plan creator online`, `draw floor plan free`) |
| **H1** | `Free Floor Plan Maker — Draw Accurate Floor Plans Online` |
| **Meta title** | `Free Floor Plan Maker — Create Floor Plans Online` (51 chars) |
| **Meta description** | `Create detailed floor plans for free. Draw walls, doors, and windows to scale, add furniture, then export as PNG to share with builders. No download or login.` (159 chars) |

**Content the page should contain:**
- **Hero section** with H1, intro targeting people who need a full-home or multi-room floor plan (estate agents, homeowners planning renovations, people selling a property), and CTA to `/app`
- **3-step how-it-works section** (Measure → Draw → Export) keeping consistency with other landing pages
- **Feature cards** specific to floor plans: multi-room layout support, door and window placement, accurate measurements and dimensions, room area calculations, PNG export for builders
- **Use-case section** (H2) explaining who benefits: renovation planning, estate agent floor plans, insurance documentation, interior design briefs, planning permission sketches
- **FAQ section** (with FAQPage schema) covering: "Is this floor plan maker really free?", "Can I draw multiple rooms on one plan?", "How accurate are the measurements?", "Can I share my floor plan with a builder?"
- **Cross-links** to `/room-planner`, `/kitchen-planner`, `/bathroom-planner`, `/living-room-planner`

---

### `/bedroom-planner` (brief — page exists but not fully audited)

| Field | Value |
|-------|-------|
| **URL slug** | `/bedroom-planner` (already exists) |
| **Target keyword** | `free bedroom planner` |
| **H1** | `Free Bedroom Planner — Design Your Bedroom Layout Online` |
| **Meta title** | `Free Bedroom Planner — Layout & Design Tool Online` (52 chars) |
| **Meta description** | `Plan your bedroom layout for free. Position your bed, wardrobes, and bedside tables to scale, check door clearances, and share your design. No login required.` (159 chars) |

**Content the page should contain (verify against what exists):**
- Hero + CTA matching the site pattern
- 3-step how-it-works
- Bedroom-specific features: bed size guide, wardrobe door clearances, bedside table positioning, window/radiator avoidance
- Bedroom layout tips: bed placement relative to windows and doors, walk-around clearances (minimum 60 cm), fitted wardrobe vs. freestanding planning
- FAQ section with FAQPage schema
- Cross-links to other planner pages

---

## Summary of Top 5 Actions (in priority order)

1. **Fix homepage rendering** — SSR/pre-render the homepage so Google sees content, H1, links, and schema in raw HTML
2. **Add `sitemap.xml` and `robots.txt`** — drop the files above into the public root
3. **Add missing meta descriptions** — homepage, `/kitchen-planner`, `/bathroom-planner`
4. **Create `/living-room-planner` and `/floor-plan-maker`** — new landing pages to capture high-intent keywords
5. **Fix `/kitchen-planner` dual-H1 and shorten long title tags** — quick wins for existing pages
