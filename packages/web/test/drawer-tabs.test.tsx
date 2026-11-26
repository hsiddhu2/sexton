// Spec clean-site, task 5: the tabbed Drawer (requirements 7.1 to 7.27, 11.2 to 11.5). The fix tab's cases from
// drawer/fix-view.ts, the copy with drawer/clipboard.ts and drawer/issue-text.ts, the History tab from
// drawer/history-rows.ts, the tabs and their keys, and, in the App, the Escape order with a Term over the Drawer and
// the focus return when the screen state closes the Drawer.
import type { PackageHealth, RemediationEntry, ScanResponse, State } from "@sexton/api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { copyText } from "../src/drawer/clipboard.js";
import { Drawer } from "../src/drawer/Drawer.js";
import { drawerModel } from "../src/drawer/drawer-model.js";
import {
  ALIVE_SUMMARY,
  ALIVE_TITLE,
  COPIED_TEXT,
  COPY_BLOCKED_TEXT,
  COPY_ISSUE_TEXT,
  COPY_PR_TEXT,
  fixView,
  NO_ACTION_NOTE,
  NO_CHANGE_TEXT,
  PLAN_NOTE,
  POSSESSED_NOTE,
  POSSESSED_OTHER_NOTE,
  RESTLESS_SUMMARY,
  RESTLESS_TITLE,
  SAFE_ONLY_NOTE,
  type ScanKind,
} from "../src/drawer/fix-view.js";
import { historyRows, NO_HISTORY_TEXT } from "../src/drawer/history-rows.js";
import { issueText } from "../src/drawer/issue-text.js";
import { resetWelcomeForTests } from "../src/guide/welcome-pref.js";
import { STATES } from "../src/load/lists.js";
import { cheapPackage, cheapScan } from "./arbitraries.js";
import { readDemoScan, readDemoScanText } from "./support/demo-scan.js";
import { drawerProps } from "./support/drawer-props.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEMO = readDemoScan() as ScanResponse;
const KINDS: readonly ScanKind[] = ["sample", "live-remediate", "live"];

function pkgOf(state: State, reason = "r"): PackageHealth {
  return { ...cheapPackage("p", state), stateReason: reason };
}
function plan(status: RemediationEntry["status"], intent = true): RemediationEntry {
  return {
    packageName: "p",
    kind: "bump",
    status,
    title: `title ${status}`,
    summary: `summary ${status}`,
    prBody: status === "proposed" ? "# body" : "",
    ...(intent && status === "proposed"
      ? { intent: { branch: "b", title: "t", body: "# body", files: [{ path: "package.json", op: "set-range", section: "dependencies", name: "p", range: "^2.0.0" }], baseRef: "@default", reviewComments: [] } }
      : {}),
  } as RemediationEntry;
}

