import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 11.2: static checks on README.md (requirements 18.1, 18.2, 18.4, 19.2).
const readme = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../README.md"), "utf8");
const lines = readme.split("\n");

const HEADING = "## Sexton and Dependabot";

// Spec judge-path, Deliberate test change 4: "Try it in two minutes" comes first.
const ORIGINAL_HEADINGS: readonly string[] = [
  "## Try it in two minutes",
  "## The problem",
  "## What Sexton does",
  "## The five states",
  "## Quick start",
  "## CLI",
  "## GitHub Action",
  "## Ask Sexton from Kiro",
  "## Sexton scans itself",
  "## How Sexton is different",
  "## Replay",
  "## Roadmap",
  "## Kiro project files",
  "## Limits",
  "## Documentation",
  "## Pre-existing code",
  "## Licence",
];

const URLS: readonly string[] = [
  "https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories",
  "https://github.blog/changelog/2026-03-17-dependabot-now-detects-malware-in-npm-dependencies/",
  "https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems",
];

function section(): string {
  const start = lines.indexOf(HEADING);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("README", () => {
  it("has the Dependabot heading exactly once", () => {
    expect(lines.filter((l) => l === HEADING)).toHaveLength(1);
  });

  it("places the section after 'How Sexton is different' and before 'Roadmap'", () => {
    const h2 = lines.filter((l) => l.startsWith("## "));
    const i = h2.indexOf(HEADING);
    expect(h2[i - 1]).toBe("## How Sexton is different");
    expect(h2[i + 1]).toBe("## Replay");
    expect(h2[i + 2]).toBe("## Roadmap");
  });

  it("pins the Replay section text", () => {
    const start = lines.indexOf("## Replay");
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith("## "));
    const body = (end === -1 ? rest : rest.slice(0, end)).join("\n");
    expect(lines.filter((l) => l === "## Replay")).toHaveLength(1);
    expect(body).toContain("[?replay=axios](https://de1giv8lj8sfh.cloudfront.net/?replay=axios)");
    expect(body).toContain("[?replay=keyv](https://de1giv8lj8sfh.cloudfront.net/?replay=keyv)");
    expect(body).toContain("A replay is reconstructed from public reports. It is not a live scan.");
    expect(body).not.toContain(";");
    expect(body).not.toContain("\u2014");
  });

  it("shows docs/replay-axios.png in the Replay section with a non-empty alt text", () => {
    const start = lines.indexOf("## Replay");
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith("## "));
    const body = end === -1 ? rest : rest.slice(0, end);
    const image = body.filter((l) => /^!\[[^\]]+\]\(docs\/replay-axios\.png\)$/.test(l));
    // Spec clean-site, task 12.2 (18.2): the picture is the Replay story at Step 2, picked from "Watch a real attack"
    // and moved by "Next step" or "Play all".
    expect(image).toEqual(["![The axios replay at Step 2, when the grave turns Possessed.](docs/replay-axios.png)"]);
    expect(body.join("\n")).toContain('"Watch a real attack"');
    expect(body.join("\n")).toContain('"Next step"');
    expect(body.join("\n")).toContain('"Play all"');
  });

  it("holds the three URLs exactly", () => {
    const body = section();
    const found = [...body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
    expect(found).toEqual(URLS);
  });

  it("holds no semicolon and no em dash in the section", () => {
    const body = section();
    expect(body).not.toContain(";");
    expect(body).not.toContain("\u2014");
  });

  it("shows docs/cemetery.png with a non-empty alt text and no placeholder", () => {
    const image = lines.filter((l) => /^!\[[^\]]+\]\(docs\/cemetery\.png\)$/.test(l));
    expect(image).toEqual([
      "![The Sexton cemetery for the demo scan. Each grave is one dependency. Its shape and colour show its state.](docs/cemetery.png)",
    ]);
    expect(readme).not.toContain("Screenshot placeholder");
    expect(readme).not.toContain("arrives with the cemetery UI");
  });

  it("keeps the other section headings unchanged", () => {
    const h2 = lines.filter((l) => l.startsWith("## "));
    expect(h2.filter((h) => h !== HEADING)).toEqual(ORIGINAL_HEADINGS);
  });
});

// Spec judge-path, requirement 3: the section "Try it in two minutes", with the Guide's four steps and absolute links.
describe("README: Try it in two minutes", () => {
  const TRY = "## Try it in two minutes";
  const HOSTED = "https://de1giv8lj8sfh.cloudfront.net";
  const body = (): string => {
    const start = lines.indexOf(TRY);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith("## "));
    return (end === -1 ? rest : rest.slice(0, end)).join("\n");
  };

  it("sits once, right before The problem", () => {
    const h2 = lines.filter((l) => l.startsWith("## "));
    expect(h2.filter((h) => h === TRY)).toHaveLength(1);
    expect(h2[h2.indexOf(TRY) + 1]).toBe("## The problem");
  });

  it("lists the Guide's four steps in order", () => {
    const steps = body()
      .split("\n")
      .filter((l) => /^\d\. /.test(l));
    expect(steps.map((l) => l.slice(0, l.indexOf(".", 3) + 1))).toEqual([
      "1. Hover a grave.",
      "2. Open its drawer.",
      "3. Read the evidence and the fix.",
      "4. Replay an attack.",
    ]);
  });

  it("links the hosted site and both replays as absolute https URLs", () => {
    const found = [...body().matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
    expect(found).toEqual([HOSTED, `${HOSTED}/?replay=axios`, `${HOSTED}/?replay=keyv`]);
  });
});
