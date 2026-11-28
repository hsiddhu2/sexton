import { describe, expect, it } from "vitest";
import { chooseHint, HINT_SLACK_PX } from "../src/site/use-fitting-hint.js";

// Spec home-page, 3.8 and 12.12: a Scan box shows its long hint only while the whole hint fits inside its field.
describe("chooseHint", () => {
  const LONG = "owner/name, for example expressjs/express";
  const SHORT = "owner/name";

  it("keeps the long hint when it fits with room to spare", () => {
    expect(chooseHint(LONG, SHORT, 300, 300 + HINT_SLACK_PX, false)).toBe(LONG);
    expect(chooseHint(LONG, SHORT, 300, 400, true)).toBe(LONG);
  });

  it("falls back to the short hint when the long one would be cut", () => {
    expect(chooseHint(LONG, SHORT, 314, 277, false)).toBe(SHORT);
    expect(chooseHint(LONG, SHORT, 300, 300 + HINT_SLACK_PX - 1, false)).toBe(SHORT);
  });

  it("lets the Narrow layout decide when nothing can be measured", () => {
    expect(chooseHint(LONG, SHORT, null, 400, true)).toBe(SHORT);
    expect(chooseHint(LONG, SHORT, null, null, false)).toBe(LONG);
    expect(chooseHint(LONG, SHORT, 100, null, true)).toBe(SHORT);
  });
});
