import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { Header, type HeaderProps } from "../src/header/Header.js";
import { SiteFooter } from "../src/home/SiteFooter.js";
import { EXAMPLES } from "../src/header/examples.js";
import { REPO_INPUT_HINT } from "../src/header/repo-input.js";
import { SAMPLE_TAG, scanTag } from "../src/header/scan-tag.js";
import { HOSTED_UNAVAILABLE_TEXT } from "../src/load/use-scan-loader.js";
import type { Popover } from "../src/load/screen-state.js";
import { failingRulesText } from "../src/header/failing-rules-text.js";
import { headerModel } from "../src/header/header-model.js";
import { scanTimeView } from "../src/header/format-scan-time.js";
import { arbHeaderResponse, arbHostilePair, cheapScan, mapFreeText } from "./arbitraries.js";

afterEach(cleanup);

const noop = (): void => undefined;

/** The header with its Pop-over held as the screen state holds it. */
function HeaderHarness(props: Partial<HeaderProps>) {
  const [popover, setPopover] = useState<Popover>("none");
  return (
    <Header
      tag={SAMPLE_TAG}
      theme="dark"
      apiConfigured={true}
      popover={popover}
      onPopover={setPopover}
      onScan={noop}
      onHome={noop}
      onGuide={noop}
      onTour={noop}
      {...props}
    />
  );
}

// Spec clean-site, task 3: the scan time, the policy line and the evidence links moved from the header to the site
// footer (16.12), so the model's values are checked there.
function renderFooter(response: ScanResponse, isDemo: boolean) {
  return render(<SiteFooter model={headerModel(response, isDemo)} />);
}

