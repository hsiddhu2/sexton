// Spec cemetery-undead, task 3.3: the fonts are self-hosted with their licences, and nothing asks another origin for one (requirements 2.1, 2.3).
// Spec clean-site, task 2.3: only Inter and Cormorant Garamond ship; the interface and the canvas name labels are in
// Inter, the wordmark and headlines in Cormorant Garamond, code text in the system monospace stack (5.1 to 5.5).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cspPlugin } from "../vite.config.js";
import { CANVAS_FONTS } from "../src/hooks/use-fonts-ready.js";
import { GRAVE_GEOMETRY } from "../src/scene/layout.js";

const WEB = resolve(process.cwd());
const FONTS = join(WEB, "public", "fonts");
const css = readFileSync(join(WEB, "src", "styles.css"), "utf8");

const FILES: Readonly<Record<string, string>> = {
  "inter-variable.woff2": "OFL-inter.txt",
  "cormorant-garamond-600.woff2": "OFL-cormorantgaramond.txt",
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

  it("ships no other file in public/fonts", () => {
    expect(readdirSync(FONTS).sort()).toEqual(Object.entries(FILES).flat().sort());
  });

  it("declares one @font-face per file, pointing only at /fonts/", () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    expect(faces).toHaveLength(2);
    const families = faces.map((f) => /font-family:\s*"([^"]+)"/.exec(f)?.[1]).sort();
    expect(families).toEqual(["Cormorant Garamond", "Inter"]);
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

  it("names no removed face anywhere in src", () => {
    for (const file of walk(join(WEB, "src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/Pirata|IM Fell|Instrument Sans/);
    }
  });

  it("sets the interface in Inter, the wordmark and headlines in Cormorant Garamond, code in the system monospace stack", () => {
    const rule = (selector: string): string => {
      const m = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(css);
      return m?.[2] ?? "";
    };
    const UI = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
    const DISPLAY = '"Cormorant Garamond", Georgia, serif';
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
    const family = (body: string): string | undefined => /font-family:\s*([^;]+);/.exec(body)?.[1];
    expect(family(rule("body"))).toBe(UI);
    expect(family(rule("h1,\nh2"))).toBe(DISPLAY);
    expect(family(rule("h3,\nh4,\nh5"))).toBe(UI);
    expect(family(rule(".wordmark"))).toBe(DISPLAY);
    expect(family(rule("code,\npre,\nkbd,\nsamp"))).toBe(MONO);
    // Every other font-family names one of the three stacks.
    for (const m of css.replace(/@font-face\s*\{[^}]*\}/g, "").matchAll(/font-family:\s*([^;]+);/g)) {
      expect([UI, DISPLAY, MONO]).toContain(m[1]);
    }
  });

  it("draws the canvas name labels in Inter 600 and waits for that face", () => {
    expect(GRAVE_GEOMETRY.inscription.font).toBe("600 15px Inter, system-ui, sans-serif");
    expect(CANVAS_FONTS).toEqual(["600 15px Inter"]);
  });

  it("keeps font-src 'self' in the Content Security Policy", () => {
    const plugin = cspPlugin(undefined) as unknown as { transformIndexHtml: (html: string) => string };
    expect(plugin.transformIndexHtml("<!-- sexton:csp -->")).toContain("font-src 'self';");
  });
});
