import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Serve static .html pages from client/public/ for clean URLs
  // (mirrors production express.static({ extensions: ["html"] }))
  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl.split("?")[0];
    const publicDir = path.resolve(import.meta.dirname, "..", "client", "public");
    const htmlFile = path.join(publicDir, `${url}.html`);

    // If a matching .html file exists in public/, serve it directly
    if (!url.includes(".") && url !== "/" && fs.existsSync(htmlFile)) {
      return res.status(200).set({ "Content-Type": "text/html" })
        .end(await fs.promises.readFile(htmlFile, "utf-8"));
    }

    // Otherwise fall through to SPA
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
