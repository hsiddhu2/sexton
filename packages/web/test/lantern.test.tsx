// Spec clean-site, task 2.1: with the tooltip gone, GraveButtons alone decides which grave holds the Lantern glow:
// the grave under the pointer, else the one with key-driven focus, and none while the drawer is open.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GraveButtons } from "../src/overlay/GraveButtons.js";
import { planScene } from "../src/scene/layout.js";
import { scenePackage } from "./arbitraries.js";

afterEach(cleanup);

const packages = [scenePackage("a", "Possessed", "none"), scenePackage("b", "Dead", "none"), scenePackage("c", "Alive", "none")];
const plan = planScene({ packages, width: 900, theme: "dark", selectedIndex: 0, ghostPhase: 0, reducedMotion: true });

function mount(suppressLantern = false) {
  const lit: (number | null)[] = [];
  const onLantern = (i: number | null): void => {
    lit.push(i);
  };
  const props = { plan, selectedIndex: 0, packages, onSelect: () => undefined, onOpen: () => undefined, onLantern };
  const view = render(<GraveButtons {...props} suppressLantern={suppressLantern} />);
  const grave = (i: number): HTMLElement => view.container.querySelector(`[data-grave-index="${String(i)}"]`) as HTMLElement;
  const rerender = (suppress: boolean): void => {
    view.rerender(<GraveButtons {...props} suppressLantern={suppress} />);
  };
  return { lit, grave, rerender, last: () => lit[lit.length - 1] };
}

describe("the Lantern glow", () => {
  it("follows the pointer, and goes when it leaves", () => {
    const m = mount();
    fireEvent.pointerEnter(m.grave(1));
    expect(m.last()).toBe(1);
    fireEvent.pointerLeave(m.grave(1));
    expect(m.last()).toBeNull();
  });

  it("lights a grave focused by a key, not one focused after a pointer press", () => {
    const m = mount();
    fireEvent.keyDown(document.body, { key: "Tab" });
    fireEvent.focus(m.grave(2));
    expect(m.last()).toBe(2);
    fireEvent.blur(m.grave(2));
    expect(m.last()).toBeNull();
    fireEvent.pointerDown(document.body);
    fireEvent.focus(m.grave(0));
    expect(m.last()).toBeNull();
  });

  it("prefers the pointer's grave to the focused one", () => {
    const m = mount();
    fireEvent.keyDown(document.body, { key: "Tab" });
    fireEvent.focus(m.grave(2));
    fireEvent.pointerEnter(m.grave(1));
    expect(m.last()).toBe(1);
  });

  it("lights nothing while the drawer is open, and nothing after it closes until a new hover", () => {
    const m = mount();
    fireEvent.pointerEnter(m.grave(1));
    expect(m.last()).toBe(1);
    m.rerender(true);
    expect(m.last()).toBeNull();
    m.rerender(false);
    expect(m.last()).toBeNull();
    fireEvent.pointerEnter(m.grave(0));
    expect(m.last()).toBe(0);
  });
});
