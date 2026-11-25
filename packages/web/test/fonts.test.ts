// Spec cemetery-undead, task 3.3: the fonts are self-hosted with their licences, and nothing asks another origin for one (requirements 2.1, 2.3).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cspPlugin } from "../vite.config.js";

const WEB = resolve(process.cwd());
const FONTS = join(WEB, "public", "fonts");
const css = readFileSync(join(WEB, "src", "styles.css"), "utf8");

const FILES: Readonly<Record<string, string>> = {
  "pirata-one-400.woff2": "OFL-pirataone.txt",
  "im-fell-english-sc-400.woff2": "OFL-imfellenglishsc.txt",
  "im-fell-english-400-italic.woff2": "OFL-imfellenglish.txt",
  "instrument-sans-variable.woff2": "OFL-instrumentsans.txt",
};

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

describe("self-hosted fonts", () => {
  it("holds each WOFF2 file with its SIL Open Font License beside it", () => {
    for (const [font, licence] of Object.entries(FILES)) {
      const bytes = readFileSync(join(FONTS, font));
      expect(bytes.subarray(0, 4).toString("latin1"), font).toBe("wOF2");
      expect(readFileSync(join(FONTS, licence), "utf8")).toContain("SIL Open Font License, Version 1.1");
    }
  });

  it("declares one @font-face per file, pointing only at /fonts/", () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    expect(faces).toHaveLength(4);
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(Object.keys(FILES).map((f) => `"/fonts/${f}"`).sort());
    for (const face of faces) expect(face).toMatch(/font-display:\s*swap/);
  });

  it("never names a font host of another origin in src, public or index.html", () => {
    const files = [...walk(join(WEB, "src")), ...walk(join(WEB, "public")), join(WEB, "index.html")].filter((f) => /\.(ts|tsx|css|html|json|md)$/.test(f));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/fonts\.googleapis|fonts\.gstatic|use\.typekit/);
    }
    expect(existsSync(join(WEB, "index.html"))).toBe(true);
  });

  it("keeps font-src 'self' in the Content Security Policy", () => {
    const plugin = cspPlugin(undefined) as unknown as { transformIndexHtml: (html: string) => string };
    expect(plugin.transformIndexHtml("<!-- sexton:csp -->")).toContain("font-src 'self';");
  });
});
