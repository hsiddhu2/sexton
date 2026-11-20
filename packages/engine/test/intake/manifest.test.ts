import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isValidPackageName } from "../../src/intake/names.js";
import {
  INVALID_LOCKFILE_MESSAGE,
  INVALID_PACKAGE_JSON_MESSAGE,
  applyLockfile,
  parseManifests,
  parsePackageJson,
} from "../../src/intake/manifest.js";
import type { ManifestsParse } from "../../src/types.js";
import {
  arbInvalidName,
  arbLockfile,
  arbPackageJson,
  arbValidName,
  arbVersion,
  renderLockfile,
  renderMap,
  renderPackageJson,
  type LockfileFormat,
  type MapEntries,
  type PackageJsonModel,
} from "../arbitraries.js";

const arbFormat: fc.Arbitrary<LockfileFormat> = fc.constantFrom<LockfileFormat>(1, 2, 3);

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The expected direct list, computed from the model by an independent sort and merge. */
function expectedDirect(model: PackageJsonModel): Array<{ name: string; range: string; origin: string }> {
  const deps = new Map(model.dependencies);
  const dev = new Map(model.devDependencies);
  const first = [...deps.keys()].filter(isValidPackageName).sort(cmp);
  const second = [...dev.keys()].filter((n) => isValidPackageName(n) && !deps.has(n)).sort(cmp);
  return [
    ...first.map((name) => ({ name, range: deps.get(name) ?? "", origin: "dependencies" })),
    ...second.map((name) => ({ name, range: dev.get(name) ?? "", origin: "devDependencies" })),
  ];
}