describe("Property 14: Header values follow the response exactly", () => {
  it("Feature: cemetery-ui, Property 14: Header values follow the response exactly", () => {
    fc.assert(
      fc.property(arbHeaderResponse, ({ response, isDemo }) => {
        const model = headerModel(response, isDemo);
        const scan = response.report.scan;
        const unlocked = scan !== undefined && (scan.unlocked || scan.unlockedPackages.length > 0);
        expect(model.unlockedNotice !== null).toBe(unlocked);
        if (model.unlockedNotice !== null && scan !== undefined) {
          expect(model.unlockedNotice).toContain("unlocked");
          if (!scan.unlocked) {
            const n = scan.unlockedPackages.length;
            for (const name of scan.unlockedPackages.slice(0, 20)) expect(model.unlockedNotice).toContain(name);
            if (n > 20) expect(model.unlockedNotice.endsWith(`and ${String(n - 20)} more`)).toBe(true);
            else expect(model.unlockedNotice).not.toContain(" more");
          }
        }
        expect(model.cappedNotice !== null).toBe(scan?.capped === true);
        if (model.cappedNotice !== null && scan !== undefined) {
          expect(model.cappedNotice).toContain(String(response.report.packages.length));
          expect(model.cappedNotice).toContain(String(scan.totalDirect));
        }
        expect(model.policyStatus).toBe(response.policy.pass ? "pass" : "fail");
        expect(model.policyLabel).toBe(response.policy.source === "default" ? "default policy" : "policy file");
        expect(model.failingRules).toBe(response.policy.rules.filter((r) => !r.pass).length);
        expect(model.scanTime).toBe(response.report.generatedAt);
        expect(model.repoText).toBe(scan === undefined ? "no scan metadata in this response" : scan.repo.url);
        expect(model.demoLabel).toBe(isDemo ? "demo fixture, recorded data" : null);

        const { container, unmount } = renderFooter(response, isDemo);
        const text = container.textContent ?? "";
        expect(text).toContain(scanTimeView(model.scanTime).text);
        expect(text).toContain(`policy: ${model.policyStatus}, ${model.policyLabel}, ${failingRulesText(model.failingRules)}`);
        // The repository and the Fixture name are never shown (1.7).
        expect(text).not.toContain("sexton-demo/fixture");
        // Spec evidence-pack: the only links are the two evidence links, with fixed demo addresses here.
        const links = [...container.querySelectorAll("a")];
        if (isDemo) {
          expect(links.map((a) => [a.getAttribute("href"), a.textContent, a.hasAttribute("download")])).toEqual([
            ["/demo/evidence.json", "Evidence JSON", true],
            ["/demo/evidence.md", "Evidence Markdown", true],
          ]);
        } else expect(links).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

function tags(root: Element): string[] {
  return [...root.querySelectorAll("*")].map((el) => el.tagName);
}

function view(response: ScanResponse): { header: string[]; overlay: string[]; drawer: string[]; drawerLinks: (string | null)[]; preview: string[]; previewLinks: (string | null)[]; text: string } {
  const h = renderFooter(response, false);
  const header = tags(h.container);
  const headerText = h.container.textContent ?? "";
  h.unmount();
  const c = render(<Cemetery response={response} theme="light" reducedMotion={true} />);
  const overlay = tags(c.container);
  const first = c.container.querySelector<HTMLButtonElement>("button[data-grave-index]");
  let drawer: string[] = [];
  let drawerLinks: (string | null)[] = [];
  let preview: string[] = [];
  let previewLinks: (string | null)[] = [];
  let drawerText = "";
  if (first !== null) {
    fireEvent.click(first);
    const dialog = screen.getByRole("dialog");
    const previewEl = dialog.querySelector(".pr-preview");
    if (previewEl !== null) {
      preview = tags(previewEl);
      previewLinks = [...previewEl.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    }
    const clone = dialog.cloneNode(true) as Element;
    clone.querySelector(".pr-preview")?.remove();
    // Spec clean-site, 7.2: a signal's https source is a link; every other element is checked as before.
    drawerLinks = [...clone.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    drawer = tags(clone).filter((t) => t !== "A");
    drawerText = dialog.textContent ?? "";
  }
  c.unmount();
  return { header, overlay, drawer, drawerLinks, preview, previewLinks, text: headerText + drawerText };
}

describe("Property 22: Untrusted strings are rendered only as text", () => {
  it("Feature: cemetery-ui, Property 22: Untrusted strings are rendered only as text", () => {
    fc.assert(
      fc.property(arbHostilePair, ({ response, prefix }) => {
        const plain = view(response);
        const hostile = view(mapFreeText(response, (s) => `${prefix}${s}`));
        expect(hostile.header).toEqual(plain.header);
        expect(hostile.overlay).toEqual(plain.overlay);
        expect(hostile.drawer).toEqual(plain.drawer);
        for (const bad of ["SCRIPT", "IMG", "A", "IFRAME", "SVG"]) {
          expect(hostile.header.includes(bad) && !plain.header.includes(bad)).toBe(false);
          expect(hostile.drawer.includes(bad)).toBe(false);
          if (bad !== "A") expect(hostile.preview.includes(bad)).toBe(false);
        }
        for (const href of [...hostile.previewLinks, ...hostile.drawerLinks]) expect(href?.startsWith("https://") ?? false).toBe(true);
        expect(hostile.drawerLinks.length).toBeLessThanOrEqual(plain.drawerLinks.length);
        // The scan tag of a Live scan shows its repository as text only.
        const repo = response.report.scan?.repo.url;
        if (repo !== undefined) {
          const tag = scanTag({ kind: "repo", url: `${prefix}${repo}` });
          const shown = render(<HeaderHarness tag={tag} />);
          expect(shown.container.querySelector(".scan-tag")?.textContent).toBe(tag);
          expect(tags(shown.container).filter((t) => t === "SCRIPT" || t === "IMG" || t === "IFRAME")).toEqual([]);
          shown.unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Header (spec clean-site, requirement 1)", () => {
  it("orders the wordmark, the scan tag, the Scan field and Scan, then What is Sexton?, Legend and Tour, with no Music button", () => {
    const { container } = render(<HeaderHarness />);
    const header = container.querySelector("header") as HTMLElement;
    const controls = [...header.querySelectorAll<HTMLElement>("a[href], button, input")];
    expect(controls.map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim())).toEqual([
      "Sexton, back to the cemetery",
      "GitHub repository to scan",
      "Scan",
      "What is Sexton?",
      "Legend",
      "Tour",
    ]);
    expect(header.querySelector(".scan-tag")?.textContent).toBe("Sample scan");
    // The tag sits between the wordmark and the field.
    expect(header.querySelector(".wordmark")?.nextElementSibling?.querySelector(".scan-tag")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Music" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sound/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Serious mode" })).toBeNull();
    expect((screen.getByRole("link", { name: "Sexton, back to the cemetery" }) as HTMLAnchorElement).getAttribute("href")).toBe("/");
  });

  it("names the tag for each Source and never shows the Fixture name (1.5 to 1.7, 1.16, 1.17)", () => {
    expect(scanTag({ kind: "demo" })).toBe("Sample scan");
    expect(scanTag({ kind: "replay", id: "axios" })).toBe("Replay");
    expect(scanTag({ kind: "scan", address: "/x.json" })).toBe("Scan file");
    expect(scanTag({ kind: "repo", url: "https://github.com/expressjs/express" })).toBe("expressjs/express");
    expect(scanTag({ kind: "rejected" })).toBeNull();
    const { container } = render(<HeaderHarness tag={null} />);
    expect(container.querySelector(".scan-tag")).toBeNull();
  });

  it("takes the Home action on a plain press of the wordmark and follows the link on a modified press", () => {
    const onHome = vi.fn();
    render(<HeaderHarness onHome={onHome} />);
    const link = screen.getByRole("link", { name: "Sexton, back to the cemetery" });
    expect(fireEvent.click(link, { button: 0 })).toBe(false);
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(fireEvent.click(link, { button: 0, metaKey: true })).toBe(true);
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("disables the field and Scan, described by the exact text, when no API base is configured (1.13)", () => {
    render(<HeaderHarness apiConfigured={false} />);
    const field = screen.getByRole("textbox", { name: "GitHub repository to scan" }) as HTMLInputElement;
    expect(field.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Scan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(HOSTED_UNAVAILABLE_TEXT);
    expect(HOSTED_UNAVAILABLE_TEXT).toBe("Scanning is off in this build.");
  });

  it("starts a Live scan of the canonical URL for owner/name or a link (1.11)", () => {
    const onScan = vi.fn();
    render(<HeaderHarness onScan={onScan} />);
    const field = screen.getByRole("textbox", { name: "GitHub repository to scan" });
    fireEvent.change(field, { target: { value: " https://github.com/expressjs/express.git " } });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(onScan).toHaveBeenCalledWith("https://github.com/expressjs/express");
    fireEvent.change(field, { target: { value: "facebook/react" } });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(onScan).toHaveBeenLastCalledWith("https://github.com/facebook/react");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("marks the field, keeps focus in it, sends nothing and shows the hint for any other input (1.12)", () => {
    const onScan = vi.fn();
    render(<HeaderHarness onScan={onScan} fieldRef={{ current: null }} />);
    const field = screen.getByRole("textbox", { name: "GitHub repository to scan" });
    field.focus();
    fireEvent.change(field, { target: { value: "not a repo" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onScan).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(REPO_INPUT_HINT);
    expect(REPO_INPUT_HINT).toBe("Enter a repo as owner/name, or paste a github.com link.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field);
  });

  it("shows the three examples under Try one on focus, and an example fills the field and starts its scan (1.9, 1.10)", () => {
    const onScan = vi.fn();
    const { container } = render(<HeaderHarness onScan={onScan} />);
    expect(container.querySelector(".examples")).toBeNull();
    const field = screen.getByRole("textbox", { name: "GitHub repository to scan" }) as HTMLInputElement;
    fireEvent.focus(field);
    const list = container.querySelector(".examples") as HTMLElement;
    expect(list.querySelector(".pop-heading")?.textContent).toBe("Try one");
    expect([...list.querySelectorAll(".example")].map((b) => [b.querySelector(".example-repo")?.textContent, b.querySelector(".example-note")?.textContent])).toEqual([
      ["hsiddhu2/sexton-demo", "pull requests work here"],
      ["expressjs/express", "a popular web framework"],
      ["facebook/react", "a large repo"],
    ]);
    expect(EXAMPLES).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /^expressjs\/express/ }));
    expect(field.value).toBe("expressjs/express");
    expect(onScan).toHaveBeenCalledWith("https://github.com/expressjs/express");
  });

  it("keeps the legend closed at load and lists the contents as a Pop-over when opened", () => {
    const { container } = render(<HeaderHarness />);
    const toggle = screen.getByRole("button", { name: "Legend" });
    const panel = container.querySelector("#legend-panel") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains("pop")).toBe(true);
    for (const state of ["Possessed", "Dead", "Haunted", "Restless", "Alive"]) expect(panel.textContent).toContain(state);
    expect(panel.textContent).toContain("one or more advisories");
    expect(panel.querySelectorAll("svg").length).toBe(8);
    fireEvent.click(toggle);
    expect(panel.hidden).toBe(true);
  });
});

describe("site footer and header model", () => {
  it("states that no lockfile exists for an unlocked scan", () => {
    const response = cheapScan(1);
    (response.report as unknown as Record<string, unknown>)["scan"] = {
      repo: { owner: "o", repo: "r", url: "https://github.com/o/r" },
      unlocked: true,
      unlockedPackages: [],
      lockfileVersion: null,
      capped: true,
      totalDirect: 400,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    };
    const model = headerModel(response, false);
    expect(model.unlockedNotice).toBe("unlocked scan: no lockfile exists, so versions were resolved from declared ranges");
    expect(model.cappedNotice).toBe("capped: showing 1 of 400 direct dependencies");
  });

  it("shows the scan time in a time element", () => {
    const { container } = renderFooter(cheapScan(1), false);
    expect(container.textContent).toContain("12 Nov 2026, 00:00 UTC");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("Header failing rules text", () => {
  it("pluralises 0, 1 and 2 failing rules", () => {
    expect(failingRulesText(0)).toBe("0 failing rules");
    expect(failingRulesText(1)).toBe("1 failing rule");
    expect(failingRulesText(2)).toBe("2 failing rules");
    const { container } = renderFooter(cheapScan(1), false);
    const model = headerModel(cheapScan(1), false);
    expect(container.querySelector(".footer-policy")?.textContent).toContain(failingRulesText(model.failingRules));
  });
});

// Spec evidence-pack, Requirements 8.2 and 8.3.
describe("evidence links", () => {
  it("builds hosted links from the canonical repository URL, encoded, only for a hosted load with scan metadata", () => {
    fc.assert(
      fc.property(arbHeaderResponse, fc.constantFrom("/api", "https://api.example.test/api"), ({ response }, base) => {
        const model = headerModel(response, false, base);
        const scan = response.report.scan;
        if (scan === undefined) {
          expect(model.evidenceLinks).toBeNull();
          return;
        }
        const repo = encodeURIComponent(scan.repo.url);
        expect(model.evidenceLinks).toEqual({
          json: `${base}/evidence?repo=${repo}&format=json`,
          markdown: `${base}/evidence?repo=${repo}&format=md`,
        });
        expect(headerModel(response, false).evidenceLinks).toBeNull();
        expect(headerModel(response, true, base).evidenceLinks).toEqual({ json: "/demo/evidence.json", markdown: "/demo/evidence.md" });
      }),
      { numRuns: 100 },
    );
  });

  it("renders the links after the policy line with download links", () => {
    const { container } = render(<SiteFooter model={headerModel(cheapScan(1), true)} />);
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["Evidence JSON", "Evidence Markdown"]);
    for (const a of links) expect(a.hasAttribute("download")).toBe(true);
    expect(links[0]?.previousElementSibling?.classList.contains("footer-policy")).toBe(true);
  });
});

// Fix after review of cemetery-time-fixes: a replay names itself and hides the policy line, every other scan keeps both.
describe("replay footer text", () => {
  it("hides the policy line for a replay and keeps it without one", () => {
    const base = cheapScan(1);
    const replay = { ...base, replay: { id: "axios" as const, title: "Replay: axios npm compromise, 31 March 2026", summary: "s", sources: [{ label: "l", url: "https://example.com/" }], steps: [], why: "w" } };
    const withReplay = headerModel(replay, false);
    expect(withReplay.repoText).toBe("Replay: axios npm compromise, 31 March 2026");
    expect(withReplay.showPolicy).toBe(false);
    const plain = headerModel(base, false);
    expect(plain.repoText).not.toBe("Replay: axios npm compromise, 31 March 2026");
    expect(plain.repoText).toMatch(/^(https:\/\/github\.com\/|no scan metadata in this response$)/);
    expect(plain.showPolicy).toBe(true);
    const shown = render(<SiteFooter model={withReplay} />);
    expect(shown.container.querySelector(".footer-policy")).toBeNull();
    shown.unmount();
    const kept = render(<SiteFooter model={plain} />);
    expect(kept.container.querySelector(".footer-policy")?.textContent).toMatch(/^policy: (pass|fail), /);
    kept.unmount();
  });
});

// Spec cemetery-undead, 10.3: the Legend names each Form in words.
describe("Legend form words", () => {
  it("describes each Form next to its State", () => {
    render(<HeaderHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    const panel = document.getElementById("legend-panel")?.textContent ?? "";
    for (const words of [
      "Possessed: open grave, a devil zombie dancing out",
      "Dead: cracked stone, a skeleton lounging",
      "Haunted: cross",
      "Restless: tilted stone, a hand clawing out",
      "Alive: rounded stone with a party hat",
    ]) expect(panel).toContain(words);
    expect(document.querySelectorAll(".legend-chip")).toHaveLength(8);
  });
});
