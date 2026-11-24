import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { arbScanResponse, cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";

afterEach(cleanup);

const ORIGIN = "http://localhost";
const API = "https://api.example";

interface Recorder {
  readonly fetchFn: typeof fetch;
  readonly urls: string[];
}

function recorder(respond: (url: string) => ScanResponse | Promise<Response>): Recorder {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    const out = respond(url);
    if (out instanceof Promise) return out;
    return Promise.resolve(new Response(JSON.stringify(out), { status: 200 }));
  }) as typeof fetch;
  return { fetchFn, urls };
}

function mount(rec: Recorder, options: { search?: string; apiBase?: string | null } = {}) {
  return render(
    <App fetchFn={rec.fetchFn} apiBase={options.apiBase ?? null} initialSearch={options.search ?? ""} pageOrigin={ORIGIN} />,
  );
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}

describe("Property 9: Rendering never throws for 0 to 300 packages (App part)", () => {
  it("Feature: cemetery-ui, Property 9: Rendering never throws for 0 to 300 packages", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(arbScanResponse, fc.constantFrom(0, 1, 300).map(cheapScan)), async (response) => {
        const rec = recorder(() => response);
        const { container, unmount } = mount(rec);
        await ready();
        expect(container.querySelector("header")).not.toBeNull();
        expect(container.querySelectorAll("button[data-grave-index]").length).toBe(response.report.packages.length);
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

describe("App", () => {
  it("loads the demo address by default and labels it as the demo", async () => {
    const rec = recorder(() => cheapScan(2));
    const { container } = mount(rec);
    expect(screen.getByRole("status").textContent).toBe("Loading the scan");
    expect(container.querySelector("canvas")).toBeNull();
    await ready();
    expect(rec.urls).toEqual(["http://localhost/demo/scan.json"]);
    expect(container.textContent).toContain("demo fixture, recorded data");
    expect(container.querySelectorAll("button[data-grave-index]").length).toBe(2);
  });

  it("loads the scan parameter without the demo label", async () => {
    const rec = recorder(() => cheapScan(1));
    const { container } = mount(rec, { search: "?scan=%2Fother.json" });
    await ready();
    expect(rec.urls).toEqual(["http://localhost/other.json"]);
    expect(container.textContent).not.toContain("demo fixture, recorded data");
  });

  it("shows a load error with no scene, no grave button and no drawer, and issues no request for a rejected address", async () => {
    const rec = recorder(() => cheapScan(1));
    const { container } = mount(rec, { search: "?scan=https%3A%2F%2Fevil.example%2Fx" });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("scan-url-rejected");
    });
    expect(rec.urls).toEqual([]);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("button[data-grave-index]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.textContent).not.toContain("evil.example");
  });

  it("shows invalid-response errors as path, code and message", async () => {
    const rec = recorder(() => Promise.resolve(new Response(JSON.stringify({ report: 1 }), { status: 200 })));
    const { container } = mount(rec);
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("invalid-response");
    });
    expect(container.querySelector(".load-error li")?.textContent).toContain("/");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("shows the disabled field text when no API base URL is configured", async () => {
    const rec = recorder(() => cheapScan(1));
    const { container } = mount(rec);
    await ready();
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(true);
    expect(container.textContent).toContain("hosted scan arrives with release 0.1 infra");
  });

  it("keeps the header live and the page inert while the drawer is open", async () => {
    const rec = recorder(() => cheapScan(2));
    const { container } = mount(rec);
    await ready();
    const header = container.querySelector("header") as HTMLElement;
    expect(header.closest("[inert]")).toBeNull();
    fireEvent.click(container.querySelector("button[data-grave-index]") as HTMLElement);
    const dialog = screen.getByRole("dialog");
    expect(header.closest("[inert]")).toBeNull();
    expect(container.querySelector("main")?.closest("[inert]")).not.toBeNull();
    expect(dialog.closest("[inert]")).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(header.closest("[inert]")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
  });

  it("resets the selection and closes the drawer when a new response loads", async () => {
    const rec = recorder(() => cheapScan(3));
    const { container } = mount(rec, { apiBase: API });
    await ready();
    const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>("button[data-grave-index]")];
    fireEvent.click(buttons()[2] as HTMLButtonElement);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Repository URL"), { target: { value: "https://github.com/o/r" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await ready();
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    expect((container.querySelector("header") as HTMLElement).closest("[inert]")).toBeNull();
    expect(within(container).queryByText("demo fixture, recorded data")).toBeNull();
  });

  it("requests only the demo address, the accepted scan address and the API scan endpoint", async () => {
    const rec = recorder(() => cheapScan(1));
    const { container } = mount(rec, { apiBase: API });
    await ready();
    fireEvent.change(screen.getByLabelText("Repository URL"), { target: { value: "https://github.com/o/r" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await ready();
    expect(rec.urls).toEqual([
      "http://localhost/demo/scan.json",
      `${API}/scan?repo=${encodeURIComponent("https://github.com/o/r")}`,
    ]);
    for (const url of rec.urls) expect(url).not.toMatch(/registry\.npmjs|deps\.dev|osv\.dev|github\.com\/|githubusercontent/);
  });

  it("accepts a 200 character repository URL and refuses 201 without a request", async () => {
    const rec = recorder(() => cheapScan(1));
    const { container } = mount(rec, { apiBase: API });
    await ready();
    const form = container.querySelector("form") as HTMLFormElement;
    const input = screen.getByLabelText("Repository URL");
    fireEvent.change(input, { target: { value: "x".repeat(201) } });
    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toBe("Enter a repository URL of 1 to 200 characters.");
    expect(rec.urls.length).toBe(1);
    fireEvent.change(input, { target: { value: "x".repeat(200) } });
    fireEvent.submit(form);
    await ready();
    expect(rec.urls.length).toBe(2);
    expect(rec.urls[1]).toBe(`${API}/scan?repo=${"x".repeat(200)}`);
  });
});

describe("App demo scan", () => {
  const demoRecorder = (): Recorder => {
    const urls: string[] = [];
    const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
      urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return Promise.resolve(new Response(readDemoScanText(), { status: 200 }));
    }) as typeof fetch;
    return { fetchFn, urls };
  };

  it("serves the Demo scan on the default load with twelve grave buttons and the demo label", async () => {
    const rec = demoRecorder();
    const { container } = mount(rec);
    await ready();
    expect(rec.urls).toEqual(["http://localhost/demo/scan.json"]);
    expect(container.querySelectorAll("button[data-grave-index]").length).toBe(12);
    expect(container.querySelector("header")?.textContent).toContain("demo fixture, recorded data");
  });

  it("shows no demo label for a non-demo load of the same body", async () => {
    const rec = demoRecorder();
    const { container } = mount(rec, { search: "?scan=%2Fother.json" });
    await ready();
    expect(rec.urls).toEqual(["http://localhost/other.json"]);
    expect(container.querySelectorAll("button[data-grave-index]").length).toBe(12);
    expect(container.textContent).not.toContain("demo fixture, recorded data");
    expect(container.querySelector(".header-evidence")).toBeNull();
  });

  // Spec evidence-pack, Requirement 8.2: links per load source, and no fetch of the evidence.
  it("links the demo evidence for the demo, also through ?scan=, and fetches no evidence", async () => {
    for (const search of ["", "?scan=%2Fdemo%2Fscan.json"]) {
      const rec = demoRecorder();
      const { container, unmount } = mount(rec, { search });
      await ready();
      const links = [...container.querySelectorAll(".header-evidence a")].map((a) => a.getAttribute("href"));
      expect(links).toEqual(["/demo/evidence.json", "/demo/evidence.md"]);
      expect(rec.urls.some((u) => u.includes("evidence"))).toBe(false);
      unmount();
    }
  });

  it("links the API evidence endpoint for a scan requested through the form", async () => {
    const rec = demoRecorder();
    const { container } = mount(rec, { apiBase: API, search: "?scan=%2Fother.json" });
    await ready();
    expect(container.querySelector(".header-evidence")).toBeNull();
    fireEvent.change(container.querySelector("input[name=repo]") as HTMLInputElement, { target: { value: "https://github.com/acme/app" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await ready();
    await waitFor(() => {
      expect(container.querySelector(".header-evidence")).not.toBeNull();
    });
    // The demo body names sexton-demo/fixture in its scan metadata, so the link carries that canonical URL.
    const repo = encodeURIComponent("https://github.com/sexton-demo/fixture");
    const links = [...container.querySelectorAll(".header-evidence a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([`${API}/evidence?repo=${repo}&format=json`, `${API}/evidence?repo=${repo}&format=md`]);
    expect(rec.urls.some((u) => u.includes("evidence"))).toBe(false);
  });
});

describe("App loading, error and empty states (cemetery-polish task 8)", () => {
  it("shows a loading card with a hidden spinner, removes it after the load and keeps the header summary", async () => {
    const rec = recorder(() => cheapScan(2));
    const { container } = mount(rec);
    const card = screen.getByRole("status");
    expect(card.classList.contains("loading-card")).toBe(true);
    expect(card.querySelector(".loading-spinner")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".header-summary")).not.toBeNull();
    await ready();
    expect(container.querySelector(".loading-card")).toBeNull();
    expect(container.querySelector(".header-summary")).not.toBeNull();
  });

  it("shows the error panel with an alert, the heading and the code in a code element", async () => {
    const rec = recorder(() => cheapScan(1));
    const { container } = mount(rec, { search: "?scan=https%3A%2F%2Fevil.example%2Fx" });
    const alert = await screen.findByRole("alert");
    expect(alert.querySelector("h2")?.textContent).toBe("Scan could not be loaded");
    expect(alert.querySelector("code")?.textContent).toBe("scan-url-rejected");
    expect(container.querySelector("main.panel-main")).not.toBeNull();
  });

  it("shows the empty state text and no canvas for a scan with no packages", async () => {
    const rec = recorder(() => cheapScan(0));
    const { container } = mount(rec);
    await ready();
    expect(container.querySelector(".cemetery-empty")?.textContent).toBe("no direct dependencies in this scan");
    expect(container.querySelector("canvas")).toBeNull();
  });
});

// Spec cemetery-time-fixes, task 4.6: an omitted history (requirements 6.4, 6.5).
describe("App omitted history", () => {
  it("shows the omitted line directly under the header in place of the scrubber, and no slider", async () => {
    const rec = recorder(() => ({ ...cheapScan(3), timelinesOmitted: "too-large" }));
    const { container } = mount(rec);
    await ready();
    const lines = container.querySelectorAll("p.history-omitted");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe("History is not shown for this scan because it is too large.");
    expect(lines[0]?.previousElementSibling?.matches("header.site-header")).toBe(true);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(container.querySelector(".scrub")).toBeNull();
    expect(lines[0]?.getAttribute("aria-live")).toBeNull();
  });

  it("shows neither the scrubber nor the omitted line for a response with neither field", async () => {
    const rec = recorder(() => cheapScan(3));
    const { container } = mount(rec);
    await ready();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(container.querySelector(".history-omitted")).toBeNull();
    expect(screen.queryByText("History is not shown for this scan because it is too large.")).toBeNull();
  });
});
