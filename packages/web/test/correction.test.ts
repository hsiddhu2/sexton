import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("cemetery-polish Correction section (cemetery-time, requirement 5)", () => {
  const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.kiro/specs/cemetery-polish/requirements.md"), "utf8");
  const OLD_74 =
    "4. WHILE the pointer is over the Evidence tooltip, THE Web app SHALL keep the tooltip shown, and WHEN the pointer leaves both the grave button and the tooltip, THE Web app SHALL hide the tooltip after the Grace period.";

  it("has the heading, the verbatim old criterion and the built behaviour", () => {
    expect(text).toContain("## Correction, 23 Nov 2026 (spec cemetery-time)");
    expect(text).toContain(`> ${OLD_74}`);
    expect(text).toContain("pointer-events: none");
    expect(text).toContain("Grace period still applies");
    expect(text).toContain("Escape still hides the tooltip");
  });

  it("leaves the old criterion unchanged above the Correction", () => {
    const at = text.indexOf("## Correction, 23 Nov 2026");
    expect(text.slice(0, at)).toContain(`\n${OLD_74}\n`);
  });
});
