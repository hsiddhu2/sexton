import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMarkdown, plainText, type Block, type Inline } from "../src/drawer/markdown.js";
import { readDemoScan } from "./support/demo-scan.js";

function collectLinks(blocks: readonly Block[]): Extract<Inline, { kind: "link" }>[] {
  const found: Extract<Inline, { kind: "link" }>[] = [];
  const walk = (nodes: readonly Inline[]): void => {
    for (const node of nodes) {
      if (node.kind === "link") found.push(node);
      else if (node.kind === "bold") walk(node.children);
    }
  };
  for (const b of blocks) {
    if (b.kind === "heading" || b.kind === "paragraph" || b.kind === "quote") walk(b.children);
    else if (b.kind === "list") b.items.forEach(walk);
    else if (b.kind === "table") [b.header, ...b.rows].forEach((row) => row.forEach(walk));
  }
  return found;
}

const FRAGMENTS = [
  "[", "]", "(", ")", "](", "[x](", "https://", "http://", "HTTPS://", "javascript:", "//", "data:", " ", "\t", "\n",
  "\u0000", "\u0085", "\u2028", "`", "**", "|", "a", "example.com/p", "https://ok.example/x", "\u00a0",
] as const;
const arbFragments = fc.array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 6 })), { maxLength: 30 }).map((p) => p.join(""));

describe("Feature: cemetery-polish, Property 6: Markdown links are https only", () => {
  it("every link href starts with https:// and holds no white space", () => {
    fc.assert(
      fc.property(arbFragments, (s) => {
        for (const link of collectLinks(parseMarkdown(s))) {
          expect(link.href.startsWith("https://")).toBe(true);
          expect(/\s/u.test(link.href)).toBe(false);
          expect([...link.href].some((c) => c.charCodeAt(0) <= 0x1f || (c.charCodeAt(0) >= 0x7f && c.charCodeAt(0) <= 0x9f))).toBe(false);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("keeps a valid https link and drops a javascript link to its text", () => {
    const good = collectLinks(parseMarkdown("[a](https://ok.example/x)"));
    expect(good).toEqual([{ kind: "link", href: "https://ok.example/x", text: "a" }]);
    const bad = parseMarkdown("[a](javascript:alert(1))");
    expect(collectLinks(bad)).toHaveLength(0);
    expect(plainText(bad)).toBe("a)");
  });
});

const CHARS_7 = [..."abcXYZ019 .,;:!?'\"@/_"];
const arbLine7 = fc
  .array(fc.constantFrom(...CHARS_7), { minLength: 1, maxLength: 20 })
  .map((c) => c.join(""))
  .filter((l) => l.trim() !== "" && !/^\d+\./.test(l));

describe("Feature: cemetery-polish, Property 7: Text without constructs is preserved", () => {
  it("plainText equals the input", () => {
    fc.assert(
      fc.property(fc.array(fc.array(arbLine7, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 4 }), (paragraphs) => {
        const s = paragraphs.map((p) => p.join("\n")).join("\n\n");
        expect(plainText(parseMarkdown(s))).toBe(s);
      }),
      { numRuns: 100 },
    );
  });
});

const ALPHABET_8 = [..."abzAZ059 \n#->|*`\\"];
const wordChars = (s: string): string => [...s.replace(/[^\p{L}\p{N}]/gu, "")].sort().join("");

describe("Feature: cemetery-polish, Property 8: Parsing is total and drops no word characters", () => {
  it("never throws on any string", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.fullUnicodeString(), arbFragments), (s) => {
        expect(() => parseMarkdown(s)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("keeps every letter and digit over the restricted alphabet", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ALPHABET_8), { maxLength: 80 }).map((c) => c.join("")), (s) => {
        expect(wordChars(plainText(parseMarkdown(s)))).toBe(wordChars(s));
      }),
      { numRuns: 100 },
    );
  });

  it("parses 60,000 characters of unmatched markers in under a second", () => {
    for (const unit of ["**`[", "[[", "**", "`", "[a](", "[a](b"]) {
      const body = unit.repeat(Math.ceil(60000 / unit.length)).slice(0, 60000);
      const started = performance.now();
      parseMarkdown(body);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});

// A mirror of escapeField in packages/engine/src/remediation/escape-field.ts. Web must not import the engine.
function mirrorEscape(value: string): string {
  const neutral = value
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd")
    .replace(/[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/gu, " ");
  const units = Array.from(neutral.replace(/`/g, "'")).map((ch) => (ch === "|" ? "\\|" : ch));
  let total = 0;
  let kept = "";
  let cut = false;
  for (const unit of units) {
    const cost = unit === "\\|" ? 2 : 1;
    if (total + cost > 200) {
      cut = true;
      break;
    }
    total += cost;
    kept += unit;
  }
  if (cut) kept += "\u2026";
  return `\`${kept.length === 0 ? " " : kept}\``;
}

describe("Feature: cemetery-polish, Property 9: Escaped fields render as their literal characters", () => {
  it("an escaped table cell is one code node with the literal text", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 40 }), fc.fullUnicodeString({ maxLength: 40 }), fc.string({ minLength: 190, maxLength: 260 })), (v) => {
        const escaped = mirrorEscape(v);
        const blocks = parseMarkdown(`| h | h |\n|---|---|\n| ${escaped} | x |`);
        const table = blocks[0];
        expect(table?.kind).toBe("table");
        if (table?.kind !== "table") return;
        const cell = table.rows[0]?.[0] ?? [];
        expect(cell).toEqual([{ kind: "code", text: escaped.slice(1, -1).split("\\|").join("|") }]);
        expect(table.rows[0]).toHaveLength(2);
      }),
      { numRuns: 100 },
    );
  });

  it("a string without a backtick, wrapped in backticks, is one code node", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }).filter((s) => !/[`\n]/.test(s)), (s) => {
        const blocks = parseMarkdown(`\`${s}\``);
        expect(blocks).toEqual([{ kind: "paragraph", children: [{ kind: "code", text: s }] }]);
      }),
      { numRuns: 100 },
    );
  });
});

