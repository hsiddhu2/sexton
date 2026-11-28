// Spec remediate, Requirement 1: applyPackageJsonEdits. Property 66.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyPackageJsonEdits, detectIndent } from "../../src/remediation/apply-edits.js";
import type { PackageJsonEdit } from "../../src/types.js";

const PKG = `{
  "name": "app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2",
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "node-sass": "^7.0.3",
    "webpack": "^4.47.0"
  }
}
`;

const ok = (text: string, edits: PackageJsonEdit[]): string => {
  const r = applyPackageJsonEdits(text, edits);
  if (!r.ok) throw new Error(r.reason);
  return r.text;
};

describe("applyPackageJsonEdits (1.1 to 1.5)", () => {
  it("sets a range in place and keeps indentation, order and the final newline", () => {
    const out = ok(PKG, [{ path: "package.json", op: "set-range", section: "dependencies", name: "express", range: "^4.22.3" }]);
    expect(out).toBe(PKG.replace('"^4.18.2"', '"^4.22.3"'));
  });

  it("migrates node-sass to sass: remove, add sorted", () => {
    const out = ok(PKG, [
      { path: "package.json", op: "remove-dependency", section: "devDependencies", name: "node-sass" },
      { path: "package.json", op: "add-dependency", section: "devDependencies", name: "sass", range: "^1.80.0" },
    ]);
    const parsed = JSON.parse(out) as { devDependencies: Record<string, string> };
    expect(Object.keys(parsed.devDependencies)).toEqual(["sass", "webpack"]);
    expect(out.endsWith("}\n")).toBe(true);
  });

  it("appends to an unsorted section and creates a missing section after the last dependency section", () => {
    const text = '{\n\t"name": "a",\n\t"dependencies": {"z": "1", "a": "1"},\n\t"scripts": {}\n}';
    const out = ok(text, [
      { path: "package.json", op: "add-dependency", section: "dependencies", name: "m", range: "^1.0.0" },
      { path: "package.json", op: "add-dependency", section: "devDependencies", name: "sass", range: "^1.0.0" },
    ]);
    const parsed = JSON.parse(out) as Record<string, Record<string, string>>;
    expect(Object.keys(parsed["dependencies"] ?? {})).toEqual(["z", "a", "m"]);
    expect(Object.keys(parsed)).toEqual(["name", "dependencies", "devDependencies", "scripts"]);
    expect(out.split("\n")[1]?.startsWith("\t")).toBe(true);
    expect(out.endsWith("\n")).toBe(false);
  });

  it("removes a name from dependencies and devDependencies", () => {
    const text = '{"dependencies":{"x":"1"},"devDependencies":{"x":"1","y":"1"}}';
    const parsed = JSON.parse(ok(text, [{ path: "package.json", op: "remove-dependency", section: "dependencies", name: "x" }])) as Record<string, Record<string, string>>;
    expect(parsed).toEqual({ dependencies: {}, devDependencies: { y: "1" } });
  });

  it.each([
    ["not JSON", "{", "invalid-json"],
    ["an array", "[]", "not-an-object"],
    ["a section that is not an object", '{"dependencies":[]}', "section-not-object"],
    ["a set-range on an absent name", '{"dependencies":{}}', "name-absent"],
  ])("refuses %s", (_, text, reason) => {
    expect(applyPackageJsonEdits(text, [{ path: "package.json", op: "set-range", section: "dependencies", name: "x", range: "1" }])).toEqual({ ok: false, reason });
  });

  it("refuses a remove of a name in no section", () => {
    expect(applyPackageJsonEdits('{"dependencies":{}}', [{ path: "package.json", op: "remove-dependency", section: "dependencies", name: "x" }])).toEqual({ ok: false, reason: "name-absent" });
  });

  it("keeps a __proto__ key as data and pollutes nothing", () => {
    const out = ok('{"__proto__":{"polluted":"yes"},"dependencies":{"a":"1"}}', [{ path: "package.json", op: "set-range", section: "dependencies", name: "a", range: "2" }]);
    expect(out).toContain('"__proto__"');
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("detects the indentation", () => {
    expect(detectIndent('{\n    "a": 1\n}')).toBe(4);
    expect(detectIndent('{\n\t"a": 1\n}')).toBe("\t");
    expect(detectIndent('{"a":1}')).toBe(2);
  });
});

const NAME = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);
const RANGE = fc.stringMatching(/^\^[0-9]\.[0-9]\.[0-9]$/);
const SECTION = fc.constantFrom("dependencies" as const, "devDependencies" as const);
const arbPkg = fc.record({
  dependencies: fc.dictionary(NAME, RANGE, { maxKeys: 6 }),
  devDependencies: fc.dictionary(NAME, RANGE, { maxKeys: 6 }),
});

describe("Feature: remediate, Property 66: applyPackageJsonEdits", () => {
  it("parses, equals the expected object, keeps other keys in order, and is idempotent for set-range and remove", () => {
    fc.assert(
      fc.property(arbPkg, SECTION, fc.nat(), RANGE, fc.constantFrom("set-range", "remove-dependency"), fc.constantFrom(2, 4, "\t"), (pkg, section, pick, range, op, indent) => {
        const names = Object.keys(pkg[section]);
        fc.pre(names.length > 0);
        const name = names[pick % names.length] as string;
        const text = JSON.stringify({ name: "x", ...pkg }, null, indent) + "\n";
        const edit: PackageJsonEdit =
          op === "set-range" ? { path: "package.json", op, section, name, range } : { path: "package.json", op, section, name };
        const out = ok(text, [edit]);
        const parsed = JSON.parse(out) as Record<string, Record<string, string>>;
        const expected = structuredClone({ name: "x", ...pkg }) as Record<string, unknown>;
        for (const s of ["dependencies", "devDependencies"] as const) {
          const sec = { ...(expected[s] as Record<string, string>) };
          if (op === "remove-dependency") Reflect.deleteProperty(sec, name);
          else if (s === section) sec[name] = range;
          expected[s] = sec;
        }
        expect(parsed).toEqual(expected);
        for (const s of ["dependencies", "devDependencies"] as const) {
          expect(Object.keys(parsed[s] ?? {})).toEqual(Object.keys(pkg[s]).filter((k) => op === "set-range" || k !== name));
        }
        expect(detectIndent(out)).toBe(indent);
        if (op === "set-range") expect(ok(out, [edit])).toBe(out);
        else expect(applyPackageJsonEdits(out, [edit])).toEqual({ ok: false, reason: "name-absent" });
      }),
      { numRuns: 100 },
    );
  });
});

// Spec remediation-remove-scope, bugfix 2.1 to 2.3 and 3.1, Property 1.
describe("remove-dependency scope (remediation-remove-scope)", () => {
  const remove = (name: string): PackageJsonEdit => ({ path: "package.json", op: "remove-dependency", section: "dependencies", name });
  it("keeps peerDependencies and optionalDependencies", () => {
    const text = '{"dependencies":{"x":"1"},"peerDependencies":{"x":"^1"},"optionalDependencies":{"x":"1","y":"1"}}';
    expect(JSON.parse(ok(text, [remove("x")]))).toEqual({ dependencies: {}, peerDependencies: { x: "^1" }, optionalDependencies: { x: "1", y: "1" } });
  });
  it("refuses a name listed only in peerDependencies or optionalDependencies", () => {
    expect(applyPackageJsonEdits('{"dependencies":{},"peerDependencies":{"x":"1"},"optionalDependencies":{"x":"1"}}', [remove("x")])).toEqual({ ok: false, reason: "name-absent" });
  });
  it("ignores a peerDependencies or optionalDependencies member that is not an object", () => {
    expect(JSON.parse(ok('{"dependencies":{"x":"1"},"peerDependencies":[],"optionalDependencies":"x"}', [remove("x")]))).toEqual({ dependencies: {}, peerDependencies: [], optionalDependencies: "x" });
  });
  it("Property 1: touches only dependencies and devDependencies", () => {
    const names = fc.constantFrom("a", "b", "c", "x");
    const section = fc.oneof(fc.constant(undefined), fc.dictionary(names, fc.constantFrom("1", "^2", "~3"), { maxKeys: 4 }), fc.constantFrom<unknown>([], "s", 1, null));
    fc.assert(
      fc.property(section, section, section, section, names, (deps, dev, opt, peer, name) => {
        const doc: Record<string, unknown> = { name: "app" };
        const parts: [string, unknown][] = [["dependencies", deps], ["devDependencies", dev], ["optionalDependencies", opt], ["peerDependencies", peer]];
        for (const [key, value] of parts) if (value !== undefined) doc[key] = value;
        const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
        const listed = [deps, dev].some((v) => isObj(v) && Object.hasOwn(v, name));
        const badMain = [deps, dev].some((v) => v !== undefined && !isObj(v));
        const r = applyPackageJsonEdits(JSON.stringify(doc, null, 2) + "\n", [remove(name)]);
        if (badMain) {
          if (!r.ok) expect(["section-not-object", "name-absent"]).toContain(r.reason);
          return;
        }
        if (!listed) {
          expect(r).toEqual({ ok: false, reason: "name-absent" });
          return;
        }
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const out = JSON.parse(r.text) as Record<string, unknown>;
        for (const key of Object.keys(doc)) {
          if (key === "dependencies" || key === "devDependencies") {
            const before = doc[key] as Record<string, unknown>;
            const after = out[key] as Record<string, unknown>;
            expect(Object.hasOwn(after, name)).toBe(false);
            expect(Object.keys(after)).toEqual(Object.keys(before).filter((k) => k !== name));
          } else expect(out[key]).toEqual(doc[key]);
        }
        expect(Object.keys(out)).toEqual(Object.keys(doc));
      }),
      { numRuns: 100 },
    );
  });
});

