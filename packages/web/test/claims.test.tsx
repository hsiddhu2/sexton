// Spec clean-site, task 7.1: the Claim registry (design C7, requirements 9.4 and 17.5). Property 9: every Claim rests
// on README.md, and no sentence the Site renders that names a capability is outside the registry and the listed
// control labels. A check over fixed lists and fixed renders, run once.
import type { PackageHealth, RemediationEntry, ScanResponse, State } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { CLAIMS } from "../src/copy/claims.js";
import { Drawer } from "../src/drawer/Drawer.js";
import { NO_HISTORY_TEXT } from "../src/drawer/history-rows.js";
import { PR_LINK_TEXT } from "../src/drawer/Drawer.js";
import { OUTCOME_TEXT } from "../src/load/remediate-client.js";
import { resetWelcomeForTests } from "../src/guide/welcome-pref.js";
import { BACK_TO_SAMPLE, FailureCard, TRY_AGAIN, TRY_DEMO_REPO } from "../src/home/FailureCard.js";
import { ScanningCard } from "../src/home/ScanningCard.js";
import { FAILURE_CARDS, LOAD_FAILED_CARD } from "../src/load/scan-failure.js";
import { STATES } from "../src/load/lists.js";
import { NO_LOCKFILE_NOTICE } from "../src/home/notices.js";
import { reasonSentence } from "../src/panel/reason-family.js";
import { cheapPackage, cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { drawerProps } from "./support/drawer-props.js";

const README = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../README.md"), "utf8");

/** A capability phrase (design C7): a sentence holding one must be a Claim or a listed label. */
const CAPABILITY =
  /\b(pull requests?|sign in|sign-in|GitHub Actions?|sexton check|scans|deps\.dev|OSV|opens|reads|read|public repos?|package\.json)\b/i;

/** Pure. Splits text into sentences: after ".", "?" or "!" followed by a space, and on line breaks. */
function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.?!])\s+(?=[A-Z"'(])/))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s !== "");
}

/** Inline elements: their text joins the text around them. Everything else starts a new block. */
const INLINE = new Set(["B", "STRONG", "EM", "I", "CODE", "A", "TIME", "ABBR", "SMALL", "KBD", "SAMP"]);

/** The visible text of `root`, one block per line; hidden parts and a closed disclosure's body are left out. */
function visibleText(root: Element): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLElement && node.hidden) return;
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
    // A signal's value is scan data shown as it was read, not a sentence of the Site.
    if (node.classList.contains("signal-value")) return;
    const parent = node.parentElement;
    if (parent instanceof HTMLDetailsElement && !parent.open && node.tagName !== "SUMMARY") return;
    const inline = INLINE.has(node.tagName) || (node.tagName === "BUTTON" && node.classList.contains("term"));
    if (!inline) out.push("\n");
    for (const child of node.childNodes) walk(child);
    if (!inline) out.push("\n");
  };
  walk(root);
  return out.join("");
}

/** Control labels, headings and what-happened lines that hold a capability phrase but claim nothing (design C7). */
const LISTED: ReadonlySet<string> = new Set([
  "Open pull request",
  "Copy pull request text",
  "Read the pull request text",
  "Scan",
  "Sample scan",
  "Scan this repository",
  "What is a pull request?",
  "Do I have to sign in to GitHub?",
  "So how does the pull request get opened?",
  "Can it check my repo automatically?",
  "a pull request was opened",
  "Reading package.json and the lockfile",
  "Reading each headstone",
  "Read the two-minute guide first.",
  "Read the guide",
  "package.json",
  // What happened after Open pull request: the outcome lines and the link to the opened pull request.
  "Opening the pull request.",
  PR_LINK_TEXT,
  ...Object.values(OUTCOME_TEXT),
  "Copied. Paste it into a pull request or an issue on your repo.",
  "No pull request is proposed for a Restless package.",
  reasonSentence("all state signals unavailable"),
  NO_LOCKFILE_NOTICE,
  ...Object.values(FAILURE_CARDS).map((c) => c.sentence),
  LOAD_FAILED_CARD.sentence,
]);

