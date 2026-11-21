// Generators for the migration tests. Spec: .kiro/specs/migration-node-sass, Testing Strategy.

import fc from "fast-check";
import type { Advisory, BumpDataResult, FileSource, IntakePackage, MigrationData, PackageJsonView, Severity } from "../../src/types.js";
import { MARKER } from "./arbitraries.js";

const SEGMENTS = ["src", "styles", "lib", "a", "b", "node_modules", "dist", ".git", "build", "coverage", "__proto__"];
const LEAVES = ["x.scss", "y.css", "z.sass", "m.js", "n.ts", "o.tsx", "p.cjs", "q.txt", "package.json", "r.mjs"];

export const arbSafePath: fc.Arbitrary<string> = fc
  .tuple(fc.array(fc.constantFrom(...SEGMENTS), { maxLength: 3 }), fc.constantFrom(...LEAVES))
  .map(([dirs, leaf]) => [...dirs, leaf].join("/"));

export const UNSAFE_PATHS = [
  "",
  "../up.scss",
  "/abs.scss",
  "a//b.scss",
  "a/./b.scss",
  "a\\b.scss",
  "a‮b.scss",
  "a\u0085b.css",
  "a‎b.css",
  "\ud800.css",
  "line\nbreak.scss",
  `${"d/".repeat(201)}x.scss`,
];

export const arbPath: fc.Arbitrary<string> = fc.oneof({ weight: 6, arbitrary: arbSafePath }, { weight: 1, arbitrary: fc.constantFrom(...UNSAFE_PATHS) });

/** A line with a planted marker and Markdown, HTML, pipes, backticks and bidi characters. */
export const arbHostileLine: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("", "# ", "> ", "| ", "<b>", "[x](y) ", "`", "‮", "*"),
    fc.constantFrom("/deep/ ", "sass.render(", "s.renderSync(", ""),
    fc.constantFrom("`", "|", "<img src=x>", "**", ""),
  )
  .map(([a, b, c]) => `${a}${b}${MARKER}${c}`);

export const arbLine: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(".a /deep/ .b {", "x.render(opts)", "x.renderSync(opts)", 'const s = require("node-sass");', "import s from 'node-sass';", "plain", "", "  /deep/\r"),
  arbHostileLine,
);

export const arbText: fc.Arbitrary<string> = fc.array(arbLine, { maxLength: 8 }).map((lines) => lines.join("\n"));

/** 0 to 40 generated files, plus sometimes hundreds of plain style files and an oversized file. */
export const arbFileSet: fc.Arbitrary<Map<string, string>> = fc
  .record({
    files: fc.array(fc.tuple(arbPath, arbText), { maxLength: 40 }),
    bulk: fc.oneof({ weight: 4, arbitrary: fc.constant(0) }, { weight: 1, arbitrary: fc.integer({ min: 150, max: 650 }) }),
    big: fc.constantFrom("none", "ascii", "multibyte", "exact"),
  })
  .map(({ files, bulk, big }) => {
    const map = new Map<string, string>(files);
    for (let i = 0; i < bulk; i++) map.set(`bulk/f${String(i).padStart(3, "0")}.scss`, i % 7 === 0 ? ".x /deep/ .y {}" : ".x {}");
    if (big === "ascii") map.set("big/a.scss", `/deep/\n${"x".repeat(262145)}`);
    if (big === "multibyte") map.set("big/b.scss", `/deep/\n${"é".repeat(131073)}`);
    if (big === "exact") map.set("big/c.scss", `/deep/\n${"x".repeat(262144 - 7)}`);
    return map;
  });

export type Fault = "none" | "list-rejects" | "list-not-array" | "read-rejects" | "read-non-string";

/** A File source over a map that counts calls and can fail. */
export class FlakySource implements FileSource {
  listCalls = 0;
  readonly reads: string[] = [];

  constructor(
    readonly files: ReadonlyMap<string, string>,
    readonly fault: Fault = "none",
  ) {}

  listFiles(): Promise<readonly string[]> {
    this.listCalls += 1;
    if (this.fault === "list-rejects") return Promise.reject(new Error("list"));
    if (this.fault === "list-not-array") return Promise.resolve("nope" as unknown as readonly string[]);
    return Promise.resolve([...this.files.keys()]);
  }