describe("fixView (7.3 to 7.16, 7.26, 7.27)", () => {
  it("shows a Proposed plan's title, summary, diff, the one copy button, the note for each scan, and the body", () => {
    for (const scan of KINDS) {
      const v = fixView(pkgOf("Dead"), plan("proposed"), scan);
      expect(v.title).toBe("title proposed");
      expect(v.summary).toBe("summary proposed");
      expect(v.diff).toEqual([{ sign: "+", text: '"p": "^2.0.0"' }]);
      expect(v.copy).toBe("pr");
      expect(v.openPr).toBe(scan === "live-remediate");
      expect(v.note).toBe(PLAN_NOTE[scan]);
      expect(v.howLink).toBe(true);
      expect(v.prBody).toBe("# body");
    }
    expect(PLAN_NOTE.sample).toBe(
      "No sign-in needed. Open pull request works on a live scan of hsiddhu2/sexton-demo. For your own repo, Sexton shows this plan and the full pull request text.",
    );
    expect(PLAN_NOTE["live-remediate"]).toBe("No sign-in needed. This button opens a real pull request on hsiddhu2/sexton-demo.");
    expect(PLAN_NOTE.live).toBe("No sign-in needed. For this repo Sexton shows the plan and the full pull request text.");
    // A Proposed plan with no body: Copy this as an issue for an unhealthy package only (7.6).
    const bare = { ...plan("proposed"), prBody: "" };
    expect([fixView(pkgOf("Dead"), bare, "live").copy, fixView(pkgOf("Alive"), bare, "live").copy]).toEqual(["issue", null]);
    // No Open pull request without an intent to send.
    expect(fixView(pkgOf("Dead"), plan("proposed", false), "live-remediate").openPr).toBe(false);
  });

  it("gives a migrate plan's removed and added lines", () => {
    const migrate = DEMO.remediations?.find((r) => r.kind === "migrate");
    const pkg = DEMO.report.packages.find((p) => p.name === migrate?.packageName) as PackageHealth;
    expect(fixView(pkg, migrate, "sample").diff).toEqual([
      { sign: "-", text: '"node-sass"' },
      { sign: "+", text: '"sass": "^1.108.2"' },
    ]);
  });

  it("gives a Possessed package with no Proposed plan the note of its Reason family and Copy this as an issue (7.6, 7.7)", () => {
    const cases: readonly [string, string][] = [
      ["maintainer change in the last 90 days", POSSESSED_NOTE.maintainer],
      ["provenance regression: 1.0.1 has no provenance, 1.0.0 had it", POSSESSED_NOTE.provenance],
      ["install script added in 1.0.1", POSSESSED_NOTE["install-script"]],
      ["new dependency in 1.0.1: evil", POSSESSED_NOTE["new-dependency"]],
      ["publisher changed in 1.0.1: a to b", POSSESSED_NOTE.publisher],
      ["something new", POSSESSED_OTHER_NOTE],
    ];
    for (const [reason, note] of cases) {
      const v = fixView(pkgOf("Possessed", reason), undefined, "sample");
      expect(v).toMatchObject({ title: NO_CHANGE_TEXT, summary: null, copy: "issue", note, openPr: false, howLink: false, prBody: null });
    }
    expect(POSSESSED_NOTE.maintainer).toBe("Check who the new maintainer is before the next install.");
    expect(POSSESSED_OTHER_NOTE).toBe("Check what changed before the next install.");
    // A plan that is not proposed shows its title and summary (7.26).
    expect(fixView(pkgOf("Possessed", "maintainer change in the last 90 days"), plan("unavailable"), "live")).toMatchObject({
      title: "title unavailable",
      summary: "summary unavailable",
      copy: "issue",
      note: POSSESSED_NOTE.maintainer,
    });
  });

  it("gives Dead and Haunted the safe-only note for no-safe-version, and no note otherwise (7.8, 7.26, 7.27)", () => {
    for (const state of ["Dead", "Haunted"] as const) {
      expect(fixView(pkgOf(state), plan("no-safe-version"), "live")).toMatchObject({ title: "title no-safe-version", copy: "issue", note: SAFE_ONLY_NOTE });
      expect(fixView(pkgOf(state), plan("unavailable"), "live")).toMatchObject({ copy: "issue", note: null });
      expect(fixView(pkgOf(state), undefined, "live")).toMatchObject({ title: NO_CHANGE_TEXT, copy: "issue", note: null });
    }
    expect(SAFE_ONLY_NOTE).toBe("Sexton only proposes a version it can show is safe.");
    expect(NO_CHANGE_TEXT).toBe("No automatic change is proposed.");
  });

  it("gives Restless and Alive their sentences, the no-action note and no button (7.9, 7.10)", () => {
    expect(fixView(pkgOf("Restless"), undefined, "sample")).toEqual({
      title: RESTLESS_TITLE,
      summary: RESTLESS_SUMMARY,
      diff: [],
      openPr: false,
      copy: null,
      note: NO_ACTION_NOTE,
      howLink: false,
      prBody: null,
    });
    expect([RESTLESS_TITLE, RESTLESS_SUMMARY]).toEqual(["Nothing urgent", "No pull request is proposed for a Restless package. Keep an eye on it."]);
    expect(fixView(pkgOf("Alive"), plan("unavailable"), "live-remediate")).toMatchObject({ title: ALIVE_TITLE, summary: ALIVE_SUMMARY, copy: null, openPr: false, note: NO_ACTION_NOTE });
    expect([ALIVE_TITLE, ALIVE_SUMMARY, NO_ACTION_NOTE]).toEqual(["Healthy", "Nothing to fix.", "No action needed."]);
  });

  it("shows at most one copy button, and Open pull request only with a Proposed plan on a Live scan with actions", () => {
    const arbPlan = fc.option(fc.constantFrom<RemediationEntry["status"]>("proposed", "no-safe-version", "unavailable").map((s) => plan(s)), { nil: undefined });
    fc.assert(
      fc.property(fc.constantFrom(...STATES), arbPlan, fc.constantFrom(...KINDS), (state, p, scan) => {
        const v = fixView(pkgOf(state), p, scan);
        expect([null, "pr", "issue"]).toContain(v.copy);
        expect(v.openPr).toBe(p?.status === "proposed" && scan === "live-remediate");
        if (v.copy === "issue") expect(["Possessed", "Dead", "Haunted"]).toContain(state);
      }),
      { numRuns: 100 },
    );
  });
});

