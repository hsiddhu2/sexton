// Spec clean-site, task 9: the failure cards (requirements 12.1 to 12.7) in the page, chosen from load-scan's HTTP
// status and API error code only, with their buttons.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { DRY_LINES } from "../src/copy/mischief.js";
import { resetWelcomeForTests } from "../src/guide/welcome-pref.js";
import { makeLoadError } from "../src/load/load-error.js";
import { FAILURE_CARDS, LOAD_FAILED_CARD, liveFailureCard } from "../src/load/scan-failure.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplayText } from "./support/replay-fixture.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  window.localStorage.clear();
  resetWelcomeForTests();
});

const ORIGIN = "http://localhost";
const API = "https://api.example";
const SECRET = "upstream said: token ghp_secret at /internal/path";

type Answer = (url: string) => Promise<Response>;

function mount(answer: Answer, search = "") {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return answer(url);
  }) as typeof fetch;
  return { ...render(<App fetchFn={fetchFn} apiBase={API} initialSearch={search} pageOrigin={ORIGIN} />), urls };
}
const demo = (): Promise<Response> => Promise.resolve(new Response(readDemoScanText(), { status: 200 }));
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}
function scanRepo(container: HTMLElement, repo: string): void {
  fireEvent.change(screen.getByLabelText("GitHub repository to scan"), { target: { value: repo } });
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
}
function card(): HTMLElement {
  return screen.getByRole("alert");
}

describe("liveFailureCard (12.2)", () => {
  it("reads only the status and the API code of a load error", () => {
    expect(liveFailureCard(makeLoadError("fetch-failed"))).toBe(FAILURE_CARDS.network);
    expect(liveFailureCard(makeLoadError("fetch-failed", { status: 429 }))).toBe(FAILURE_CARDS["rate-limited"]);
    expect(liveFailureCard(makeLoadError("fetch-failed", { status: 503 }))).toBe(FAILURE_CARDS.busy);
    expect(liveFailureCard(makeLoadError("fetch-failed", { status: 404, apiCode: "missing-package-json" }))).toBe(FAILURE_CARDS["not-readable"]);
    expect(liveFailureCard(makeLoadError("fetch-failed", { status: 400, apiCode: "invalid-url" }))).toBe(FAILURE_CARDS["invalid-url"]);
    expect(liveFailureCard(makeLoadError("fetch-failed", { status: 500 }))).toBe(FAILURE_CARDS.generic);
    // A response that came but was too large, not JSON or not a scan: the generic card.
    for (const code of ["too-large", "invalid-json", "invalid-response", "scan-url-rejected"] as const) expect(liveFailureCard(makeLoadError(code))).toBe(FAILURE_CARDS.generic);
  });
});

