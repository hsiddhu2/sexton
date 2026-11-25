import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";

afterEach(cleanup);

const ORIGIN = "http://localhost";
const API = "https://api.example";
const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: { "color-contrast": { enabled: false } },
};

const demoFetch = ((): Promise<Response> => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch;

function mount(options: { search?: string; apiBase?: string | null; fetchFn?: typeof fetch } = {}) {
  return render(
    <App
      fetchFn={options.fetchFn ?? demoFetch}
      apiBase={options.apiBase === undefined ? null : options.apiBase}
      initialSearch={options.search ?? ""}
      pageOrigin={ORIGIN}
    />,
  );
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}

async function violations(): Promise<string[]> {
  const result = await axe.run(document, AXE_OPTIONS);
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

beforeEach(() => {
  // index.html is not loaded by jsdom here; mirror what it provides.
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});

describe("axe-core, wcag2a/aa and wcag21a/aa, color-contrast off (Requirement 10.4)", () => {
  it("has no violations on the loaded Demo scan", async () => {
    const { container } = mount();
    await ready();
    expect(container.querySelectorAll("button[data-grave-index]").length).toBe(12);
    expect(await violations()).toEqual([]);
  });

  it("has no violations with the Drawer open", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(container.querySelector("button[data-grave-index]") as HTMLElement);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it("has no violations with the Legend open", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    expect(screen.getByText("Ghost: one or more advisories")).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it("has no violations on a Load error", async () => {
    mount({ search: "?scan=https%3A%2F%2Fevil.example%2Fx" });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(await violations()).toEqual([]);
  });

  it("has no violations with a grave focused and its tooltip shown", async () => {
    const { container } = mount();
    await ready();
    fireEvent.focus(container.querySelector("button[data-grave-index]") as HTMLElement);
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(await violations()).toEqual([]);
  });

  it("has no violations with the Drawer open on a package whose PR body holds a table", async () => {
    const { container } = mount();
    await ready();
    const buttons = [...container.querySelectorAll<HTMLElement>("button[data-grave-index]")];
    let found = false;
    for (const b of buttons) {
      fireEvent.click(b);
      if (screen.getByRole("dialog").querySelector(".pr-table-wrap") !== null) {
        found = true;
        break;
      }
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    }
    expect(found).toBe(true);
    expect(await violations()).toEqual([]);
  });

  it("has no violations with the repository field disabled", async () => {
    mount({ apiBase: null });
    await ready();
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(true);
    expect(await violations()).toEqual([]);
  });
});

describe("landmarks, labels and text alternatives (Requirements 10.1, 10.2, 10.6, 10.8)", () => {
  it("index.html has a lang attribute and a title", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toMatch(/<html[^>]*\blang="[a-z-]+"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it("has one h1, a header, a main and a labelled repository field", async () => {
    const { container } = mount();
    await ready();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByLabelText("Repository URL")).toBeTruthy();
  });

  it("hides the canvas and labels every grave button with name, version and state", async () => {
    const { container } = mount();
    await ready();
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-grave-index]")];
    expect(buttons).toHaveLength(12);
    for (const b of buttons) {
      expect(b.getAttribute("aria-label")).toMatch(/^.+ \S+, (Possessed|Dead|Haunted|Restless|Alive)(, \d+ advisor(y|ies))?$/);
    }
  });

  it("conveys state, policy status and notices as text", async () => {
    const { container } = mount();
    await ready();
    expect(container.querySelector(".header-policy")?.textContent).toMatch(/policy: (pass|fail)/);
    expect(container.querySelector("header")?.textContent).toContain("demo fixture, recorded data");
    fireEvent.click(container.querySelector("button[data-grave-index]") as HTMLElement);
    expect(screen.getByRole("dialog").textContent).toMatch(/State: (Possessed|Dead|Haunted|Restless|Alive)/);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    const legend = container.querySelector(".legend-panel")?.textContent ?? "";
    for (const s of ["Possessed", "Dead", "Haunted", "Restless", "Alive"]) expect(legend).toContain(s);
    expect(legend).toContain("Ghost: one or more advisories");
  });

  it("shows the disabled field notice as text", async () => {
    const { container } = mount({ apiBase: null });
    await ready();
    expect(container.querySelector(".repo-disabled")?.textContent).toContain("hosted scan");
  });
});

describe("keyboard reach (Requirement 10.5)", () => {
  it("reaches the two evidence links, the Legend control, field, submit and one grave stop by Tab, and wraps out of the page", async () => {
    const user = userEvent.setup();
    const { container } = mount({ apiBase: API });
    await ready();
    // Spec cemetery-undead, Deliberate test change 17: the header, then the roving grave, then the Footer bar: Play,
    // History date and the two Replay buttons. Spec cemetery-undead-2, Deliberate test change 2: Sound is now a stop
    // after Scan, so 12 presses and the grave at position 7.
    const seen: string[] = [];
    const reached: HTMLElement[] = [];
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      reached.push(el);
      seen.push(el.getAttribute("aria-label") ?? (el.textContent === "" ? el.getAttribute("name") : el.textContent) ?? el.tagName);
    }
    expect(seen.slice(0, 7)).toEqual(["Download evidence pack as JSON", "Download evidence pack as Markdown", "repo", "Scan", "Sound off", "Serious mode", "Legend"]);
    const first = container.querySelector<HTMLElement>('button[data-grave-index][tabindex="0"]');
    expect(first).not.toBeNull();
    expect(reached[7]).toBe(first);
    expect(seen.slice(8)).toEqual(["Play", "History date", "axios, Mar 2026", "keyv, Aug 2026"]);
    // The roving stop is the only grave in the tab sequence.
    expect(container.querySelectorAll('button[data-grave-index]:not([tabindex="-1"])')).toHaveLength(1);
  });

  it("reaches every grave by arrow keys from the roving stop", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-grave-index]")];
    buttons[0]?.focus();
    const reached = new Set<number>([0]);
    for (let i = 0; i < buttons.length; i += 1) {
      await user.keyboard("{ArrowRight}");
      reached.add(Number((document.activeElement as HTMLElement).dataset["graveIndex"]));
    }
    expect([...reached].sort((a, b) => a - b)).toEqual(buttons.map((_, i) => i));
  });

  it("traps focus only in the Drawer, and Escape leaves it and returns focus to the grave", async () => {
    const { container } = mount();
    await ready();
    const grave = container.querySelector<HTMLElement>("button[data-grave-index]") as HTMLElement;
    fireEvent.click(grave);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(grave);
  });

  it("leaves no element with a negative tab index outside the grave roving stop and the Drawer", async () => {
    const { container } = mount({ apiBase: API });
    await ready();
    const negatives = [...container.querySelectorAll<HTMLElement>('[tabindex="-1"]')];
    for (const el of negatives) expect(el.matches("button[data-grave-index]")).toBe(true);
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(false);
  });

  it("has no axe violations on a small synthetic scan", async () => {
    const small = ((): Promise<Response> => Promise.resolve(new Response(JSON.stringify(cheapScan(3)), { status: 200 }))) as typeof fetch;
    const { container } = mount({ fetchFn: small });
    await ready();
    expect(container.querySelectorAll("button[data-grave-index]")).toHaveLength(3);
    expect(await violations()).toEqual([]);
  });
});

describe("focus indicator (Requirement 10.7)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const focusRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? "").includes(":focus-visible"))
    .map((m) => ({
      selectors: (m[1] ?? "").split(",").map((s) => s.trim()),
      width: Number(/outline:\s*(\d+)px\s+solid/.exec(m[2] ?? "")?.[1] ?? "0"),
    }));

  it("gives every DOM control a focus-visible outline of at least 2px", () => {
    for (const selector of [
      ".grave-button:focus-visible",
      ".drawer button:focus-visible",
      ".drawer-body:focus-visible",
      ".legend-toggle:focus-visible",
      ".scrub input:focus-visible",
      ".scrub-play:focus-visible",
      ".serious-toggle:focus-visible",
      // Spec cemetery-undead-2, Deliberate test change 3.
      ".sound-toggle:focus-visible",
      ".replay-button:focus-visible",
      ".repo-form button:focus-visible",
      ".repo-form input:focus-visible",
      ".evidence-link:focus-visible",
      ".drawer a:focus-visible",
      ".pr-table-wrap:focus-visible",
    ]) {
      const rule = focusRules.find((r) => r.selectors.includes(selector));
      expect(rule, selector).toBeDefined();
      expect(rule?.width, selector).toBeGreaterThanOrEqual(2);
    }
  });

  it("never removes an outline without replacing it", () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});