describe("copyText and issueText (7.6, 7.11, 7.12)", () => {
  it("answers ok when the clipboard takes the text, and blocked when it refuses or is missing", async () => {
    const taken: string[] = [];
    expect(await copyText("hi", { writeText: (t) => (taken.push(t), Promise.resolve()) })).toBe("ok");
    expect(taken).toEqual(["hi"]);
    expect(await copyText("hi", { writeText: () => Promise.reject(new Error("no")) })).toBe("blocked");
    expect(await copyText("hi", undefined)).toBe("blocked");
  });

  it("holds the package, version, State, reason and every signal as plain text", () => {
    const pkg = DEMO.report.packages.find((p) => p.name === "left-padder") as PackageHealth;
    const model = drawerModel(DEMO, pkg);
    const text = issueText(model, model.name, model.version, model.remediation);
    expect(text.split("\n").slice(0, 6)).toEqual([
      "Sexton: left-padder 1.2.1 is Possessed",
      "",
      "Package: left-padder 1.2.1",
      "State: Possessed",
      "Why: A maintainer of this package changed in the last 90 days.",
      "Reason: maintainer change in the last 90 days",
    ]);
    expect(text).toContain("Plan: Sexton: no change proposed for left-padder.");
    for (const label of ["Last publish", "Deprecated", "Maintainers", "Maintainer change", "New dependency"]) expect(text).toContain(`- ${label}: `);
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(12);
  });
});

describe("historyRows (7.17, 7.18)", () => {
  it("lists the Segments newest first with date, State and plain reason", () => {
    expect(historyRows(DEMO, "left-padder")).toEqual([
      { from: "2026-11-12T00:00:00.000Z", date: "12 Nov 2026", state: "Possessed", reason: "A maintainer of this package changed in the last 90 days." },
      { from: "2026-09-20T10:00:00.000Z", date: "20 Sep 2026", state: "Alive", reason: "No rule matched. Nothing to do." },
      { from: "2026-09-01T10:00:00.000Z", date: "1 Sep 2026", state: null, reason: "Installed version not yet published" },
    ]);
  });

  it("gives null with no timelines", () => {
    expect(historyRows(cheapScan(1), "pkg-0")).toBeNull();
    expect(NO_HISTORY_TEXT).toBe("No history for this scan.");
  });
});

