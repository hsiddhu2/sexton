// Spec cemetery-undead, task 4.4: Forms, Characters and Costumes (requirement 3). Property 2.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHARACTER_BY_STATE, COSTUME_BY_STATE, STATE_BY_SHAPE } from "../src/scene/characters/vector.js";
import { hasGhost, planScene } from "../src/scene/layout.js";
import { SHAPE_BY_STATE } from "../src/scene/shapes.js";
import { STATES } from "../src/load/lists.js";
import { arbAdvisoryMode, arbState, arbTheme, scenePackage } from "./arbitraries.js";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

describe("Feature: cemetery-undead, Property 2: Form, Character and Costume depend on the State only, and a Ghost on advisories only", () => {
  it("Feature: cemetery-undead, Property 2: Form, Character and Costume depend on the State only, and a Ghost on advisories only", () => {
    fc.assert(
      fc.property(arbState, arbAdvisoryMode, arbAdvisoryMode, fc.string({ minLength: 1, maxLength: 12 }), fc.string({ minLength: 1, maxLength: 12 }), arbTheme, (state, modeA, modeB, nameA, nameB, theme) => {
        fc.pre(nameA !== nameB);
        const a = scenePackage(nameA, state, modeA);
        const b = scenePackage(nameB, state, modeB);
        const plan = planScene({ packages: [a, b], width: 900, theme, selectedIndex: null, ghostPhase: 0 });
        const [ga, gb] = plan.graves;
        expect(ga?.shape).toBe(gb?.shape);
        expect(ga?.fill).toBe(gb?.fill);
        const shownState = STATE_BY_SHAPE[ga?.shape ?? "unmarked"];
        expect(shownState).toBe(state);
        expect(CHARACTER_BY_STATE[state]).toEqual(CHARACTER_BY_STATE[shownState ?? state]);
        expect(COSTUME_BY_STATE[state]).toBe(COSTUME_BY_STATE[shownState ?? state]);
        expect(ga?.ghost !== null).toBe(hasGhost(a));
        expect(gb?.ghost !== null).toBe(hasGhost(b));
      }),
      { numRuns: 100 },
    );
  });

  it("gives each State its Form, Character and Costume, and the mound neither", () => {
    expect(STATES.map((s) => [s, SHAPE_BY_STATE[s], CHARACTER_BY_STATE[s]?.id ?? null, COSTUME_BY_STATE[s]])).toEqual([
      ["Possessed", "open", "zombie", "devil"],
      ["Dead", "cracked", "skeleton", "onesie"],
      ["Haunted", "cross", null, null],
      ["Restless", "tilted", "hand", null],
      ["Alive", "rounded", null, "party"],
    ]);
    expect(CHARACTER_BY_STATE.Dead?.clips).toEqual(["lounge", "dance"]);
    expect(STATE_BY_SHAPE.unmarked).toBeNull();
    for (const s of STATES) expect(STATE_BY_SHAPE[SHAPE_BY_STATE[s]]).toBe(s);
  });

  it("uses the vector source: no sprite atlas and no model file is shipped (design.md, decision 4)", () => {
    const pub = resolve(process.cwd(), "public");
    const files = [...walk(pub)].map((f) => f.slice(pub.length));
    expect(files.filter((f) => f.startsWith("/sprites"))).toEqual([]);
    expect(files.filter((f) => /\.(glb|gltf|fbx|obj|blend)$/i.test(f))).toEqual([]);
  });

  it("never draws or embeds the Kiro logo: no kiro name in the scene source or the public assets", () => {
    const roots = [resolve(process.cwd(), "src/scene"), resolve(process.cwd(), "public")];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (/\.(woff2|png)$/.test(file)) continue;
        expect(readFileSync(file, "utf8").toLowerCase(), file).not.toContain("kiro");
      }
    }
  });
});
