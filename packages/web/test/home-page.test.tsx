// Spec home-page, tasks 3.2 and 3.3: the Home page (design C3; requirements 2 to 10, 14 and 16.8).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addScan, CACHE_KEY, serialise } from "../src/cache/scan-cache.js";
import { claim } from "../src/copy/claims.js";
import { GITHUB_URL, L, POWER_URL } from "../src/copy/home.js";
import { REPO_INPUT_HINT } from "../src/header/repo-input.js";
import { HomePage, scanAddress } from "../src/home-page/HomePage.js";
import { CLEAR_TEXT, RECENT_HEADING } from "../src/home-page/RecentScans.js";
import { DEMO_VIDEO_URL, videoUrl } from "../src/home-page/video.js";
import { HOSTED_UNAVAILABLE_TEXT } from "../src/load/use-scan-loader.js";
import { cheapScan } from "./arbitraries.js";

afterEach(cleanup);
const T0 = 1_795_000_000_000;

function mount(options: { apiBase?: string | null; video?: string | null; now?: () => number } = {}) {
  const onNavigate = vi.fn();
  const view = render(
    <HomePage
      apiBase={options.apiBase === undefined ? "/api" : options.apiBase}
      onNavigate={onNavigate}
      now={options.now ?? (() => T0)}
      {...(options.video !== undefined ? { video: options.video } : {})}
    />,
  );
  return { onNavigate, view };
}

function link(name: string, index = 0): HTMLAnchorElement {
  return screen.getAllByRole("link", { name })[index] as HTMLAnchorElement;
}

/** Makes matchMedia report the Narrow layout, or not, until the returned function restores it. */
function narrowMedia(matches: boolean): () => void {
  const before = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: matches && query === "(max-width: 699px)", media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = before;
  };
}

