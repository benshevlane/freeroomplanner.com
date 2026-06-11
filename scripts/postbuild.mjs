// Post-build steps for the static-homepage + SPA split, plus a critical-CSS
// inline pass for fast mobile LCP.
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const OUT = "dist/public";

// 1. The vite-built index.html is the React SPA shell — copy it to the
//    app-route files so /app, /embed, /admin, /get-embed load the SPA.
//    Each shell is otherwise byte-identical, which gave every SPA route the
//    same <title>/description/og:title as the homepage (duplicate-title and
//    duplicate-description SEO findings). After copying we give each route a
//    distinct title + description, and mark the non-landing routes
//    (/embed widget, /admin) noindex so they don't compete in search at all.
const BASE_TITLE = "Free Room Planner — Draw Your Floor Plan, No Sign-Up";
const BASE_DESC =
  "Draw an accurate floor plan in minutes. Snap-to-grid walls, 30+ furniture items, live measurements. Free, forever. No email or download required.";
const ROBOTS_INDEX =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

const SHELLS = {
  "app.html": {
    title: "Free Room Planner App — Draw & Export Floor Plans",
    desc: "Open the free Room Planner app — draw rooms to scale, drag furniture, and export a PNG floor plan. No sign-up, no download.",
    h1: "Free Room Planner App — draw and export your floor plan",
    intro: "The Free Room Planner app lets you draw rooms to scale, drag in furniture, and export a clean PNG floor plan — free, in your browser, no sign-up.",
    index: true,
  },
  "get-embed.html": {
    title: "Embed the Free Room Planner on Your Website",
    desc: "Add the free Room Planner to your site so customers can sketch their space. A simple embed for builders, fitters, and retailers.",
    h1: "Turn visitors into ready-to-quote leads by embedding Free Room Planner into your website",
    intro: "The Free Room Planner embed turns website visitors into ready-to-quote leads: customers plan their room and arrive at enquiry knowing their space.",
    index: true,
  },
  "embed.html": { title: "Free Room Planner — Embeddable Widget", desc: BASE_DESC, index: false },
  "admin.html": { title: "Free Room Planner — Admin", desc: BASE_DESC, index: false },
};

for (const [f, cfg] of Object.entries(SHELLS)) {
  copyFileSync(`${OUT}/index.html`, `${OUT}/${f}`);
  let html = readFileSync(`${OUT}/${f}`, "utf8");
  html = html
    .split(`<title>${BASE_TITLE}</title>`).join(`<title>${cfg.title}</title>`)
    .split(`content="${BASE_TITLE}"`).join(`content="${cfg.title}"`)
    .split(`content="${BASE_DESC}"`).join(`content="${cfg.desc}"`);
  if (!cfg.index) {
    html = html.split(`content="${ROBOTS_INDEX}"`).join('content="noindex, follow"');
  }
  // Give each indexable shell a unique H1 + intro (the shared pre-rendered
  // shell otherwise repeats the homepage H1 on every SPA route — duplicate-H1
  // SEO finding).
  if (cfg.h1) {
    // Inline-styled and slightly LARGER than the React-rendered hero
    // (text-3xl/4xl ≈ 2.25rem): LCP only re-assigns to a LATER element if
    // it paints strictly larger, so sizing the instant shell h1 above the
    // post-mount h1 locks LCP to the first paint (~1-2s) instead of the
    // React mount (4.5s+, the 11 Jun PSI element trace).
    html = html
      .split("<h1>Draw your room. Share your plan.</h1>")
      .join(`<h1 style="font-size:2.6rem;line-height:1.2;font-weight:700;letter-spacing:-0.02em;margin:0 0 14px">${cfg.h1}</h1>`);
    html = html
      .split("<p>A browser-based floor planner built for homeowners. Brief kitchen makers, bathroom fitters, architects, and contractors — fast.</p>")
      .join(`<p style="font-size:1.15rem;line-height:1.6">${cfg.intro}</p>`);
  }
  // Load the Vite stylesheet asynchronously. The pre-rendered shell inside
  // #root uses inline styles only, so nothing above the fold needs the app
  // CSS — but as a render-blocking <link> it delayed first paint ~2s on
  // throttled mobile (4.1s LCP on /get-embed, 10 Jun audit). preload+swap
  // paints the shell immediately; the app CSS applies before React mounts.
  html = html.replace(
    /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/,
    (_m, href) =>
      `<link rel="preload" as="style" crossorigin href="${href}" onload="this.onload=null;this.rel='stylesheet'">` +
      `<noscript><link rel="stylesheet" crossorigin href="${href}"></noscript>`,
  );
  writeFileSync(`${OUT}/${f}`, html);
}

// 2. Overwrite index.html with the static homepage so / is a fast static page
//    (must run AFTER the copies in step 1).
copyFileSync("client/home.html", `${OUT}/index.html`);

// 3. Inline rs.css into every static HTML page.
//    The static pages (home, tool landing pages, blog posts) loaded their
//    styles via a render-blocking <link rel="stylesheet" href="/rs.css">,
//    which delayed first paint / LCP on throttled mobile. Inlining the (small)
//    stylesheet removes that blocking request so the hero paints as soon as
//    the HTML arrives. The SPA shells use Vite's hashed CSS and don't contain
//    this link, so they're left untouched.
// Defer the eager Ahrefs analytics tag on static/blog pages until idle.
// The SPA shells already defer; on static pages the async script competed
// for bandwidth in the LCP window on throttled mobile (/how-it-works 2.7s,
// 10 Jun audit).
const EAGER_ANALYTICS_RE =
  /<script src="https:\/\/analytics\.ahrefs\.com\/analytics\.js" data-key="([^"]+)" async><\/script>/;
const deferredAnalytics = (key) =>
  `<script>(function(){function l(){var s=document.createElement('script');s.src='https://analytics.ahrefs.com/analytics.js';s.async=true;s.dataset.key='${key}';document.head.appendChild(s);}if('requestIdleCallback' in window){requestIdleCallback(l,{timeout:3000});}else{addEventListener('load',function(){setTimeout(l,1500);});}})()</script>`;

const LINK = '<link rel="stylesheet" href="/rs.css">';
let inlined = 0;
let rsCss = "";
try {
  rsCss = readFileSync(`${OUT}/rs.css`, "utf8");
} catch {
  console.warn("postbuild: rs.css not found — skipping critical-CSS inline");
}
if (rsCss) {
  const styleTag = `<style>\n${rsCss}\n</style>`;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.endsWith(".html")) continue;
      let html = readFileSync(p, "utf8");
      let changed = false;
      const am = html.match(EAGER_ANALYTICS_RE);
      if (am) {
        html = html.replace(EAGER_ANALYTICS_RE, deferredAnalytics(am[1]));
        changed = true;
      }
      if (html.includes(LINK)) {
        html = html.split(LINK).join(styleTag);
        inlined += 1;
        changed = true;
      }
      if (changed) writeFileSync(p, html);
    }
  };
  walk(OUT);
}

console.log(
  `postbuild: app shells written (unique titles) + static homepage installed at /; inlined rs.css into ${inlined} page(s)`,
);