  readFile(path: string): Promise<string | undefined> {
    this.reads.push(path);
    if (this.fault === "read-rejects" && path.length % 2 === 0) return Promise.reject(new Error("read"));
    if (this.fault === "read-non-string" && path.length % 2 === 0) return Promise.resolve(42 as unknown as string);
    return Promise.resolve(this.files.get(path));
  }
}

export const arbFault: fc.Arbitrary<Fault> = fc.oneof(
  { weight: 6, arbitrary: fc.constant<Fault>("none") },
  { weight: 1, arbitrary: fc.constantFrom<Fault>("list-rejects", "list-not-array", "read-rejects", "read-non-string") },
);

export const arbScripts: fc.Arbitrary<Map<string, string>> = fc
  .array(fc.tuple(fc.oneof(fc.constantFrom("build", "build:css", "watch"), arbHostileLine), fc.constantFrom("node-sass a -o b", "webpack", "sass a b", `node-sass ${MARKER}`)), { maxLength: 6 })
  .map((entries) => new Map(entries));

const arbSection = fc.constantFrom("dependencies" as const, "devDependencies" as const);
const arbRangeFor = (v: string): fc.Arbitrary<string> => fc.constantFrom(`^${v}`, `~${v}`, v, `>=${v}`, "latest", "");

/** Versions 0.x to 9.x so sass-loader lands on both sides of 7.2.0. */
export const arbVersion: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 3 }))
  .map(([a, b, c]) => `${String(a)}.${String(b)}.${String(c)}`);

const arbPkg = (name: string): fc.Arbitrary<IntakePackage> =>
  fc
    .record({ v: arbVersion, section: arbSection, unresolved: fc.boolean() })
    .chain(({ v, section, unresolved }) =>
      arbRangeFor(v).map(
        (range): IntakePackage => ({ name, installedVersion: unresolved ? "unresolved" : v, declaredRange: range, origin: section, resolution: unresolved ? "unresolved" : "locked" }),
      ),
    );

/** A view with node-sass, sass and sass-loader each present or absent, plus an unrelated package. */
export const arbView: fc.Arbitrary<PackageJsonView> = fc
  .record({
    nodeSass: fc.option(arbPkg("node-sass"), { nil: undefined, freq: 4 }),
    sass: fc.option(arbPkg("sass"), { nil: undefined, freq: 1 }),
    loader: fc.option(arbPkg("sass-loader"), { nil: undefined, freq: 2 }),
    other: arbPkg("webpack"),
    scripts: arbScripts,
  })
  .map(({ nodeSass, sass, loader, other, scripts }) => ({
    packages: [nodeSass, sass, loader, other].filter((p): p is IntakePackage => p !== undefined),
    scripts,
  }));

const SEVERITY_POOL: readonly Severity[] = ["Low", "Low", "Moderate", "High", "Critical", "Unknown"];

export const arbVersionData: fc.Arbitrary<BumpDataResult> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<BumpDataResult>({ ok: false, reason: "packument request failed (HTTP 500)" }) },
  {
    weight: 5,
    arbitrary: fc
      .record({
        published: fc.uniqueArray(fc.oneof({ weight: 6, arbitrary: arbVersion }, { weight: 1, arbitrary: arbVersion.map((v) => `${v}-beta.1`) }), { maxLength: 40 }),
        seed: fc.array(fc.nat(), { minLength: 40, maxLength: 40 }),
      })
      .map(({ published, seed }): BumpDataResult => {
        const deprecated = new Set<string>();
        const advisories = new Map<string, readonly Advisory[]>();
        published.forEach((v, i) => {
          const s = seed[i] ?? 0;
          if (s % 5 === 0) deprecated.add(v);
          if (s % 7 === 1) return; // no advisory entry: fails
          const count = s % 3;
          advisories.set(
            v,
            Array.from({ length: count }, (_, j) => ({ id: `GHSA-${String(j)}`, severity: SEVERITY_POOL[(s >> (j + 2)) % SEVERITY_POOL.length] as Severity, summary: "s" })),
          );
        });
        return { ok: true, published, deprecated, advisories };
      }),
  },
);

export const arbMigrationData: fc.Arbitrary<MigrationData> = fc
  .record({ sass: fc.option(arbVersionData, { nil: undefined, freq: 8 }), loader: fc.option(arbVersionData, { nil: undefined, freq: 8 }) })
  .map(({ sass, loader }) => {
    const m = new Map<string, BumpDataResult>();
    if (sass !== undefined) m.set("sass", sass);
    if (loader !== undefined) m.set("sass-loader", loader);
    return m;
  });