describe("markdown constructs", () => {
  it("reads headings and leaves ### as text", () => {
    const blocks = parseMarkdown("# One\n\n## Two\n\n### Three");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ kind: "heading", level: 2 });
    expect(blocks[2]).toMatchObject({ kind: "paragraph" });
    expect(plainText([blocks[2] as Block])).toBe("### Three");
  });

  it("reads a table with its separator and a ragged row", () => {
    const blocks = parseMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n| only |");
    const t = blocks[0];
    expect(t?.kind).toBe("table");
    if (t?.kind !== "table") return;
    expect(t.header).toHaveLength(2);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[1]).toHaveLength(1);
  });

  it("reads lists, ordered start, quote, rule, bold, code and links", () => {
    expect(parseMarkdown("- a\n- b")[0]).toMatchObject({ kind: "list", ordered: false });
    expect(parseMarkdown("3. a\n4. b")[0]).toMatchObject({ kind: "list", ordered: true, start: 3 });
    expect(parseMarkdown("> **Warning:** x")[0]).toMatchObject({ kind: "quote" });
    expect(parseMarkdown("---")[0]).toEqual({ kind: "rule" });
    expect(parseMarkdown("**b** `**c**`")[0]).toEqual({
      kind: "paragraph",
      children: [{ kind: "bold", children: [{ kind: "text", text: "b" }] }, { kind: "text", text: " " }, { kind: "code", text: "**c**" }],
    });
  });

  it("parses every demo pull request body into a 4 column table with 12 rows and no link", () => {
    const scan = readDemoScan() as { remediations?: { prBody: string }[] };
    expect((scan.remediations ?? []).length).toBeGreaterThan(0);
    for (const r of scan.remediations ?? []) {
      const blocks = parseMarkdown(r.prBody);
      const table = blocks.find((b) => b.kind === "table");
      expect(table?.kind).toBe("table");
      if (table?.kind !== "table") continue;
      expect(table.header).toHaveLength(4);
      expect(table.rows).toHaveLength(12);
      for (const row of table.rows) expect(row).toHaveLength(4);
      expect(collectLinks(blocks)).toHaveLength(0);
    }
  });
});
