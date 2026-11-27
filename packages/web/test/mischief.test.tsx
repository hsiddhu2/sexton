// Spec clean-site, task 13: a little mischief (design C16, requirement 19). Every shown Epitaph line, Dry line and the
// Scanning line is a text of copy/mischief.ts, word for word as design C16 lists it, and none of them replaces or
// moves a plain sentence, a next step or a button.
import type { PackageHealth } from "@sexton/api";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DRY_LINES, EPITAPH_LINES, SCANNING_LINE, type DryCard } from "../src/copy/mischief.js";
import { WelcomeBar } from "../src/guide/WelcomeBar.js";
import { FailureCard } from "../src/home/FailureCard.js";
import { SCANNING_NOTE, ScanningCard } from "../src/home/ScanningCard.js";
import { FAILURE_CARDS, LOAD_FAILED_CARD, NO_SUCH_REPLAY_TEXT } from "../src/load/scan-failure.js";
import { Inspector } from "../src/panel/Inspector.js";
import { FAMILIES, reasonSentence, type Family } from "../src/panel/reason-family.js";
import { GHOST_PICTURE_SIDE } from "../src/scene/GhostPicture.js";
import { Tour } from "../src/tour/Tour.js";
import { cheapPackage } from "./arbitraries.js";
import { canvasCalls } from "./setup.js";

afterEach(() => {
  cleanup();
});

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "../src/copy/mischief.ts"), "utf8");
const DESIGN = readFileSync(resolve(HERE, "../../../.kiro/specs/clean-site/design.md"), "utf8");
const SAMPLES = JSON.parse(readFileSync(join(HERE, "fixtures", "engine-reasons.json"), "utf8")) as { family: Family; reason: string }[];

/** The rows of design C16's tables as [key, line], the key without code marks or a criterion in brackets. */
function c16Rows(): [string, string][] {
  const start = DESIGN.indexOf("### C16.");
  const section = DESIGN.slice(start, DESIGN.indexOf("\n## ", start));
  return section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Family") && !line.startsWith("| Card"))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      return [(cells[1] ?? "").replace(/`/g, "").replace(/\s*\(.*\)$/, ""), cells[2] ?? ""];
    });
}

/** True when `line` is written in copy/mischief.ts as a string literal. */
const inFile = (line: string): boolean => SOURCE.includes(JSON.stringify(line));

const pkgWith = (reason: string): PackageHealth => ({ ...cheapPackage("left-pad", "Possessed"), stateReason: reason });

describe("the texts (19.10)", () => {
  it("holds exactly the Epitaph and Dry lines of design C16, and its Scanning line", () => {
    const rows = c16Rows();
    expect(rows).toHaveLength(FAMILIES.length + Object.keys(DRY_LINES).length);
    expect(Object.fromEntries(rows.slice(0, FAMILIES.length))).toEqual(EPITAPH_LINES);
    expect(Object.fromEntries(rows.slice(FAMILIES.length))).toEqual(DRY_LINES);
    expect(Object.keys(EPITAPH_LINES).sort()).toEqual([...FAMILIES].sort());
    expect(DESIGN).toContain(`**Scanning line** (19.8): "${SCANNING_LINE}"`);
  });

  it("writes each Dry line as one sentence of at most 10 words (19.4)", () => {
    for (const line of Object.values(DRY_LINES)) {
      expect(line.split(" ").length, line).toBeLessThanOrEqual(10);
      expect(line.match(/[.?!]/g), line).toEqual(["."]);
      expect(line.endsWith("."), line).toBe(true);
    }
  });
});

describe("the Epitaph line in the Inspector (19.1, 19.2)", () => {
  it("shows the line of each Reason family under the name at the scan date, as plain text, after nothing else changes", () => {
    for (const { family, reason } of SAMPLES) {
      const view = render(<Inspector pkg={pkgWith(reason)} state="Possessed" version="1.0.0" date={null} selected={false} proposed={false} onTerm={() => undefined} />);
      const line = view.container.querySelector(".inspector-epitaph");
      expect(line?.textContent, family).toBe(EPITAPH_LINES[family]);
      expect(inFile(line?.textContent ?? ""), family).toBe(true);
      expect(line?.previousElementSibling?.className).toBe("inspector-name");
      expect(line?.tagName).toBe("P");
      // Plain text: no Term is marked in it.
      expect(line?.children).toHaveLength(0);
      // Clear wins: the plain sentence is still shown in full.
      expect(view.container.querySelector(".inspector-why")?.textContent).toBe(reasonSentence(reason));
      view.unmount();
    }
  });

  it("shows no Epitaph line at an earlier date, for a package not published then, or for a reason with no family", () => {
    const sample = SAMPLES[0] as { reason: string };
    const cases = [
      { pkg: pkgWith(sample.reason), state: "Alive" as const, date: "1 March 2026" },
      { pkg: pkgWith(sample.reason), state: null, date: "1 March 2026" },
      { pkg: pkgWith("something new"), state: "Possessed" as const, date: null },
    ];
    for (const c of cases) {
      const view = render(<Inspector pkg={c.pkg} state={c.state} version="1.0.0" date={c.date} selected={false} proposed={false} />);
      expect(view.container.querySelector(".inspector-epitaph")).toBeNull();
      for (const line of Object.values(EPITAPH_LINES)) expect(view.container.textContent).not.toContain(line);
      view.unmount();
    }
  });
});

