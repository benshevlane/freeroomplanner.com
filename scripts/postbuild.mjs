// Post-build steps for the static-homepage + SPA split.
// 1. The vite-built index.html is the React SPA shell — copy it to the
//    app-route files so /app, /embed, /admin, /get-embed load the SPA.
// 2. Overwrite index.html with the static homepage so / is a fast static
//    page (must run AFTER the copies in step 1).
import { copyFileSync } from "node:fs";

const OUT = "dist/public";
for (const f of ["app.html", "embed.html", "admin.html", "get-embed.html"]) {
  copyFileSync(`${OUT}/index.html`, `${OUT}/${f}`);
}
copyFileSync("client/home.html", `${OUT}/index.html`);
console.log("postbuild: app shells written + static homepage installed at /");