function ok(result: ManifestsParse): Extract<ManifestsParse, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`);
  return result;
}

const textArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary", maxLength: 200 }),
  fc.jsonValue().map((v) => JSON.stringify(v)),
  fc.nat({ max: 50000 }).map((n) => "[".repeat(n)),
  fc.nat({ max: 20000 }).map((n) => "[".repeat(n) + "]".repeat(n)),
  arbPackageJson(true).map((m) => renderPackageJson(m)),
  arbPackageJson(false).chain((m) => arbLockfile(m, 3, false).map((l) => l.text)),
);

describe("Feature: repo-intake, Property 3: parseManifests never throws", () => {
  it("returns equal results, only the two codes, and the package.json error wins", () => {
    fc.assert(
      fc.property(textArb, fc.option(textArb, { nil: null }), (pkg, lock) => {
        const a = parseManifests(pkg, lock);
        const b = parseManifests(pkg, lock);
        expect(a).toStrictEqual(b);
        if (!a.ok) {
          expect(["invalid-package-json", "invalid-lockfile"]).toContain(a.code);
          expect(a.file).toBe(a.code === "invalid-package-json" ? "package.json" : "package-lock.json");
        }
        if (!parsePackageJson(pkg).ok) {
          expect(a).toMatchObject({ ok: false, code: "invalid-package-json", file: "package.json" });
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: repo-intake, Property 4: Direct list ordering and distinctness", () => {
  it("matches an independent model", () => {
    fc.assert(
      fc.property(arbPackageJson(false), (model) => {
        const result = ok(parseManifests(renderPackageJson(model), null));
        const names = result.dependencies.map((d) => d.name);
        expect(new Set(names).size).toBe(names.length);
        expect(result.dependencies.map((d) => ({ name: d.name, range: d.declaredRange, origin: d.origin }))).toStrictEqual(
          expectedDirect(model),
        );
        const originIndex = result.dependencies.map((d) => (d.origin === "dependencies" ? 0 : 1));
        expect([...originIndex].sort()).toStrictEqual(originIndex);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: repo-intake, Property 5: totalDirect accounting", () => {
  it("counts every key once and skipped names exactly", () => {
    fc.assert(
      fc.property(arbPackageJson(true), (model) => {
        const result = ok(parseManifests(renderPackageJson(model), null));
        const keys = new Set([...model.dependencies, ...model.devDependencies].map(([n]) => n));
        expect(result.totalDirect + result.skipped.invalidName).toBe(keys.size);
        const direct = new Set(result.dependencies.map((d) => d.name));
        const skippedCount = (entries: MapEntries): number =>
          new Set(entries.map(([n]) => n).filter((n) => isValidPackageName(n) && !direct.has(n))).size;
        expect(result.skipped.peer).toBe(model.peerShape === "array" ? 0 : skippedCount(model.peerDependencies));
        expect(result.skipped.optional).toBe(skippedCount(model.optionalDependencies));
        for (const count of Object.values(result.skipped)) {
          expect(Number.isInteger(count) && count >= 0).toBe(true);
        }
        for (const name of keys) {
          if (!isValidPackageName(name)) expect(direct.has(name)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

const EXTRA_KEYS = ["scripts", "repository", "bin", "name", "version", "__proto__", "x-custom"] as const;

describe("Feature: repo-intake, Property 6: Key order and extra keys do not change the result", () => {
  it("is invariant under map reordering and extra top-level keys", () => {
    const shuffled = (entries: MapEntries): fc.Arbitrary<MapEntries> =>
      fc.shuffledSubarray([...entries], { minLength: entries.length, maxLength: entries.length });
    fc.assert(
      fc.property(
        arbPackageJson(true).chain((model) =>
          fc.tuple(
            fc.constant(model),
            shuffled(model.dependencies),
            shuffled(model.devDependencies),
            shuffled(model.peerDependencies),
            shuffled(model.optionalDependencies),
            fc.dictionary(fc.constantFrom(...EXTRA_KEYS), fc.jsonValue()),
          ),
        ),
        fc.option(arbVersion, { nil: null }),
        ([model, dependencies, devDependencies, peerDependencies, optionalDependencies, extras], lockVersion) => {
          const reordered: PackageJsonModel = { ...model, dependencies, devDependencies, peerDependencies, optionalDependencies };
          const extraTop = Object.keys(extras)
            .map((k) => `${JSON.stringify(k)}:${JSON.stringify(extras[k])}`)
            .join(",");
          const lock = lockVersion === null ? null : renderLockfile(3, [["left-pad", lockVersion]]);
          const base = parseManifests(renderPackageJson(model), lock);
          expect(parseManifests(renderPackageJson(reordered), lock)).toStrictEqual(base);
          expect(parseManifests(renderPackageJson(model, extraTop), lock)).toStrictEqual(base);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("parseManifests examples", () => {
  it("returns an empty list when there are no dependency maps", () => {
    expect(parseManifests("{}", null)).toMatchObject({ ok: true, dependencies: [], totalDirect: 0 });
  });

  it.each([
    ["dependencies is an array", '{"dependencies":[]}'],
    ["a range is a number", '{"dependencies":{"a":1}}'],
    ["devDependencies is a string", '{"devDependencies":"x"}'],
    ["top-level array", "[]"],
    ["null", "null"],
    ["empty text", ""],
    ["invalid JSON", "{"],
  ])("rejects %s", (_label, text) => {
    expect(parseManifests(text, null)).toStrictEqual({
      ok: false,
      code: "invalid-package-json",
      message: INVALID_PACKAGE_JSON_MESSAGE,
      file: "package.json",
    });
  });

  it("never reads scripts, repository or bin into the result", () => {
    const text =
      '{"scripts":{"postinstall":"CANARY_SCRIPT"},"repository":"CANARY_REPO","bin":{"x":"CANARY_BIN"},"dependencies":{"a":"^1.0.0"}}';
    const serialised = JSON.stringify(parseManifests(text, null));
    for (const canary of ["CANARY_SCRIPT", "CANARY_REPO", "CANARY_BIN", "postinstall"]) {
      expect(serialised).not.toContain(canary);
    }
  });

  it("parses a text whose byte-order mark was already stripped", () => {
    expect(parseManifests('{"dependencies":{"a":"1"}}', null)).toMatchObject({ ok: true, totalDirect: 1 });
  });

  it("lists a name in both maps once with the dependencies range", () => {
    const result = ok(parseManifests('{"dependencies":{"a":"1"},"devDependencies":{"a":"2","b":"3"}}', null));
    expect(result.dependencies.map((d) => [d.name, d.declaredRange, d.origin])).toStrictEqual([
      ["a", "1", "dependencies"],
      ["b", "3", "devDependencies"],
    ]);
  });

  it("does not count a peer name that is also direct, and counts non-object peers as zero", () => {
    const result = ok(
      parseManifests('{"dependencies":{"a":"1"},"peerDependencies":{"a":"1","p":"1"},"optionalDependencies":"x"}', null),
    );
    expect(result.skipped).toStrictEqual({ peer: 1, optional: 0, invalidName: 0 });
  });
});

describe("applyLockfile examples", () => {
  const PKG = '{"dependencies":{"a":"^1.0.0","b":"^2.0.0"}}';
  const lockedOf = (result: ManifestsParse): Array<string | null> => ok(result).dependencies.map((d) => d.lockedVersion);

  it("reads the same versions from lockfile v1, v2 and v3", () => {
    const entries: MapEntries = [
      ["a", "1.2.3"],
      ["b", "2.0.1"],
    ];
    for (const format of [1, 2, 3] as const) {
      const result = parseManifests(PKG, renderLockfile(format, entries));
      expect(lockedOf(result)).toStrictEqual(["1.2.3", "2.0.1"]);
      expect(ok(result).lockfileVersion).toBe(format);
    }
  });

  it("version 2 reads packages and not dependencies", () => {
    const text =
      '{"lockfileVersion":2,"packages":{"node_modules/a":{"version":"1.0.0"}},"dependencies":{"a":{"version":"9.9.9"},"b":{"version":"9.9.9"}}}';
    expect(lockedOf(parseManifests(PKG, text))).toStrictEqual(["1.0.0", null]);
  });

  it("version 1 reads dependencies and not packages", () => {
    const text =
      '{"lockfileVersion":1,"packages":{"node_modules/a":{"version":"9.9.9"}},"dependencies":{"a":{"version":"1.0.0"}}}';
    expect(lockedOf(parseManifests(PKG, text))).toStrictEqual(["1.0.0", null]);
  });

  it.each([
    ["absent", '{"packages":{}}'],
    ["0", '{"lockfileVersion":0}'],
    ["4", '{"lockfileVersion":4}'],
    ['"2"', '{"lockfileVersion":"2"}'],
    ["2.5", '{"lockfileVersion":2.5}'],
    ["null", '{"lockfileVersion":null}'],
    ["a JSON array", "[]"],
    ["invalid JSON", "{"],
    ["empty", ""],
  ])("rejects a lockfile with lockfileVersion %s", (_label, text) => {
    expect(parseManifests(PKG, text)).toStrictEqual({
      ok: false,
      code: "invalid-lockfile",
      message: INVALID_LOCKFILE_MESSAGE,
      file: "package-lock.json",
    });
  });

  it.each([
    ["a missing entry", '{"lockfileVersion":3,"packages":{"node_modules/b":{"version":"2.0.0"}}}'],
    ["no version", '{"lockfileVersion":3,"packages":{"node_modules/a":{},"node_modules/b":{"version":"2.0.0"}}}'],
    ["a numeric version", '{"lockfileVersion":3,"packages":{"node_modules/a":{"version":1},"node_modules/b":{"version":"2.0.0"}}}'],
    ["v1.0.0", '{"lockfileVersion":3,"packages":{"node_modules/a":{"version":"v1.0.0"},"node_modules/b":{"version":"2.0.0"}}}'],
    ["^1.0.0", '{"lockfileVersion":3,"packages":{"node_modules/a":{"version":"^1.0.0"},"node_modules/b":{"version":"2.0.0"}}}'],
    ["1.0.0+build", '{"lockfileVersion":3,"packages":{"node_modules/a":{"version":"1.0.0+build"},"node_modules/b":{"version":"2.0.0"}}}'],
  ])("makes only that dependency unlocked for %s", (_label, text) => {
    const result = ok(parseManifests(PKG, text));
    expect(result.dependencies.map((d) => d.lockedVersion)).toStrictEqual([null, "2.0.0"]);
    expect(result.unlocked).toBe(false);
    expect(result.unlockedPackages).toStrictEqual(["a"]);
  });

  it("treats a null lockfile as unlocked with every name listed", () => {
    const result = ok(parseManifests(PKG, null));
    expect(result).toMatchObject({ unlocked: true, lockfileVersion: null, unlockedPackages: ["a", "b"] });
    expect(lockedOf(result)).toStrictEqual([null, null]);
  });

  it("reports unlocked false with a partial lockfile", () => {
    const result = ok(parseManifests(PKG, renderLockfile(3, [["a", "1.0.0"]])));
    expect(result.unlocked).toBe(false);
    expect(result.unlockedPackages).toStrictEqual(["b"]);
  });

  it("keeps a locked version outside the declared range", () => {
    expect(lockedOf(parseManifests(PKG, renderLockfile(3, [["a", "7.0.0"], ["b", "0.1.0"]])))).toStrictEqual(["7.0.0", "0.1.0"]);
  });

  it("reports the package.json error when both texts are invalid", () => {
    expect(parseManifests("{", "{")).toMatchObject({ code: "invalid-package-json" });
  });

  it("applyLockfile is the second phase of parseManifests", () => {
    const parsed = parsePackageJson(PKG);
    if (!parsed.ok) throw new Error("expected ok");
    expect(applyLockfile(parsed, null)).toStrictEqual(parseManifests(PKG, null));
  });
});


const arbModelWithLock = (all: boolean): fc.Arbitrary<{
  readonly model: PackageJsonModel;
  readonly format: LockfileFormat;
  readonly lock: { readonly text: string; readonly entries: MapEntries };
}> =>
  fc
    .tuple(arbPackageJson(true), arbFormat)
    .chain(([model, format]) => arbLockfile(model, format, all).map((lock) => ({ model, format, lock })));

describe("Feature: repo-intake, Property 7: The lockfile ignores non-direct entries", () => {
  it("is unchanged when an entry for a non-direct name is added", () => {
    fc.assert(
      fc.property(arbModelWithLock(false), arbValidName, arbVersion, fc.boolean(), ({ model, format, lock }, extra, version, nested) => {
        const direct = new Set([...model.dependencies, ...model.devDependencies].map(([n]) => n));
        const present = new Set(lock.entries.map(([n]) => n));
        const name = nested ? `host/node_modules/${extra}` : extra;
        fc.pre(!direct.has(name) && !present.has(name));
        const pkg = renderPackageJson(model);
        const base = parseManifests(pkg, lock.text);
        const widened = parseManifests(pkg, renderLockfile(format, [...lock.entries, [name, version]]));
        expect(widened).toStrictEqual(base);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: repo-intake, Property 8: A fully locked lockfile gives no unlocked packages", () => {
  it("returns the recorded version for every direct dependency", () => {
    fc.assert(
      fc.property(arbModelWithLock(true), ({ model, format, lock }) => {
        const result = ok(parseManifests(renderPackageJson(model), lock.text));
        const recorded = new Map(lock.entries);
        expect(result.unlocked).toBe(false);
        expect(result.unlockedPackages).toStrictEqual([]);
        expect(result.lockfileVersion).toBe(format);
        for (const dep of result.dependencies) {
          expect(dep.lockedVersion).toBe(recorded.get(dep.name));
        }
      }),
      { numRuns: 100 },
    );
  });
});

const PROTOTYPE_NAMES = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf", "left-pad"] as const;

describe("Feature: repo-intake, Property 17: Prototype keys are inert", () => {
  const arbNames = fc.subarray([...PROTOTYPE_NAMES]);
  const withRange = (names: string[]): MapEntries => names.map((n) => [n, "^1.0.0"] as const);

  it("leaves Object.prototype unchanged and reads only own entries", () => {
    fc.assert(
      fc.property(arbNames, arbNames, arbNames, arbNames, arbNames, arbFormat, fc.boolean(), (deps, dev, peer, optional, locked, format, withLock) => {
        const before = Object.getOwnPropertyNames(Object.prototype);
        const model: PackageJsonModel = {
          dependencies: withRange(deps),
          devDependencies: withRange(dev),
          peerDependencies: withRange(peer),
          optionalDependencies: withRange(optional),
          peerShape: "object",
        };
        const pkgText = renderPackageJson(model, '"__proto__":{"polluted":"yes"}');
        const lockText = withLock
          ? renderLockfile(format, locked.map((n) => [n, "1.0.0"] as const)).replace(/^\{/, '{"__proto__":{"polluted":"yes"},')
          : null;
        const result = ok(parseManifests(pkgText, lockText));

        expect(Object.getOwnPropertyNames(Object.prototype)).toStrictEqual(before);
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
        const hasProto = deps.includes("__proto__") || dev.includes("__proto__");
        expect(result.skipped.invalidName).toBe(hasProto ? 1 : 0);
        for (const dep of result.dependencies) {
          expect(typeof dep.declaredRange).toBe("string");
          expect(dep.declaredRange).toBe("^1.0.0");
          const hasOwnEntry = withLock && locked.includes(dep.name);
          expect(dep.lockedVersion).toBe(hasOwnEntry ? "1.0.0" : null);
        }
        expect(result.dependencies.map((d) => d.name)).not.toContain("__proto__");
      }),
      { numRuns: 1000 },
    );
  });

  it("gives constructor and prototype their own declared ranges", () => {
    const result = ok(parseManifests('{"dependencies":{"constructor":"^1.0.0","prototype":"~2.0.0"}}', null));
    expect(result.dependencies.map((d) => [d.name, d.declaredRange])).toStrictEqual([
      ["constructor", "^1.0.0"],
      ["prototype", "~2.0.0"],
    ]);
  });

  it("never takes a version from an inherited property", () => {
    const pkg = '{"dependencies":{"constructor":"1","toString":"1"}}';
    for (const lock of ['{"lockfileVersion":1}', '{"lockfileVersion":3}', '{"lockfileVersion":2,"packages":{},"dependencies":{}}']) {
      expect(ok(parseManifests(pkg, lock)).unlockedPackages).toStrictEqual(["constructor", "toString"]);
    }
  });

  it("counts __proto__ as an invalid name and keeps it out of the list", () => {
    const result = ok(parseManifests('{"dependencies":{"__proto__":"1","a":"1"}}', null));
    expect(result.skipped.invalidName).toBe(1);
    expect(result.dependencies.map((d) => d.name)).toStrictEqual(["a"]);
  });

  it("is deterministic for invalid names drawn from the generator", () => {
    fc.assert(
      fc.property(arbInvalidName, (name) => {
        const text = `{"dependencies":${renderMap([[name, "1"]])}}`;
        expect(parseManifests(text, null)).toStrictEqual(parseManifests(text, null));
      }),
      { numRuns: 100 },
    );
  });
});
