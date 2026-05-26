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
for (const f of ["app.html", "embed.html", "admin.html", "get-embed.html"]) {
  copyFileSync(`${OUT}/index.html`, `${OUT}/${f}`);
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
      const html = readFileSync(p, "utf8");
      if (!html.includes(LINK)) continue;
      writeFileSync(p, html.split(LINK).join(styleTag));
      inlined += 1;
    }
  };
  walk(OUT);
}

console.log(
  `postbuild: app shells written + static homepage installed at /; inlined rs.css into ${inlined} page(s)`,
);