/** The ranges notice of 2.14, whose names vary, and a signal source link, shown by its host (scan data). */
const LISTED_PATTERNS: readonly RegExp[] = [/^(1 package was|\d+ packages were) resolved from package\.json ranges: .+$/, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/];

/** Every sentence of every Claim text. */
const CLAIM_SENTENCES: ReadonlySet<string> = new Set(CLAIMS.flatMap((c) => sentences(c.text)));

/** The sentences of `text` that hold a capability phrase and are neither a Claim nor a listed label. */
function unclaimedIn(text: string): string[] {
  return sentences(text).filter((s) => CAPABILITY.test(s) && !CLAIM_SENTENCES.has(s) && !LISTED.has(s) && !LISTED_PATTERNS.some((p) => p.test(s)));
}
function unclaimed(root: Element): string[] {
  return unclaimedIn(visibleText(root));
}

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  resetWelcomeForTests();
});

const ORIGIN = "http://localhost";
const API = "https://api.example";

function mount(apiBase: string | null = null) {
  const fetchFn = ((): Promise<Response> => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch;
  return render(<App fetchFn={fetchFn} apiBase={apiBase} initialSearch="" pageOrigin={ORIGIN} />);
}
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}

describe("Feature: clean-site, Property 9: Claims rest on README.md", () => {
  it("finds every Claim's README text in README.md, with one Claim per id and per text", () => {
    expect(CLAIMS.length).toBeGreaterThan(0);
    for (const c of CLAIMS) {
      expect(c.text.trim(), c.id).not.toBe("");
      for (const text of c.readme) expect(README.includes(text), `${c.id}: ${text}`).toBe(true);
    }
    expect(new Set(CLAIMS.map((c) => c.id)).size).toBe(CLAIMS.length);
    expect(new Set(CLAIMS.map((c) => c.text)).size).toBe(CLAIMS.length);
  });

  it("holds the three README sentences of 18.7", () => {
    for (const text of [
      "The hosted site needs no sign-in and never asks for a GitHub password.",
      "Sexton reads a repository's package.json and package-lock.json at its root.",
      "Sexton proposes a bump only to a version that passes its checks; otherwise it proposes no change.",
    ])
      expect(README).toContain(text);
  });

  it("splits text into sentences and blocks as the check reads it", () => {
    expect(sentences('One. "Two" is here? Three!\nFour')).toEqual(["One.", '"Two" is here?', "Three!", "Four"]);
    const div = document.createElement("div");
    div.innerHTML = '<p>A <button class="term">pull request</button> opens.</p><button>Next</button><details><summary>S</summary><p>Hidden reads.</p></details>';
    expect(sentences(visibleText(div))).toEqual(["A pull request opens.", "Next", "S"]);
    expect(unclaimed(div)).toEqual(["A pull request opens."]);
  });

  it("finds no unclaimed capability sentence on Home, the List, the Legend, the Guide page and the Tour at each step", async () => {
    for (const api of [null, API]) {
      const { container, unmount } = mount(api);
      await ready();
      expect(unclaimed(document.body), "Home").toEqual([]);
      fireEvent.focus(screen.getByLabelText("GitHub repository to scan"));
      expect(unclaimed(document.body), "examples").toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Legend" }));
      expect(unclaimed(document.body), "Legend").toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Watch a real attack" }));
      expect(unclaimed(document.body), "attack picker").toEqual([]);
      fireEvent.keyDown(document.body, { key: "Escape" });
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      expect(unclaimed(document.body), "List").toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Tour" }));
      for (let step = 0; step < 3; step += 1) {
        expect(unclaimed(document.body), `Tour step ${String(step + 1)}`).toEqual([]);
        fireEvent.click(within(container.querySelector(".tour-card") as HTMLElement).getByRole("button", { name: step === 2 ? "Done" : "Next" }));
      }
      fireEvent.click(screen.getByRole("button", { name: "What is Sexton?" }));
      expect(container.querySelector(".guide")).not.toBeNull();
      expect(unclaimed(document.body), "Guide page").toEqual([]);
      unmount();
    }
  });

  it("finds no unclaimed capability sentence in the Drawer of every demo grave on each tab", async () => {
    const { container } = mount();
    await ready();
    const count = container.querySelectorAll("button.grave-button").length;
    expect(count).toBe(12);
    for (let i = 0; i < count; i += 1) {
      fireEvent.click(container.querySelector(`button.grave-button[data-grave-index="${String(i)}"]`) as HTMLElement);
      const dialog = screen.getByRole("dialog");
      for (const tab of ["Evidence", "The fix", "History"]) {
        fireEvent.click(within(dialog).getByRole("tab", { name: tab }));
        expect(unclaimed(dialog), `grave ${String(i)}, ${tab}`).toEqual([]);
      }
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    }
  });

  it("finds no unclaimed capability sentence in the fix tab of every case of 7.3 to 7.15", () => {
    const plan = (status: RemediationEntry["status"]): RemediationEntry =>
      ({
        packageName: "p",
        kind: "bump",
        status,
        title: "Bump p",
        summary: "Bump p to 2.0.0",
        prBody: status === "proposed" ? "# Bump p" : "",
        ...(status === "proposed"
          ? { intent: { branch: "b", title: "t", body: "# Bump p", files: [{ path: "package.json", op: "set-range", section: "dependencies", name: "p", range: "^2.0.0" }], baseRef: "@default", reviewComments: [] } }
          : {}),
      }) as RemediationEntry;
    const reasons = [
      "maintainer change in the last 90 days",
      "provenance regression: 1.0.1 has no provenance, 1.0.0 had it",
      "install script added in 1.0.1",
      "new dependency in 1.0.1: evil",
      "publisher changed in 1.0.1: a to b",
      "something new",
    ];
    const cases: { pkg: PackageHealth; plans: RemediationEntry[] }[] = [];
    for (const state of STATES as readonly State[]) {
      for (const plans of [[], [plan("proposed")], [plan("no-safe-version")]]) cases.push({ pkg: { ...cheapPackage("p", state), stateReason: "no rule matched" }, plans });
    }
    for (const reason of reasons) cases.push({ pkg: { ...cheapPackage("p", "Possessed"), stateReason: reason }, plans: [] });
    for (const { pkg, plans } of cases) {
      const response = { ...cheapScan(0), report: { generatedAt: "2026-11-12T00:00:00.000Z", packages: [pkg] }, remediations: plans } as unknown as ScanResponse;
      for (const kind of ["sample", "live-remediate", "live"] as const) {
        const view = render(
          <Drawer
            {...drawerProps(response, pkg, kind)}
            onClose={() => undefined}
            onGuide={() => undefined}
            {...(kind === "live-remediate" ? { onRemediate: () => new Promise(() => undefined) } : {})}
          />,
        );
        fireEvent.click(screen.getByRole("tab", { name: "The fix" }));
        expect(unclaimed(screen.getByRole("dialog")), `${pkg.state} ${pkg.stateReason} ${String(plans[0]?.status)} ${kind}`).toEqual([]);
        view.unmount();
      }
    }
    expect(NO_HISTORY_TEXT).not.toMatch(CAPABILITY);
    // The outcome lines after Open pull request say what happened, not what Sexton can do.
    for (const line of Object.values(OUTCOME_TEXT)) expect(unclaimedIn(line)).toEqual([]);
  });

  it("finds no unclaimed capability sentence on each failure card and the scanning card", () => {
    for (const card of [...Object.values(FAILURE_CARDS), LOAD_FAILED_CARD]) {
      const shown = render(
        <FailureCard
          sentence={card.sentence}
          next={card.next}
          actions={[TRY_DEMO_REPO, TRY_AGAIN, BACK_TO_SAMPLE].map((label) => ({ label, onPress: () => undefined }))}
        />,
      );
      expect(unclaimed(shown.container), card.sentence).toEqual([]);
      shown.unmount();
    }
    expect(unclaimedIn("2 packages were resolved from package.json ranges: a, b")).toEqual([]);
    const view = render(<ScanningCard label="o/r" />);
    expect(unclaimed(view.container)).toEqual([]);
  });
});
