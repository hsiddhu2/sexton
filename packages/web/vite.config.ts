import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { TRACK, type Track } from "./src/music/track.js";

const CSP_PLACEHOLDER = "<!-- sexton:csp -->";

const CSP_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

/** Exported for tests. Null for an absent, invalid or path value, and for an origin that fails the pattern. */
export function apiOrigin(raw: string | undefined): string | null {
  if (raw === undefined || raw === "" || raw.startsWith("/") || raw.includes("?") || raw.includes("#")) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return CSP_ORIGIN.test(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Build only: the dev server has no CSP because the React refresh runtime uses inline script. Media is allowed from
 * the page origin only, and only while a track is set in the Track slot (spec clean-site, 14.8).
 */
export function cspPlugin(raw: string | undefined, track: Track | null = TRACK): Plugin {
  const origin = apiOrigin(raw);
  const connect = origin === null ? "'self'" : `'self' ${origin}`;
  const media = track === null ? "" : "media-src 'self'; ";
  const policy =
    `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; ${media}` +
    `connect-src ${connect}; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return {
    name: "sexton-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        CSP_PLACEHOLDER,
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

/** The pictures the Home page and its preview tags show, served at the site root from docs/ (spec home-page, 15.3). */
export const SITE_IMAGES: readonly string[] = ["cemetery.png", "replay-axios.png", "replay-keyv.png"];

function docsFile(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../../docs/${name}`, import.meta.url)));
}

/** Serves each of SITE_IMAGES from docs/ in the dev server and emits it, unchanged, into the build root. */
export function siteImagesPlugin(): Plugin {
  return {
    name: "sexton-site-images",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? "").split("?")[0]?.slice(1) ?? "";
        if (!SITE_IMAGES.includes(name)) {
          next();
          return;
        }
        res.setHeader("Content-Type", "image/png");
        res.end(docsFile(name));
      });
    },
    generateBundle() {
      for (const name of SITE_IMAGES) this.emitFile({ type: "asset", fileName: name, source: docsFile(name) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  return {
    plugins: [react(), cspPlugin(env["VITE_SEXTON_API"]), siteImagesPlugin()],
    define: { __SEXTON_E2E__: JSON.stringify(mode === "e2e") },
    build: { sourcemap: false, target: "es2022" },
  };
});
