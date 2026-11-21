import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const CSP_PLACEHOLDER = "<!-- sexton:csp -->";

/** Repeats the parseApiBase check (https, no credentials, query or fragment) without importing web source. */
function apiOrigin(raw: string | undefined): string | null {
  if (raw === undefined || raw === "" || raw.includes("?") || raw.includes("#")) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Build only: the dev server has no CSP because the React refresh runtime uses inline script. */
function cspPlugin(raw: string | undefined): Plugin {
  const origin = apiOrigin(raw);
  const connect = origin === null ? "'self'" : `'self' ${origin}`;
  const policy =
    `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; ` +
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

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  return {
    plugins: [react(), cspPlugin(env["VITE_SEXTON_API"])],
    define: { __SEXTON_E2E__: JSON.stringify(mode === "e2e") },
    build: { sourcemap: false, target: "es2022" },
  };
});