describe("the Dry line of every failure card (19.3, 19.4)", () => {
  const cards: { id: DryCard; sentence: string; next?: string }[] = [
    ...Object.values(FAILURE_CARDS),
    { id: "load-failed", ...LOAD_FAILED_CARD },
    { id: "no-such-replay", sentence: NO_SUCH_REPLAY_TEXT },
  ];

  it("opens the card with its Dry line, hidden from assistive technology, then the sentence, next step and buttons", () => {
    expect(cards.map((c) => c.id).sort()).toEqual(Object.keys(DRY_LINES).sort());
    for (const c of cards) {
      const view = render(<FailureCard dry={DRY_LINES[c.id]} sentence={c.sentence} {...(c.next === undefined ? {} : { next: c.next })} actions={[{ label: "Go", onPress: () => undefined }]} />);
      const alert = view.getByRole("alert");
      const dry = alert.firstElementChild;
      expect(dry?.className).toBe("failure-dry");
      expect(dry?.getAttribute("aria-hidden")).toBe("true");
      expect(dry?.textContent).toBe(DRY_LINES[c.id]);
      expect(inFile(dry?.textContent ?? "")).toBe(true);
      // The heading is the plain sentence, unchanged, and the next step follows it.
      expect(alert.querySelector("h2")?.textContent).toBe(c.sentence);
      expect(alert.querySelector("h2")?.compareDocumentPosition(dry as Element)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
      expect(alert.querySelector(".failure-next")?.textContent ?? null).toBe(c.next ?? null);
      expect(alert.lastElementChild?.className).toBe("failure-buttons");
      view.unmount();
    }
  });
});

describe("the Scanning line (19.8)", () => {
  it("shows the line under the note, as one more line in the same card", () => {
    const view = render(<ScanningCard label="o/r" />);
    const line = view.container.querySelector(".scanning-mischief");
    expect(line?.textContent).toBe(SCANNING_LINE);
    expect(inFile(SCANNING_LINE)).toBe(true);
    expect(line?.previousElementSibling?.textContent).toBe(SCANNING_NOTE);
    expect(line?.closest('[role="status"]')).toBe(view.getByRole("status"));
  });
});

describe("the Guide ghost (19.5 to 19.7, 19.9)", () => {
  function ghostOf(root: HTMLElement): HTMLCanvasElement {
    const ghosts = root.querySelectorAll("canvas.ghost-picture");
    expect(ghosts).toHaveLength(1);
    return ghosts[0] as HTMLCanvasElement;
  }

  it("shows a still ghost at the start of the Welcome bar, before its text, hidden and with no tab stop", () => {
    const view = render(<WelcomeBar onGuide={() => undefined} onClose={() => undefined} />);
    const ghost = ghostOf(view.container);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.hasAttribute("tabindex")).toBe(false);
    expect(ghost.style.width).toBe(`${String(GHOST_PICTURE_SIDE)}px`);
    expect(ghost.nextElementSibling?.className).toBe("welcome-text");
    expect(view.getByRole("region").querySelector(".welcome-lead")?.firstElementChild).toBe(ghost);
  });

  it("shows the ghost beside the Tour's step title, outside the title's name, drawn once with no loop", () => {
    const view = render(<Tour step={0} apiConfigured={true} onNext={() => undefined} onEnd={() => undefined} />);
    const ghost = ghostOf(view.container);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.nextElementSibling?.id).toBe("tour-title");
    expect(view.getByRole("dialog").getAttribute("aria-labelledby")).toBe("tour-title");
    // One ghost body fill, then nothing more however long the card stays (a still picture: no frame loop).
    const fills = (): number => canvasCalls().filter((c) => c.method === "fill" && c.args.length === 1).length;
    const drawn = fills();
    expect(drawn).toBe(1);
    view.rerender(<Tour step={0} apiConfigured={true} onNext={() => undefined} onEnd={() => undefined} />);
    expect(fills()).toBe(drawn);
  });
});
