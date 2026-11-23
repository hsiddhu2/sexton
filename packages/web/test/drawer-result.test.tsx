// Spec cemetery-polish, task 7: Result area, readable values and the Repository URL box.

import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { Drawer, OPEN_PR_TEXT } from "../src/drawer/Drawer.js";
import { drawerModel } from "../src/drawer/drawer-model.js";
import { displayValue } from "../src/drawer/format-value.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

afterEach(cleanup);

const DEMO = readDemoScan() as ScanResponse;
const proposed = DEMO.remediations?.find((r) => r.status === "proposed" && r.intent !== undefined);
if (proposed === undefined) throw new Error("the demo scan has no proposed plan with an intent");
const PKG = DEMO.report.packages.find((p) => p.name === proposed.packageName);
if (PKG === undefined) throw new Error("demo package missing");

const never = (): Promise<never> => new Promise(() => undefined);

describe("displayValue", () => {
  it("reads single values inline and unquoted, objects and arrays as blocks, broken text as it is", () => {
    expect(displayValue('"abc"')).toEqual({ kind: "inline", text: "abc" });
    expect(displayValue("42")).toEqual({ kind: "inline", text: "42" });
    expect(displayValue("true")).toEqual({ kind: "inline", text: "true" });
    expect(displayValue("null")).toEqual({ kind: "inline", text: "null" });
    expect(displayValue('{\n  "a": 1\n}')).toEqual({ kind: "block", text: '{\n  "a": 1\n}' });
    expect(displayValue("[1]")).toEqual({ kind: "block", text: "[1]" });
    expect(displayValue("value cannot be displayed")).toEqual({ kind: "inline", text: "value cannot be displayed" });
  });
});

describe("Drawer Result area", () => {
  it("keeps the button, status and link outside the scrolling body, with the status before any request", () => {
    render(<Drawer model={drawerModel(DEMO, PKG)} onClose={() => undefined} onRemediate={never} />);
    const dialog = screen.getByRole("dialog");
    const body = dialog.querySelector(".drawer-body") as HTMLElement;
    const result = dialog.querySelector(".drawer-result") as HTMLElement;
    expect(result).not.toBeNull();
    expect(body.contains(result)).toBe(false);
    const button = within(dialog).getByRole("button", { name: OPEN_PR_TEXT });
    expect(result.contains(button)).toBe(true);
    expect(body.contains(button)).toBe(false);
    const status = result.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(body.contains(status)).toBe(false);
  });

  it("tabs from Close to the body and then to the Result area", () => {
    render(<Drawer model={drawerModel(DEMO, PKG)} onClose={() => undefined} onRemediate={never} />);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close" });
    const body = dialog.querySelector(".drawer-body") as HTMLElement;
    const button = within(dialog).getByRole("button", { name: OPEN_PR_TEXT });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(body);
    let guard = 0;
    while (document.activeElement !== button && guard < 100) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
      guard += 1;
    }
    expect(document.activeElement).toBe(button);
    expect(body.contains(button)).toBe(false);
  });

  it("shows fetchedAt in a time element and 'not recorded' as plain text", () => {
    render(<Drawer model={drawerModel(DEMO, PKG)} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    const times = [...dialog.querySelectorAll("time")];
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) expect(t.getAttribute("datetime")).not.toBeNull();
    const base = cheapScan(1);
    const pkg = base.report.packages[0];
    if (pkg === undefined) throw new Error("no package");
    const model = drawerModel(base, pkg);
    cleanup();
    render(<Drawer model={{ ...model, signals: model.signals.map((s, i) => (i === 0 ? { ...s, fetchedAt: "not recorded" } : s)) }} onClose={() => undefined} />);
    const els = screen.getAllByText("12 Nov 2026, 00:00 UTC");
    expect(els.every((e) => e.tagName === "TIME" && e.getAttribute("datetime") === "2026-11-12T00:00:00.000Z")).toBe(true);
    const plain = screen.getAllByText("not recorded");
    expect(plain.every((e) => e.tagName !== "TIME")).toBe(true);
  });
});

describe("Backdrop press on the Repository URL box", () => {
  function setup(disabled = false) {
    const ref = createRef<HTMLInputElement>();
    const input = document.createElement("input");
    input.disabled = disabled;
    document.body.appendChild(input);
    input.getBoundingClientRect = () => ({ left: 10, right: 110, top: 10, bottom: 40, width: 100, height: 30, x: 10, y: 10, toJSON: () => ({}) });
    (ref as { current: HTMLInputElement | null }).current = input;
    const view = render(<Cemetery response={cheapScan(2)} theme="dark" reducedMotion={true} repoFieldRef={ref} />);
    const grave = view.container.querySelector<HTMLButtonElement>("button[data-grave-index]") as HTMLButtonElement;
    fireEvent.click(grave);
    const backdrop = view.container.ownerDocument.querySelector(".backdrop") as HTMLElement;
    return { input, grave, backdrop };
  }

  it("focuses the field, closes the drawer and leaves focus on the field", () => {
    const { input, backdrop } = setup();
    fireEvent.mouseDown(backdrop, { clientX: 50, clientY: 20 });
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("dialog")).toBeNull();
    input.remove();
  });

  it("returns focus to the grave for a press outside the field", () => {
    const { input, grave, backdrop } = setup();
    fireEvent.mouseDown(backdrop, { clientX: 500, clientY: 500 });
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(grave);
    input.remove();
  });

  it("gives the ordinary close for a disabled field", () => {
    const { input, backdrop } = setup(true);
    fireEvent.mouseDown(backdrop, { clientX: 50, clientY: 20 });
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(document.activeElement).not.toBe(input);
    input.remove();
  });
});