describe("the sections, in the order of requirements 2 to 10 (16.8)", () => {
  it("shows one h1 and the regions in order, each named by its heading", () => {
    const { view } = mount({ video: "https://example.org/demo" });
    expect(view.container.querySelectorAll("h1")).toHaveLength(1);
    const regions = [...view.container.querySelectorAll("main > section")].map((s) => [s.id, s.querySelector("h1, h2")?.textContent]);
    expect(regions).toEqual([
      ["top", claim("home.hero.title")],
      ["attacks", L.attacksHeading],
      ["how", L.howHeading],
      ["where", L.whereHeading],
      ["kiro", L.kiroHeading],
      ["video", L.videoHeading],
      ["roadmap", L.roadmapHeading],
      ["open", L.openHeading],
    ]);
    for (const [, name] of regions) expect(screen.getByRole("region", { name: name as string })).not.toBeNull();
  });

  it("holds the Top bar: the wordmark, the tabs with Overview current, then GitHub and Try the demo, and keeps the section ids (2.1, 2.2, 12.5 to 12.7)", () => {
    const { onNavigate } = mount();
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    for (const id of ["attacks", "how", "where", "kiro", "roadmap", "open"]) expect(document.getElementById(id)).not.toBeNull();
    const header = document.querySelector("header.site-header") as HTMLElement;
    expect([...header.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])).toEqual([
      ["Sexton", "/", null],
      ["Overview", "/", "page"],
      ["Cemetery", "/cemetery", null],
      [L.github, GITHUB_URL, null],
      [L.tryDemo, "/cemetery", null],
    ]);
    const cemetery = within(header).getByRole("link", { name: "Cemetery" });
    expect(fireEvent.click(cemetery, { button: 0 })).toBe(false);
    expect(onNavigate).toHaveBeenLastCalledWith("/cemetery");
    expect(fireEvent.click(cemetery, { button: 0, ctrlKey: true })).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    // Overview does what the wordmark does on the Home page: back to "/" at its top, with no new entry (12.1, 12.6).
    window.history.replaceState(null, "", "/#how");
    const length = window.history.length;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    expect(fireEvent.click(within(header).getByRole("link", { name: "Overview" }), { button: 0 })).toBe(false);
    expect(`${window.location.pathname}${window.location.hash}`).toBe("/");
    expect(window.history.length).toBe(length);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockRestore();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("gives every in-site link a real address and follows it through the Route on a plain press", () => {
    const { onNavigate } = mount();
    const cases: [string, number, string][] = [
      [L.tryDemo, 0, "/cemetery"],
      [L.walk, 0, "/cemetery"],
      [L.axiosLink, 0, "/cemetery?replay=axios"],
      [L.keyvLink, 0, "/cemetery?replay=keyv"],
      [L.tryDemo, 1, "/cemetery"],
    ];
    for (const [name, i, to] of cases) {
      expect(link(name, i).getAttribute("href")).toBe(to);
      expect(fireEvent.click(link(name, i), { button: 0 })).toBe(false);
      expect(onNavigate).toHaveBeenLastCalledWith(to, undefined);
    }
    expect(fireEvent.click(link(L.walk), { button: 0, ctrlKey: true })).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(cases.length);
    expect(link(L.star).getAttribute("href")).toBe(GITHUB_URL);
    expect(link(L.installPower).getAttribute("href")).toBe(POWER_URL);
  });

  it("shows the cemetery and both replay pictures with text alternatives (3.7, 4.2)", () => {
    mount();
    expect(screen.getByRole("img", { name: L.heroAlt }).getAttribute("src")).toBe("/cemetery.png");
    expect(screen.getByRole("img", { name: L.axiosAlt }).getAttribute("src")).toBe("/replay-axios.png");
    expect(screen.getByRole("img", { name: L.keyvAlt }).getAttribute("src")).toBe("/replay-keyv.png");
  });

  it("shows the short hint owner/name in the Narrow layout and the long one otherwise (3.8)", () => {
    const restore = narrowMedia(true);
    try {
      mount();
      expect(screen.getByLabelText(L.scanField).getAttribute("placeholder")).toBe("owner/name");
    } finally {
      restore();
    }
    cleanup();
    const wide = narrowMedia(false);
    try {
      mount();
      expect(screen.getByLabelText(L.scanField).getAttribute("placeholder")).toBe(L.scanPlaceholder);
    } finally {
      wide();
    }
  });

  it("opens every off-site link in a new tab with rel noopener noreferrer, and keeps in-site links in the tab (2.5)", () => {
    const { view } = mount({ video: "https://example.com/demo" });
    const links = [...view.container.querySelectorAll("a")];
    const offSite = links.filter((a) => /^[a-z][a-z0-9+.-]*:/i.test(a.getAttribute("href") ?? ""));
    expect(offSite.length).toBeGreaterThanOrEqual(4);
    for (const a of offSite) {
      const name = a.textContent ?? "";
      expect(a.getAttribute("target"), name).toBe("_blank");
      expect((a.getAttribute("rel") ?? "").split(/\s+/).sort(), name).toEqual(["noopener", "noreferrer"]);
    }
    for (const a of links.filter((x) => !offSite.includes(x))) expect(a.getAttribute("target"), a.getAttribute("href") ?? "").toBeNull();
  });

  it("shows four steps, then the five states in order with their state classes (5.1, 5.2)", () => {
    const { view } = mount();
    expect([...view.container.querySelectorAll(".hp-step h3")].map((h) => h.textContent)).toEqual([...L.steps]);
    expect([...view.container.querySelectorAll(".hp-state")].map((s) => [s.className, s.querySelector(".hp-state-name")?.textContent])).toEqual(
      ["Possessed", "Dead", "Haunted", "Restless", "Alive"].map((s) => [`hp-state hp-state-${s.toLowerCase()}`, s]),
    );
  });

  it("labels the five places with their status (6.2)", () => {
    const { view } = mount();
    expect([...view.container.querySelectorAll(".hp-where")].map((c) => [c.querySelector("h3")?.textContent, c.querySelector(".hp-status")?.textContent])).toEqual([
      ["The cemetery", "Live"],
      ["The CLI", "On main · npm release next"],
      ["GitHub Action", "On main"],
      ["Kiro Power", "On main"],
      ["Evidence pack", "On main"],
    ]);
  });

  it("draws four headstones on a hidden path with 0.1 lit (9.1 to 9.3)", () => {
    const { view } = mount();
    expect(view.container.querySelector(".hp-path-line")?.getAttribute("aria-hidden")).toBe("true");
    const stops = [...view.container.querySelectorAll("ol.hp-grid-roadmap > li")];
    expect(stops.map((s) => [s.querySelector(".hp-stone")?.textContent, s.querySelector(".hp-stop-label")?.textContent, s.classList.contains("hp-stop-lit")])).toEqual([
      ["0.1", "Now", true],
      ["0.2", "Next", false],
      ["0.3", "Later", false],
      ["1.0", "The far field", false],
    ]);
  });

  it("shows the owner line and the track's credit in the footer (10.2)", () => {
    const { view } = mount();
    const footer = view.container.querySelector(".hp-footer") as HTMLElement;
    expect(footer.textContent).toContain(claim("home.footer.owner"));
    expect(footer.textContent).toContain("Music: Ghost Party by The Piano Says, CC BY 3.0");
  });
});

describe("the demo video (requirement 8)", () => {
  it("ships with no URL, and renders no part of the section or a placeholder then", () => {
    expect(DEMO_VIDEO_URL).toBeNull();
    const { view } = mount();
    expect(document.getElementById("video")).toBeNull();
    expect(view.container.textContent).not.toMatch(/DEMO VIDEO|placeholder|three minutes/i);
  });

  it("renders a link, not a frame, only for an https URL", () => {
    expect(videoUrl("http://example.org/v")).toBeNull();
    expect(videoUrl("javascript:alert(1)")).toBeNull();
    expect(videoUrl("not a url")).toBeNull();
    const { view } = mount({ video: "https://example.org/v" });
    expect(link(L.videoLink).getAttribute("href")).toBe("https://example.org/v");
    expect(view.container.querySelector("iframe, video")).toBeNull();
  });
});

describe("the Scan box (3.2 to 3.5)", () => {
  it("goes to /scan?repo=<owner/name> with the scan intent for accepted input", () => {
    const { onNavigate } = mount();
    const field = screen.getByLabelText(L.scanField) as HTMLInputElement;
    expect(field.value).toBe("");
    fireEvent.change(field, { target: { value: "https://github.com/expressjs/express.git" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onNavigate).toHaveBeenCalledWith("/scan?repo=expressjs/express", "scan");
    expect(scanAddress("a/b")).toBe("/scan?repo=a/b");
  });

  it("keeps focus and shows the hint for refused input, going nowhere", () => {
    const { onNavigate } = mount();
    const field = screen.getByLabelText(L.scanField) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "not a repo" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(screen.getByRole("alert").textContent).toBe(REPO_INPUT_HINT);
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("is disabled and described by the off text with no API base", () => {
    const { onNavigate } = mount({ apiBase: null });
    const field = screen.getByLabelText(L.scanField) as HTMLInputElement;
    expect(field.disabled).toBe(true);
    expect((screen.getByRole("button", { name: L.scanButton }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(HOSTED_UNAVAILABLE_TEXT);
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("Recent scans on the Home page (14.1, 14.3 to 14.5)", () => {
  it("lists the Entries newest first with their ages, scans from a row, and Clear empties the store", () => {
    window.localStorage.setItem(CACHE_KEY, serialise(addScan(addScan([], "o/old", cheapScan(1), T0 - 3 * 86_400_000), "a/b", cheapScan(1), T0 - 30_000)));
    const { onNavigate } = mount();
    const group = screen.getByRole("group", { name: RECENT_HEADING });
    expect([...group.querySelectorAll(".recent-row")].map((r) => [r.querySelector(".recent-repo")?.textContent, r.querySelector(".recent-age")?.textContent])).toEqual([
      ["a/b", "just now"],
      ["o/old", "3 d ago"],
    ]);
    fireEvent.click(within(group).getByRole("button", { name: /o\/old/ }));
    expect(onNavigate).toHaveBeenCalledWith("/scan?repo=o/old", "scan");
    fireEvent.click(within(group).getByRole("button", { name: CLEAR_TEXT }));
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(screen.queryByRole("group", { name: RECENT_HEADING })).toBeNull();
  });

  it("shows nothing with an empty store", () => {
    mount();
    expect(screen.queryByText(RECENT_HEADING)).toBeNull();
    expect(screen.queryByRole("button", { name: CLEAR_TEXT })).toBeNull();
  });
});