describe("the Drawer's tabs and fix tab (7.1, 7.3 to 7.17)", () => {
  const lodash = DEMO.report.packages.find((p) => p.name === "lodash") as PackageHealth;
  const tabs = (): HTMLElement[] => screen.getAllByRole("tab");

  it("shows the breadcrumb, name, version, badge and scan date, and three tabs with one in the tab order", () => {
    render(<Drawer {...drawerProps(DEMO, lodash, "sample")} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "lodash 4.17.21" });
    expect(dialog.querySelector("nav.crumbs")?.textContent).toBe("← Cemetery/lodash");
    expect(dialog.querySelector(".drawer-version")?.textContent).toBe("4.17.21");
    expect(dialog.querySelector(".drawer-badge")?.textContent).toBe("Haunted");
    expect(dialog.querySelector(".drawer-scan-date time")?.getAttribute("datetime")).toBe("2026-11-12T00:00:00.000Z");
    expect(tabs().map((t) => t.textContent)).toEqual(["Evidence", "The fix", "History"]);
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs()[0]?.id);
    // No Term in the breadcrumb, the heading or a column heading (11.3).
    expect(dialog.querySelector("nav .term, h2 .term, h3 .term, th .term")).toBeNull();
  });

  it("moves between the tabs with the arrow keys, Home and End", () => {
    render(<Drawer {...drawerProps(DEMO, lodash, "sample")} onClose={() => undefined} />);
    const [evidence, fix, history] = tabs() as [HTMLElement, HTMLElement, HTMLElement];
    evidence.focus();
    fireEvent.keyDown(evidence, { key: "ArrowRight" });
    expect(document.activeElement).toBe(fix);
    expect(fix.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(fix, { key: "End" });
    expect(document.activeElement).toBe(history);
    fireEvent.keyDown(history, { key: "ArrowRight" });
    expect(document.activeElement).toBe(evidence);
    fireEvent.keyDown(evidence, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(history);
    fireEvent.keyDown(history, { key: "Home" });
    expect(document.activeElement).toBe(evidence);
  });

  it("shows the plan, the diff, the closed disclosure, one copy button and the Sample note with its link", () => {
    let guide = 0;
    render(<Drawer {...drawerProps(DEMO, lodash, "sample")} onClose={() => undefined} onGuide={() => (guide += 1)} />);
    fireEvent.click(screen.getByRole("tab", { name: "The fix" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".fix-box")?.textContent).toBe("Sexton: bump lodash to 4.18.1Bump lodash from 4.17.21 to 4.18.1");
    expect(dialog.querySelector(".diff-add")?.textContent).toBe('+ Added: "lodash": "^4.18.1"');
    expect((dialog.querySelector("details") as HTMLDetailsElement).open).toBe(false);
    expect(within(dialog).queryByRole("button", { name: "Open pull request" })).toBeNull();
    expect(within(dialog).getAllByRole("button", { name: /^Copy/ }).map((b) => b.textContent)).toEqual([COPY_PR_TEXT]);
    expect(dialog.querySelector(".drawer-result .drawer-note")?.textContent).toBe(`${PLAN_NOTE.sample} How does this work?`);
    fireEvent.click(within(dialog).getByRole("button", { name: "How does this work?" }));
    expect(guide).toBe(1);
  });

  it("copies the pull request text and says so, or says the copy was blocked", async () => {
    const writes: string[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: (t: string) => (writes.push(t), Promise.resolve()) } });
    render(<Drawer {...drawerProps(DEMO, lodash, "sample")} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "The fix" }));
    fireEvent.click(screen.getByRole("button", { name: COPY_PR_TEXT }));
    await waitFor(() => expect(screen.getByText(COPIED_TEXT)).toBeTruthy());
    expect(writes).toEqual([DEMO.remediations?.find((r) => r.packageName === "lodash")?.prBody]);
    cleanup();
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    const padder = DEMO.report.packages.find((p) => p.name === "left-padder") as PackageHealth;
    render(<Drawer {...drawerProps(DEMO, padder, "sample")} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "The fix" }));
    expect(screen.getByRole("dialog").querySelector(".drawer-result .drawer-note")?.textContent).toBe(POSSESSED_NOTE.maintainer);
    fireEvent.click(screen.getByRole("button", { name: COPY_ISSUE_TEXT }));
    await waitFor(() => expect(screen.getByText(COPY_BLOCKED_TEXT)).toBeTruthy());
  });

  it("lists the History newest first, and the empty text without timelines", () => {
    const padder = DEMO.report.packages.find((p) => p.name === "left-padder") as PackageHealth;
    render(<Drawer {...drawerProps(DEMO, padder)} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    const items = [...screen.getByRole("dialog").querySelectorAll(".history li")];
    expect(items.map((li) => li.querySelector("b")?.textContent)).toEqual(["Possessed", "Alive", "Not published"]);
    expect(items[0]?.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-12T00:00:00.000Z");
    cleanup();
    const bare = cheapScan(1);
    render(<Drawer {...drawerProps(bare, bare.report.packages[0] as PackageHealth)} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tabpanel").textContent).toBe(NO_HISTORY_TEXT);
  });
});

describe("the Drawer in the App: Terms, Escape order and the way back (7.21 to 7.23, 10.3, 11.2 to 11.5)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetWelcomeForTests();
  });
  const ORIGIN = "http://localhost";
  async function mountDemo(): Promise<HTMLElement> {
    const fetchFn = (() => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as unknown as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={null} initialSearch="" pageOrigin={ORIGIN} />);
    await waitFor(() => expect(container.querySelector("button.grave-button")).not.toBeNull());
    return container;
  }
  const graveOf = (name: string): HTMLButtonElement =>
    [...document.querySelectorAll<HTMLButtonElement>("button.grave-button")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith(`${name} `)) as HTMLButtonElement;

  it("opens a Term inside the Drawer; Escape closes the Term first, then the Drawer, and focus returns to the grave", async () => {
    await mountDemo();
    const grave = graveOf("left-padder");
    grave.focus();
    fireEvent.click(grave);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    const term = dialog.querySelector<HTMLButtonElement>('.drawer-signals .term[data-term="maintainer"]') as HTMLButtonElement;
    expect(term).not.toBeNull();
    term.focus();
    fireEvent.click(term);
    expect(document.querySelector(".term-pop")?.textContent).toContain("maintainer");
    fireEvent.keyDown(term, { key: "Escape" });
    expect(document.querySelector(".term-pop")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(term, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(graveOf("left-padder"));
  });

  it("closes a Term on a press outside it, and keeps the Drawer open", async () => {
    await mountDemo();
    fireEvent.click(graveOf("left-padder"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector(".drawer-signals .term") as HTMLElement);
    expect(document.querySelector(".term-pop")).not.toBeNull();
    fireEvent.pointerDown(dialog.querySelector(".drawer-head") as HTMLElement);
    expect(document.querySelector(".term-pop")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("returns focus to the grave when the screen state closes the Drawer, with focus outside it", async () => {
    await mountDemo();
    fireEvent.click(graveOf("lodash"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // The header stays live under the Drawer; Escape from there reaches the page's own listener.
    const legend = screen.getByRole("button", { name: "Legend" });
    legend.focus();
    act(() => {
      fireEvent.keyDown(legend, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(graveOf("lodash"));
  });

  it("closes the Drawer on the breadcrumb and on the scrim, returning focus each time", async () => {
    const container = await mountDemo();
    for (const how of ["crumb", "scrim"] as const) {
      fireEvent.click(graveOf("uuid"));
      const dialog = screen.getByRole("dialog");
      if (how === "crumb") fireEvent.click(within(dialog).getByRole("button", { name: "← Cemetery" }));
      else fireEvent.click(container.ownerDocument.querySelector(".backdrop") as HTMLElement);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(graveOf("uuid"));
    }
  });

  it("opens the Guide page from the fix tab's link", async () => {
    await mountDemo();
    fireEvent.click(graveOf("lodash"));
    fireEvent.click(screen.getByRole("tab", { name: "The fix" }));
    fireEvent.click(screen.getByRole("button", { name: "How does this work?" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".guide")).not.toBeNull();
  });
});