describe("the failure card of a Live scan (12.1 to 12.5)", () => {
  const cases: readonly { name: string; answer: () => Promise<Response>; id: keyof typeof FAILURE_CARDS }[] = [
    { name: "a network error", answer: () => Promise.reject(new TypeError("Failed to fetch")), id: "network" },
    { name: "429 with the WAF's rate-limited body", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "rate-limited", message: SECRET }), { status: 429 })), id: "rate-limited" },
    { name: "429 before a body code missing-package-json", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "missing-package-json" }), { status: 429 })), id: "rate-limited" },
    { name: "504 before a body code invalid-url", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "invalid-url" }), { status: 504 })), id: "busy" },
    { name: "502 with code fetch-failed", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "fetch-failed" }), { status: 502 })), id: "busy" },
    { name: "413 manifest-too-large", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "manifest-too-large" }), { status: 413 })), id: "too-large" },
    { name: "503", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "not-deployed", message: SECRET }), { status: 503 })), id: "busy" },
    { name: "404 missing-package-json", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "missing-package-json", message: SECRET }), { status: 404 })), id: "not-readable" },
    { name: "422 invalid-policy", answer: () => Promise.resolve(new Response(JSON.stringify({ code: "invalid-policy", message: SECRET }), { status: 422 })), id: "invalid-policy" },
    { name: "500 with a body that is not JSON", answer: () => Promise.resolve(new Response(SECRET, { status: 500 })), id: "generic" },
  ];

  for (const c of cases) {
    it(`shows one sentence, one next step and two buttons for ${c.name}, and no text of the body`, async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { container } = mount((url) => (url.includes("/scan?") ? c.answer() : demo()));
      await ready();
      scanRepo(container, "acme/app");
      await waitFor(() => {
        expect(card().querySelector("h2")?.textContent).toBe(FAILURE_CARDS[c.id].sentence);
      });
      expect(card().querySelector(".failure-next")?.textContent).toBe(FAILURE_CARDS[c.id].next);
      // Spec clean-site, task 13.2: the card opens with its Dry line, hidden from assistive technology (19.3, 19.4).
      expect(card().firstElementChild?.textContent).toBe(DRY_LINES[c.id]);
      expect(card().firstElementChild?.getAttribute("aria-hidden")).toBe("true");
      expect(within(card()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Try the demo repo", "Back to the sample"]);
      expect(container.closest("body")?.querySelector(".scene-card")?.contains(card())).toBe(true);
      expect(document.body.textContent).not.toContain("ghp_secret");
      for (const call of [...log.mock.calls, ...warn.mock.calls]) expect(JSON.stringify(call)).not.toContain("ghp_secret");
    });
  }

  it("starts a Live scan of hsiddhu2/sexton-demo from Try the demo repo", async () => {
    let fail = true;
    const { container, urls } = mount((url) => {
      if (url.includes("/scan?") && fail) {
        fail = false;
        return Promise.resolve(new Response(JSON.stringify({ code: "missing-package-json" }), { status: 404 }));
      }
      return demo();
    });
    await ready();
    scanRepo(container, "acme/app");
    await waitFor(() => {
      expect(card()).toBeTruthy();
    });
    fireEvent.click(within(card()).getByRole("button", { name: "Try the demo repo" }));
    await waitFor(() => {
      expect(container.querySelector("header .scan-tag")?.textContent).toBe("hsiddhu2/sexton-demo");
    });
    expect(urls.at(-1)).toBe(`${API}/scan?repo=${encodeURIComponent("https://github.com/hsiddhu2/sexton-demo")}`);
    await ready();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows Home of the Sample scan from Back to the sample", async () => {
    const { container, urls } = mount((url) => (url.includes("/scan?") ? Promise.resolve(new Response("{}", { status: 500 })) : demo()));
    await ready();
    scanRepo(container, "acme/app");
    await waitFor(() => {
      expect(card()).toBeTruthy();
    });
    fireEvent.click(within(card()).getByRole("button", { name: "Back to the sample" }));
    await ready();
    expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    expect(container.querySelector("header .scan-tag")?.textContent).toBe("Sample scan");
    expect(urls.at(-1)).toBe(`${ORIGIN}/demo/scan.json`);
  });
});

describe("the load failure card (12.7)", () => {
  it("shows it for a failed Sample scan, and Try again loads the Sample scan again", async () => {
    let fail = true;
    const { container, urls } = mount(() => {
      if (fail) {
        fail = false;
        return Promise.resolve(new Response("nope", { status: 500 }));
      }
      return demo();
    });
    await waitFor(() => {
      expect(card().querySelector("h2")?.textContent).toBe(LOAD_FAILED_CARD.sentence);
    });
    expect(card().querySelector(".failure-next")?.textContent).toBe("Try again, or open the sample.");
    expect(within(card()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Try again", "Back to the sample"]);
    fireEvent.click(within(card()).getByRole("button", { name: "Try again" }));
    await ready();
    expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    expect(urls).toEqual([`${ORIGIN}/demo/scan.json`, `${ORIGIN}/demo/scan.json`]);
  });

  it("shows it for a scan file that fails to load", async () => {
    mount(() => Promise.resolve(new Response("{", { status: 200 })), "?scan=%2Fx.json");
    await waitFor(() => {
      expect(card().querySelector("h2")?.textContent).toBe(LOAD_FAILED_CARD.sentence);
    });
  });

  it("shows it under the Replay's heading for a refused Replay file; Try again loads it again and Back to the sample goes home", async () => {
    // A static file refused by the validator is fetched once more past the cache (spec fresh-site), so both fail.
    let fails = 2;
    const { container, urls } = mount((url) => {
      if (url.endsWith("/replay/axios.json") && fails > 0) {
        fails -= 1;
        return Promise.resolve(new Response(JSON.stringify({ nope: true }), { status: 200 }));
      }
      return url.endsWith("/replay/axios.json") ? Promise.resolve(new Response(readReplayText("axios"), { status: 200 })) : demo();
    }, "?replay=axios");
    await waitFor(() => {
      expect(card().querySelector("h2")?.textContent).toBe(LOAD_FAILED_CARD.sentence);
    });
    expect(container.querySelector("h1")?.textContent).toBe("Watch the axios attack unfold");
    fireEvent.click(within(card()).getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(container.querySelector(".step-panel")).not.toBeNull();
    });
    expect(urls.filter((u) => u.endsWith("/replay/axios.json"))).toHaveLength(3);
    cleanup();
    const again = mount((url) => (url.endsWith("/replay/axios.json") ? Promise.resolve(new Response("{}", { status: 200 })) : demo()), "?replay=axios");
    await waitFor(() => {
      expect(card()).toBeTruthy();
    });
    fireEvent.click(within(card()).getByRole("button", { name: "Back to the sample" }));
    await ready();
    expect(again.container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
  });
});
