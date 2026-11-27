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
    // Spec clean-site, task 3: the wordmark is a link home; the page's one h1 is the Home headline.
    expect(screen.getByRole("link", { name: "Sexton, back to the cemetery" }).textContent).toBe("Sexton");
  });

  it("installs the setup stubs", () => {
    expect(typeof Path2D).toBe("function");
    expect(typeof window.matchMedia).toBe("function");
    expect(typeof ResizeObserver).toBe("function");
    expect(document.createElement("canvas").getContext("2d")).not.toBeNull();
  });
});
