import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("web smoke", () => {
  it("renders the heading through the JSX transform and .js resolution", () => {
    render(
      <App
        fetchFn={() => new Promise<Response>(() => undefined)}
        apiBase={null}
        initialSearch=""
        pageOrigin="http://localhost"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sexton cemetery");
  });

  it("installs the setup stubs", () => {
    expect(typeof Path2D).toBe("function");
    expect(typeof window.matchMedia).toBe("function");
    expect(typeof ResizeObserver).toBe("function");
    expect(document.createElement("canvas").getContext("2d")).not.toBeNull();
  });
});
