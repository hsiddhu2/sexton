// The drawer's "Open pull request" button. Spec: .kiro/specs/remediate, Requirement 9.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import type { ScanResponse } from "@sexton/api";
import { App } from "../src/App.js";
import { DEMO_ONLY_TEXT, Drawer, OPEN_PR_TEXT, PR_LINK_TEXT } from "../src/drawer/Drawer.js";
import { drawerModel } from "../src/drawer/drawer-model.js";
import { OUTCOME_TEXT, PR_PREFIX, requestRemediation } from "../src/load/remediate-client.js";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { readDemoScan } from "./support/demo-scan.js";

afterEach(cleanup);

const API = "/api";
const DEMO = readDemoScan() as ScanResponse;
const proposed = DEMO.remediations?.find((r) => r.status === "proposed" && r.intent !== undefined);
if (proposed === undefined) throw new Error("the demo scan has no proposed plan with an intent");
const PKG = DEMO.report.packages.find((p) => p.name === proposed.packageName);
if (PKG === undefined) throw new Error("demo package missing");
const HOSTED: ScanResponse = { ...DEMO, actions: { remediate: true } };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("validator: actions (9.1)", () => {
  it("accepts { remediate: boolean } and rejects any other key or type, naming no key", () => {
    expect(validateScanResponse({ ...DEMO, actions: { remediate: true } }).ok).toBe(true);
    const extra = validateScanResponse({ ...DEMO, actions: { remediate: true, merge: true } });
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.errors.map((e) => e.path)).toEqual(["/actions"]);
    expect(validateScanResponse({ ...DEMO, actions: { remediate: "yes" } }).ok).toBe(false);
    expect(validateScanResponse({ ...DEMO, actions: [] }).ok).toBe(false);
  });
});

describe("requestRemediation (9.3)", () => {
  it("POSTs the body with its SHA-256 and shows the link only with the demo prefix", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse(200, { status: "opened", prUrl: `${PR_PREFIX}7`, logged: true }));
    }) as unknown as typeof fetch;
    const view = await requestRemediation(fetchFn, API, "https://github.com/hsiddhu2/sexton-demo", "node-sass");
    expect(view).toEqual({ status: "opened", prUrl: `${PR_PREFIX}7`, text: OUTCOME_TEXT.opened });
    const body = String(calls[0]?.init.body);
    expect(calls[0]?.url).toBe("/api/remediate");
    expect(JSON.parse(body)).toEqual({ repo: "https://github.com/hsiddhu2/sexton-demo", package: "node-sass" });
    const hash = (calls[0]?.init.headers as Record<string, string>)["x-amz-content-sha256"];
    const expected = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hash).toBe(expected);
  });

  it.each([
    ["an HTML page (a 403 the distribution rewrote)", new Response("<!doctype html>", { status: 200 }), "failed"],
    ["a prUrl on another repository", jsonResponse(200, { status: "existing", prUrl: "https://example.com/pull/1" }), "existing"],
    ["a refusal", jsonResponse(200, { status: "refused", reason: "head commit unknown" }), "refused"],
    ["the allowlist answer", jsonResponse(422, { code: "repository-not-allowed", message: "m" }), "refused"],
    ["a 500", jsonResponse(500, { code: "internal-error" }), "failed"],
  ])("handles %s", async (_, response, status) => {
    const view = await requestRemediation((() => Promise.resolve(response)) as unknown as typeof fetch, API, "r", "p");
    expect(view.status).toBe(status);
    if (status === "existing") expect(view.prUrl).toBeNull();
  });
});

describe("Drawer button (9.2 to 9.4)", () => {
  it("shows the demo-only text and no button without onRemediate", () => {
    render(<Drawer model={drawerModel(DEMO, PKG)} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(DEMO_ONLY_TEXT);
    expect(within(dialog).queryByRole("button", { name: OPEN_PR_TEXT })).toBeNull();
  });

  it("opens the pull request, stays focusable while in flight, and links with noopener noreferrer", async () => {
    let resolve: (v: { status: "opened"; prUrl: string; text: string }) => void = () => undefined;
    const onRemediate = () => new Promise<{ status: "opened"; prUrl: string; text: string }>((r) => (resolve = r));
    render(<Drawer model={drawerModel(HOSTED, PKG)} onClose={() => undefined} onRemediate={onRemediate} />);
    const button = screen.getByRole("button", { name: OPEN_PR_TEXT });
    button.focus();
    fireEvent.click(button);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button);
    resolve({ status: "opened", prUrl: `${PR_PREFIX}3`, text: OUTCOME_TEXT.opened });
    const link = await screen.findByRole("link", { name: PR_LINK_TEXT });
    expect(link.getAttribute("href")).toBe(`${PR_PREFIX}3`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(OUTCOME_TEXT.opened)).toBeTruthy();
    expect(button.getAttribute("aria-disabled")).toBe("false");
    const result = await axe.run(screen.getByRole("dialog"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  it("never shows a link without the prefix", async () => {
    render(<Drawer model={drawerModel(HOSTED, PKG)} onClose={() => undefined} onRemediate={() => Promise.resolve({ status: "existing", prUrl: "https://evil.example/pull/1", text: "x" })} />);
    fireEvent.click(screen.getByRole("button", { name: OPEN_PR_TEXT }));
    await waitFor(() => expect(screen.getByText("x")).toBeTruthy());
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("App wiring (9.2, 9.4)", () => {
  async function openDrawer(container: HTMLElement): Promise<void> {
    await waitFor(() => expect(container.querySelector(`[aria-label*="${PKG?.name ?? ""}"]`)).not.toBeNull());
    fireEvent.click(container.querySelector(`[aria-label*="${PKG?.name ?? ""}"]`) as HTMLElement);
  }

  it("shows the button for a hosted scan with actions.remediate true", async () => {
    const fetchFn = ((url: string) => Promise.resolve(new Response(JSON.stringify(String(url).includes("/scan?") ? HOSTED : DEMO), { status: 200 }))) as unknown as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={API} initialSearch="" pageOrigin="http://localhost" />);
    await waitFor(() => expect(screen.getByLabelText("GitHub repository to scan")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("GitHub repository to scan"), { target: { value: "https://github.com/hsiddhu2/sexton-demo" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await openDrawer(container);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: OPEN_PR_TEXT })).toBeTruthy();
  });

  it("never shows the button for the demo fixture", async () => {
    const fetchFn = (() => Promise.resolve(new Response(JSON.stringify(HOSTED), { status: 200 }))) as unknown as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={API} initialSearch="" pageOrigin="http://localhost" />);
    await openDrawer(container);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: OPEN_PR_TEXT })).toBeNull();
    expect(screen.getByRole("dialog").textContent).toContain(DEMO_ONLY_TEXT);
  });
});
