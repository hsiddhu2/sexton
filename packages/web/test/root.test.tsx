// Spec home-page, tasks 1.3 and 1.4: the Root (design C2): Routes, forwarding, Back and Forward, the wordmark, the
// title and the Scan box clearing (requirements 1, 3.3, 12 and 15.1). No network.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addScan, CACHE_KEY, serialise } from "../src/cache/scan-cache.js";
import { WORDMARK_NAME } from "../src/header/Wordmark.js";
import { CEMETERY_TITLE, HOME_TITLE, Root } from "../src/site/Root.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplayText } from "./support/replay-fixture.js";

const ORIGIN = "http://localhost";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});
afterEach(() => {
  cleanup();
  try {
    window.sessionStorage.clear();
  } catch {
    // none
  }
});

function at(address: string): void {
  window.history.replaceState(null, "", address);
}

function mount(apiBase: string | null = "/api") {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    const path = new URL(url, ORIGIN).pathname;
    const body = url.includes("/scan?repo=")
      ? JSON.stringify(cheapScan(3))
      : path.startsWith("/replay/axios")
        ? readReplayText("axios")
        : readDemoScanText();
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof fetch;
  render(<Root fetchFn={fetchFn} apiBase={apiBase} pageOrigin={ORIGIN} />);
  return { urls, scans: () => urls.filter((u) => u.includes("/scan?repo=")).length };
}

const onHomePage = async (): Promise<void> => {
  await waitFor(() => expect(document.querySelector(".hp")).not.toBeNull());
};
const inCemetery = async (): Promise<void> => {
  await waitFor(() => expect(document.querySelector("button[data-grave-index]")).not.toBeNull());
};

