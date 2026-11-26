// The three signals the Inspector shows (spec clean-site, design C3, requirements 3.11 and 3.25): chosen by State,
// each with its plain label, a short value and a tone taken from the signal value alone. Signal values arrive from
// the network and only some are shape-checked, so every read here is guarded and nothing throws. Pure.
import type { PackageHealth, SignalName } from "@sexton/api";
import { SIGNAL_LABELS } from "../drawer/signal-labels.js";
import { reasonFamily, type Family } from "./reason-family.js";

export type Tone = "bad" | "warn" | "ok";

export interface SignalPick {
  readonly key: SignalName;
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
}

export const NOT_AVAILABLE = "not available";
const MAX_LISTED = 3;

const FAMILY_SIGNAL: Partial<Record<Family, SignalName>> = {
  maintainer: "maintainerChange",
  provenance: "provenanceRegression",
  "install-script": "newInstallScript",
  "new-dependency": "newDependency",
  publisher: "publisherChange",
};

const POSSESSED_REST: readonly SignalName[] = ["maintainers", "provenance", "hasInstallScript"];
const DEAD: readonly [SignalName, SignalName, SignalName] = ["deprecated", "lastPublish", "advisories"];
const OTHER: readonly [SignalName, SignalName, SignalName] = ["advisories", "deprecated", "lastPublish"];

type Rec = Readonly<Record<string, unknown>>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function list(names: readonly string[]): string {
  if (names.length === 0) return "none";
  const shown = names.slice(0, MAX_LISTED).join(", ");
  return names.length > MAX_LISTED ? `${shown} and ${String(names.length - MAX_LISTED)} more` : shown;
}

function day(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const SEVERITY_ORDER = ["Critical", "High", "Moderate", "Low", "Unknown"] as const;

function describe(key: SignalName, value: unknown): { readonly value: string; readonly tone: Tone } {
  switch (key) {
    case "lastPublish": {
      const iso = str(value);
      return iso === null ? { value: "unknown", tone: "warn" } : { value: day(iso), tone: "ok" };
    }
    case "deprecated":
      return value === true ? { value: "yes", tone: "bad" } : { value: "no", tone: "ok" };
    case "hasInstallScript":
      return value === true ? { value: "yes", tone: "warn" } : { value: "none", tone: "ok" };
    case "advisories": {
      const items = Array.isArray(value) ? value.filter(isRec) : [];
      if (items.length === 0) return { value: "none", tone: "ok" };
      const severities = items.map((a) => str(a["severity"]));
      const worst = SEVERITY_ORDER.find((s) => severities.includes(s)) ?? "Unknown";
      const tone: Tone = worst === "Critical" || worst === "High" ? "bad" : "warn";
      return { value: `${String(items.length)} open, worst ${worst}`, tone };
    }
    case "maintainers":
      return { value: list(strings(value)), tone: "ok" };
    case "provenance":
      return isRec(value) && value["present"] === true ? { value: "present", tone: "ok" } : { value: "missing", tone: "warn" };
    case "transitiveReach": {
      const reach = isRec(value) && typeof value["reach"] === "number" ? value["reach"] : null;
      return { value: reach === null ? "unknown" : `${String(reach)} packages`, tone: "ok" };
    }
    case "maintainerChange": {
      if (!isRec(value) || value["status"] !== "history-sufficient") return { value: "not enough history", tone: "ok" };
      const events = Array.isArray(value["events"]) ? value["events"].filter(isRec) : [];
      const recent = events.filter((e) => e["recent"] === true);
      const last = recent[recent.length - 1];
      if (last === undefined) return { value: "no recent change", tone: "ok" };
      return { value: `${list(strings(last["before"]))} became ${list(strings(last["after"]))}`, tone: "bad" };
    }
    case "provenanceRegression": {
      if (!isRec(value)) return { value: "unknown", tone: "ok" };
      if (value["status"] === "regression") {
        return { value: `${str(value["installedVersion"]) ?? "?"} has none, ${str(value["earlierVersion"]) ?? "?"} had it`, tone: "bad" };
      }
      return value["status"] === "no-regression" ? { value: "none", tone: "ok" } : { value: "not enough history", tone: "ok" };
    }
    case "newInstallScript": {
      const events = Array.isArray(value) ? value.filter(isRec) : [];
      const first = events[0];
      return first === undefined ? { value: "none", tone: "ok" } : { value: `added in ${str(first["version"]) ?? "?"}`, tone: "bad" };
    }
    case "publisherChange": {
      if (!isRec(value)) return { value: "unknown", tone: "ok" };
      if (value["status"] === "changed") {
        const who = (side: unknown): string => (isRec(side) ? (str(side["publisher"]) ?? "unknown") : "unknown");
        return { value: `${who(value["earlier"])} to ${who(value["installed"])}`, tone: "bad" };
      }
      if (value["status"] === "same") return { value: "same publisher", tone: "ok" };
      return value["status"] === "no-earlier-version" ? { value: "no earlier version", tone: "ok" } : { value: "unknown", tone: "ok" };
    }
    case "newDependency": {
      if (!isRec(value) || value["status"] !== "compared") return { value: "no earlier version", tone: "ok" };
      const added = Array.isArray(value["added"]) ? value["added"].filter(isRec) : [];
      if (added.length === 0) return { value: "none", tone: "ok" };
      const risky = added.some((d) => d["installScript"] === true || d["fresh"] === true);
      return { value: list(added.map((d) => str(d["name"]) ?? "?")), tone: risky ? "bad" : "warn" };
    }
  }
}

/** Pure. One Inspector row for a signal: "not available" when the signal is unavailable (3.25). */
export function signalPick(pkg: PackageHealth, key: SignalName): SignalPick {
  const label = SIGNAL_LABELS[key];
  const envelope: unknown = pkg.signals[key];
  if (!isRec(envelope) || envelope["available"] !== true) return { key, label, value: NOT_AVAILABLE, tone: "warn" };
  return { key, label, ...describe(key, envelope["value"]) };
}

/** Pure. The signal keys of the Inspector, by State (design C3). */
export function pickKeys(pkg: PackageHealth): readonly [SignalName, SignalName, SignalName] {
  if (pkg.state === "Possessed") {
    const family = reasonFamily(pkg.stateReason);
    const lead = family === null ? undefined : FAMILY_SIGNAL[family];
    const keys = lead === undefined ? POSSESSED_REST : [lead, ...POSSESSED_REST.slice(0, 2)];
    return [keys[0] ?? "maintainers", keys[1] ?? "provenance", keys[2] ?? "hasInstallScript"];
  }
  return pkg.state === "Dead" ? DEAD : OTHER;
}

/** Pure. The three Inspector rows of a package. */
export function pickSignals(pkg: PackageHealth): readonly [SignalPick, SignalPick, SignalPick] {
  const [a, b, c] = pickKeys(pkg);
  return [signalPick(pkg, a), signalPick(pkg, b), signalPick(pkg, c)];
}
