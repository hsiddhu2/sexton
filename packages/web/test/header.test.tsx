import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { Header } from "../src/header/Header.js";
import { failingRulesText } from "../src/header/failing-rules-text.js";
import { headerModel } from "../src/header/header-model.js";
import { scanTimeView } from "../src/header/format-scan-time.js";
import { arbHeaderResponse, arbHostilePair, cheapScan, mapFreeText } from "./arbitraries.js";

afterEach(cleanup);

const noSubmit = (): string | null => null;

function renderHeader(response: ScanResponse, isDemo: boolean, apiConfigured = true) {
  return render(
    <Header model={headerModel(response, isDemo)} theme="light" apiConfigured={apiConfigured} onSubmit={noSubmit} />,
  );
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

        const { container, unmount } = renderHeader(response, isDemo);
        const text = container.textContent ?? "";
        expect(text).toContain(model.repoText);
        expect(text).toContain(scanTimeView(model.scanTime).text);
        expect(text).toContain(model.policyStatus);
        expect(text).toContain(model.policyLabel);
        if (model.unlockedNotice !== null) expect(text).toContain(model.unlockedNotice);
        expect(text.includes("demo fixture, recorded data")).toBe(isDemo);
        // Spec evidence-pack: the only links are the two evidence links, with fixed demo addresses here.
        const links = [...container.querySelectorAll("a")];
        if (isDemo) {
          expect(links.map((a) => [a.getAttribute("href"), a.getAttribute("aria-label"), a.hasAttribute("download")])).toEqual([
            ["/demo/evidence.json", "Download evidence pack as JSON", true],
            ["/demo/evidence.md", "Download evidence pack as Markdown", true],
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

function view(response: ScanResponse): { header: string[]; overlay: string[]; drawer: string[]; preview: string[]; previewLinks: (string | null)[]; text: string } {
  const h = renderHeader(response, false);
  const header = tags(h.container);
  const headerText = h.container.textContent ?? "";
  h.unmount();
  const c = render(<Cemetery response={response} theme="light" reducedMotion={true} />);
  const overlay = tags(c.container);
  const first = c.container.querySelector<HTMLButtonElement>("button[data-grave-index]");
  let drawer: string[] = [];
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
    drawer = tags(clone);
    drawerText = dialog.textContent ?? "";
  }
  c.unmount();
  return { header, overlay, drawer, preview, previewLinks, text: headerText + drawerText };
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
        for (const href of hostile.previewLinks) expect(href?.startsWith("https://") ?? false).toBe(true);
        const repo = response.report.scan?.repo.url;
        if (repo !== undefined) expect(hostile.text).toContain(`${prefix}${repo}`);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Header examples", () => {
  it("says so when scan metadata is absent and still shows the time", () => {
    const response = cheapScan(1);
    const { container } = renderHeader(response, false);
    expect(container.textContent).toContain("no scan metadata in this response");
    expect(container.textContent).toContain("12 Nov 2026, 00:00 UTC");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-12T00:00:00.000Z");
  });

  it("disables the field and the submit control with the exact text when no API is configured", () => {
    const { container } = renderHeader(cheapScan(1), false, false);
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Scan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain("hosted scan arrives with release 0.1 infra");
  });

  it("enables the field when an API is configured and hides the disabled text", () => {
    const { container } = renderHeader(cheapScan(1), false, true);
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(false);
    expect(container.textContent).not.toContain("hosted scan arrives");
  });

  it("shows a returned validation message in an alert", () => {
    render(<Header model={null} theme="light" apiConfigured={true} onSubmit={() => "fixed message"} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(screen.getByRole("alert").textContent).toBe("fixed message");
  });

  it("keeps the legend closed at load and lists the contents when opened", () => {
    const { container } = renderHeader(cheapScan(1), false);
    const toggle = screen.getByRole("button", { name: "Legend" });
    const panel = container.querySelector("#legend-panel") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    for (const state of ["Possessed", "Dead", "Haunted", "Restless", "Alive"]) expect(panel.textContent).toContain(state);
    expect(panel.textContent).toContain("one or more advisories");
    expect(panel.textContent).toContain(
      "Triage order: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then highest advisory severity, then transitive reach, then name.",
    );
    expect(panel.querySelectorAll("svg").length).toBe(8);
  });

  it("omits the demo label for a non-demo load of a response naming sexton-demo/fixture", () => {
    const response = cheapScan(1);
    (response.report as unknown as Record<string, unknown>)["scan"] = {
      repo: { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" },
      unlocked: false,
      unlockedPackages: [],
      lockfileVersion: 3,
      capped: false,
      totalDirect: 1,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    };
    const { container } = renderHeader(response, false);
    expect(container.textContent).toContain("https://github.com/sexton-demo/fixture");
    expect(container.textContent).not.toContain("demo fixture, recorded data");
  });

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
});

describe("Header failing rules text", () => {
  it("pluralises 0, 1 and 2 failing rules", () => {
    expect(failingRulesText(0)).toBe("0 failing rules");
    expect(failingRulesText(1)).toBe("1 failing rule");
    expect(failingRulesText(2)).toBe("2 failing rules");
    const { container } = renderHeader(cheapScan(1), false);
    const model = headerModel(cheapScan(1), false);
    expect(container.querySelector(".header-policy")?.textContent).toContain(failingRulesText(model.failingRules));
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

  it("renders the line after the policy line with download links", () => {
    const { container } = render(
      <Header model={headerModel(cheapScan(1), true)} theme="light" apiConfigured={true} onSubmit={noSubmit} />,
    );
    const evidence = container.querySelector(".header-evidence");
    expect(evidence?.tagName).toBe("DIV");
    expect(evidence?.previousElementSibling?.classList.contains("header-top")).toBe(true);
    const links = [...(evidence?.querySelectorAll("a") ?? [])];
    expect(links.map((a) => a.textContent)).toEqual(["JSON", "Markdown"]);
    for (const a of links) expect(a.hasAttribute("download")).toBe(true);
  });
});

describe("Header bar (cemetery-polish task 8)", () => {
  it("has the title text 'Sexton cemetery', a placeholder without a host name and one Legend chip per State, the Ghost, the Not-published form and the Pull request marker", () => {
    const { container } = render(
      <Header model={headerModel(cheapScan(1), true)} theme="dark" apiConfigured={true} onSubmit={noSubmit} />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Sexton cemetery");
    expect(container.querySelector("h1 svg")?.getAttribute("aria-hidden")).toBe("true");
    const placeholder = (screen.getByLabelText("Repository URL") as HTMLInputElement).placeholder;
    expect(placeholder).toBe("Paste a public repository URL");
    expect(placeholder).not.toMatch(/\.(com|org|io)/);
    const chips = container.querySelectorAll("#legend-panel .legend-chip");
    expect(chips).toHaveLength(8);
    expect(container.querySelectorAll("#legend-panel .legend-chip-ghost")).toHaveLength(1);
  });

  // Spec cemetery-undead, Deliberate test change 16: the form, then Sound, Serious mode and the Legend.
  it("orders the controls evidence JSON, evidence Markdown, input, Scan, Sound, Serious mode, Legend in the DOM", () => {
    const { container } = render(
      <Header model={headerModel(cheapScan(1), true)} theme="dark" apiConfigured={true} onSubmit={noSubmit} onSerious={() => undefined} />,
    );
    const controls = [...container.querySelectorAll<HTMLElement>("a[href], button, input")];
    expect(controls.map((el) => el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.textContent?.trim())).toEqual([
      "Download evidence pack as JSON",
      "Download evidence pack as Markdown",
      "repo",
      "Scan",
      "Sound off",
      "Serious mode",
      "Legend",
    ]);
    const sound = screen.getByRole("button", { name: "Sound off" }) as HTMLButtonElement;
    expect(sound.disabled).toBe(true);
    expect(document.getElementById(sound.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Sound arrives in the next release");
  });
});

// Fix after review of cemetery-time-fixes: a replay names itself and hides the policy line, every other scan keeps both.
describe("replay header text", () => {
  it("shows the replay title and no policy line for a replay, and the repository and policy line without one", () => {
    const base = cheapScan(1);
    const replay = { ...base, replay: { id: "axios" as const, title: "Replay: axios npm compromise, 31 March 2026", summary: "s", sources: [{ label: "l", url: "https://example.com/" }] } };
    const withReplay = headerModel(replay, false);
    expect(withReplay.repoText).toBe("Replay: axios npm compromise, 31 March 2026");
    expect(withReplay.showPolicy).toBe(false);
    const plain = headerModel(base, false);
    expect(plain.repoText).not.toBe("Replay: axios npm compromise, 31 March 2026");
    expect(plain.repoText).toMatch(/^(https:\/\/github\.com\/|no scan metadata in this response$)/);
    expect(plain.showPolicy).toBe(true);
    const shown = render(<Header model={withReplay} theme="light" apiConfigured={true} onSubmit={noSubmit} />);
    expect(shown.container.querySelector(".header-policy")).toBeNull();
    expect(shown.container.textContent).toContain("Replay: axios npm compromise, 31 March 2026");
    shown.unmount();
    const kept = render(<Header model={plain} theme="light" apiConfigured={true} onSubmit={noSubmit} />);
    expect(kept.container.querySelector(".header-policy")?.textContent).toMatch(/^policy: (pass|fail), /);
    kept.unmount();
  });
});

// Spec cemetery-undead, 10.3: the Legend names each Form in words.
describe("Legend form words", () => {
  it("describes each Form next to its State", () => {
    render(<Header model={headerModel(cheapScan(1), true)} theme="dark" apiConfigured={true} onSubmit={noSubmit} />);
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