describe("the Routes (1.1 to 1.6, 15.1)", () => {
  it("shows the Home page at / with its title, and the Cemetery view at /cemetery with its own", async () => {
    mount();
    await onHomePage();
    expect(document.title).toBe(HOME_TITLE);
    cleanup();
    at("/cemetery");
    mount();
    await inCemetery();
    expect(document.title).toBe(CEMETERY_TITLE);
  });

  it("forwards /?replay= to /cemetery?replay= and /?repo= to /scan?repo= with no new entry", async () => {
    at("/?replay=axios");
    const length = window.history.length;
    mount();
    await inCemetery();
    expect(window.location.pathname).toBe("/cemetery");
    expect(window.location.search).toBe("?replay=axios");
    expect(window.history.length).toBe(length);
    cleanup();
    at("/?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb");
    mount();
    await inCemetery();
    expect(window.location.pathname).toBe("/scan");
    expect(window.location.search).toBe("?repo=a/b");
    expect(window.history.length).toBe(length);
  });

  it("forwards an unknown path to the Home page", async () => {
    at("/nowhere?x=1");
    mount();
    await onHomePage();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("shows the Route when the history API refuses, and leaves the address", async () => {
    at("/?replay=axios");
    const replace = window.history.replaceState.bind(window.history);
    window.history.replaceState = () => {
      throw new Error("refused");
    };
    try {
      mount();
      await inCemetery();
      expect(window.location.pathname).toBe("/");
    } finally {
      window.history.replaceState = replace;
    }
  });
});

describe("moving between the Home page and the Cemetery view (1.9, 3.3, 12.1, 12.4)", () => {
  it("goes to the cemetery by Try the demo, back to / by the wordmark, and Back and Forward follow", async () => {
    mount();
    await onHomePage();
    fireEvent.click(screen.getAllByRole("link", { name: "Try the demo" })[0] as HTMLElement, { button: 0 });
    await inCemetery();
    expect(window.location.pathname).toBe("/cemetery");
    fireEvent.click(screen.getByRole("link", { name: WORDMARK_NAME }), { button: 0 });
    await onHomePage();
    expect(window.location.pathname).toBe("/");
    expect(document.title).toBe(HOME_TITLE);
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await inCemetery();
    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await onHomePage();
  });

  it("starts the Live scan from the Home page Scan box, and the Scan boxes are empty after a return to /", async () => {
    const rec = mount();
    await onHomePage();
    fireEvent.change(screen.getByLabelText("GitHub repository"), { target: { value: "https://github.com/a/b" } });
    fireEvent.submit(screen.getByLabelText("GitHub repository").closest("form") as HTMLFormElement);
    await waitFor(() => expect(document.querySelectorAll("button[data-grave-index]").length).toBe(3));
    expect(window.location.pathname).toBe("/scan");
    expect(window.location.search).toBe("?repo=a/b");
    expect(rec.scans()).toBe(1);
    fireEvent.click(screen.getByRole("link", { name: WORDMARK_NAME }), { button: 0 });
    await onHomePage();
    expect((screen.getByLabelText("GitHub repository") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getAllByRole("link", { name: "Try the demo" })[0] as HTMLElement, { button: 0 });
    await inCemetery();
    expect((screen.getByLabelText("GitHub repository to scan") as HTMLInputElement).value).toBe("");
  });

  it("goes to / from a Live scan, a Replay and the Guide page by the Overview tab, with the Scan boxes empty (12.4, 12.6)", async () => {
    for (const address of ["/scan?repo=a/b", "/cemetery?replay=axios", "/cemetery?page=guide"]) {
      at(address);
      cleanup();
      const rec = mount();
      if (address.startsWith("/scan")) {
        await waitFor(() => expect(screen.getByLabelText("GitHub repository to scan")).not.toBeNull());
        fireEvent.submit(screen.getByLabelText("GitHub repository to scan").closest("form") as HTMLFormElement);
        await waitFor(() => expect(document.querySelectorAll("button[data-grave-index]").length).toBe(3));
        expect(rec.scans()).toBe(1);
      } else {
        await waitFor(() => expect(screen.getByRole("link", { name: "Overview" })).not.toBeNull());
      }
      expect(screen.getByRole("link", { name: "Cemetery" }).getAttribute("aria-current")).toBe("page");
      const link = screen.getByRole("link", { name: "Overview" });
      expect(link.getAttribute("href")).toBe("/");
      fireEvent.click(link, { button: 0 });
      await onHomePage();
      expect(window.location.pathname).toBe("/");
      expect(window.location.search).toBe("");
      expect(document.title).toBe(HOME_TITLE);
      expect((screen.getByLabelText("GitHub repository") as HTMLInputElement).value).toBe("");
      fireEvent.click(screen.getAllByRole("link", { name: "Try the demo" })[0] as HTMLElement, { button: 0 });
      await inCemetery();
      expect((screen.getByLabelText("GitHub repository to scan") as HTMLInputElement).value).toBe("");
    }
  });

  it("goes to /cemetery by the Cemetery tab on the Home page, and takes the Home action with it from a Replay and the Guide page (12.6)", async () => {
    mount();
    await onHomePage();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("link", { name: "Cemetery" }), { button: 0 });
    await inCemetery();
    expect(window.location.pathname).toBe("/cemetery");
    expect(window.location.search).toBe("");
    for (const open of ["Watch a real attack", "What is Sexton?"]) {
      if (open === "Watch a real attack") {
        fireEvent.click(screen.getByRole("button", { name: open }));
        fireEvent.click(await screen.findByRole("button", { name: /^axios/ }));
        await waitFor(() => expect(window.location.search).toBe("?replay=axios"));
      } else {
        fireEvent.click(screen.getByRole("button", { name: open }));
        await waitFor(() => expect(window.location.search).toBe("?page=guide"));
      }
      expect(screen.getByRole("link", { name: "Cemetery" }).getAttribute("aria-current")).toBe("page");
      fireEvent.click(screen.getByRole("link", { name: "Cemetery" }), { button: 0 });
      await inCemetery();
      expect(window.location.pathname).toBe("/cemetery");
      expect(window.location.search).toBe("");
    }
  });

  it("shows a Fresh Entry from a Recent scans row on the Home page with no request", async () => {
    window.localStorage.setItem(CACHE_KEY, serialise(addScan([], "a/b", cheapScan(2), Date.now() - 1000)));
    const rec = mount();
    await onHomePage();
    fireEvent.click(screen.getByRole("button", { name: /a\/b/ }));
    await waitFor(() => expect(document.querySelectorAll("button[data-grave-index]").length).toBe(2));
    expect(rec.scans()).toBe(0);
    expect(screen.getByText("Scanned just now")).not.toBeNull();
  });
});
