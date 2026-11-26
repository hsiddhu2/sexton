// The 300-package fixture of spec clean-site, task 4.2 (requirements 6.11 and 6.12). It is generated from the demo scan
// at test time, so it follows the demo's shape: every demo package is copied in turn under a new name, which keeps
// all five States, their reasons and their plans. The timelines are dropped, so every package shows its scan State.
export const SCAN_300_PATH = "/test/scan-300.json";
export const SCAN_300_COUNT = 300;

interface DemoLike {
  report: { packages: { name: string }[] };
  remediations?: { packageName: string }[];
  timelines?: unknown;
  pullRequests?: unknown;
}

/** Pure. Package i is demo package i mod n named `<demo name>-<i>`; its plan, when the demo has one, follows it. */
export function scan300<T extends DemoLike>(demo: T): T {
  const big = structuredClone(demo);
  const source = demo.report.packages;
  const plans = demo.remediations ?? [];
  const names: string[] = [];
  big.report.packages = Array.from({ length: SCAN_300_COUNT }, (_, i) => {
    const pkg = structuredClone(source[i % source.length]) as { name: string };
    const name = `${pkg.name}-${String(i)}`;
    names.push(name);
    return { ...pkg, name };
  });
  big.remediations = names.flatMap((name, i) => {
    const base = source[i % source.length]?.name;
    const plan = plans.find((p) => p.packageName === base);
    return plan === undefined ? [] : [{ ...structuredClone(plan), packageName: name }];
  });
  delete big.timelines;
  delete big.pullRequests;
  return big;
}
