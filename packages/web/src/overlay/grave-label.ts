import type { PackageHealth } from "@sexton/api";

export function graveLabel(pkg: PackageHealth): string {
  const base = `${pkg.name} ${pkg.installedVersion}, ${pkg.state}`;
  const signal = pkg.signals.advisories;
  if (!signal.available || signal.value.length === 0) return base;
  const n = signal.value.length;
  return n === 1 ? `${base}, 1 advisory` : `${base}, ${String(n)} advisories`;
}
