import { render } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PrPreview } from "../src/drawer/PrPreview.js";
import { arbHostile } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

const FRAGMENTS = [
  "[", "]", "(", ")", "](", "[x](", "https://", "http://", "HTTPS://", "javascript:", "//", "data:", " ", "\t", "\n",
  "\u0000", "`", "**", "|", "|---|", "# ", "## ", "- ", "1. ", "> ", "---", "<script>", "<img src=x>", "a", "https://ok.example/x",
] as const;
const arbSource = fc.oneof(
  fc.array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 6 })), { maxLength: 30 }).map((p) => p.join("")),
  arbHostile,
);

describe("Feature: cemetery-polish, Property 10: The rendered preview holds only safe elements", () => {
  it("renders no unsafe element and only https anchors", () => {
    fc.assert(
      fc.property(arbSource, (source) => {
        const { container, unmount } = render(<PrPreview source={source} />);
        try {
          expect(container.querySelector("script,img,iframe,svg,style,object")).toBeNull();
          for (const el of Array.from(container.querySelectorAll("[href],[src]"))) {
            expect(el.tagName).toBe("A");
            expect(el.getAttribute("href")?.startsWith("https://")).toBe(true);
            expect(el.getAttribute("target")).toBe("_blank");
            expect(el.getAttribute("rel")).toBe("noopener noreferrer");
            expect(el.hasAttribute("src")).toBe(false);
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe("PrPreview", () => {
  const bodies = (readDemoScan() as { remediations: { packageName: string; prBody: string }[] }).remediations;
  const body = (name: string): string => bodies.find((r) => r.packageName === name)?.prBody ?? "";

  it("renders the lodash body with headings, one table of 11 rows, a rule and no pre", () => {
    const { container } = render(<PrPreview source={body("lodash")} />);
    expect(container.querySelector("h4")).not.toBeNull();
    expect(container.querySelector("h5")).not.toBeNull();
    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(container.querySelectorAll("tr")).toHaveLength(11);
    expect(container.querySelector("thead")).not.toBeNull();
    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("[role=region]")?.getAttribute("aria-label")).toBe("Table 1");
  });

  it("renders a block quote for a Possessed body", () => {
    const possessed = bodies.find((r) => r.prBody.includes("> **Warning:**"));
    expect(possessed).toBeDefined();
    const { container } = render(<PrPreview source={possessed?.prBody ?? ""} />);
    expect(container.querySelector("blockquote")).not.toBeNull();
  });
});
