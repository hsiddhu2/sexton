// The Home page's labels (spec home-page, design C7): headings, eyebrows, link and button texts, Status labels and
// Roadmap labels. Each claims nothing on its own; every sentence of the Home page is a Claim (copy/claims.ts) or one
// of these. Pure data.
import { CEMETERY_TAB, OVERVIEW_TAB } from "../header/SiteTabs.js";

export const GITHUB_URL = "https://github.com/hsiddhu2/sexton";
export const POWER_URL = "https://github.com/hsiddhu2/sexton/tree/main/powers/sexton";

export const L = {
  github: "GitHub",
  tryDemo: "Try the demo",
  heroEyebrow: "Open source · npm supply chain · Release 0.1",
  scanField: "GitHub repository",
  scanPlaceholder: "owner/name, for example expressjs/express",
  scanPlaceholderNarrow: "owner/name",
  scanButton: "Scan your repo",
  walk: "Walk the sample cemetery",
  heroAlt: "The Sexton cemetery. Each grave is one dependency, its shape and colour show its state.",
  attacksEyebrow: "The attacks are real",
  attacksHeading: "Two packages you trusted. Two signals Sexton reads.",
  axiosDate: "axios · 31 March 2026",
  axiosAlt: "The axios replay at the step where the grave turns Possessed.",
  axiosLink: "Watch the axios replay",
  keyvDate: "keyv · 4 August 2026",
  keyvAlt: "The keyv replay at the step where the grave turns Possessed.",
  keyvLink: "Watch the keyv replay",
  howEyebrow: "How it works",
  howHeading: "From a lockfile to a pull request, in four steps",
  steps: ["Read the signals", "Give each a state", "Enforce your policy", "Open the fix, with proof"],
  statesHeading: "The five states",
  whereEyebrow: "Where it runs",
  whereHeading: "One engine, five places to meet it",
  where: { cemetery: "The cemetery", cli: "The CLI", action: "GitHub Action", power: "Kiro Power", evidence: "Evidence pack" },
  live: "Live",
  onMain: "On main",
  cliStatus: "On main · npm release next",
  kiroEyebrow: "Built with Kiro",
  kiroHeading: "Every feature began as a spec",
  kiroCards: { specs: "Specs", steering: "Steering", hooks: "Hooks", agents: "Custom agents", power: "A Power" },
  videoEyebrow: "See it in three minutes",
  videoHeading: "The demo",
  videoLink: "Watch the demo video",
  roadmapEyebrow: "Roadmap",
  roadmapHeading: "The path through the graveyard",
  roadmap: [
    { version: "0.1", label: "Now" },
    { version: "0.2", label: "Next" },
    { version: "0.3", label: "Later" },
    { version: "1.0", label: "The far field" },
  ],
  openHeading: "Open source. Scans itself.",
  star: "Star on GitHub",
  installPower: "Install the Kiro Power",
} as const;

/** Pure. Every string in a label value, depth first. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** Every label of the Home page (requirement 11.1): the texts above, the two tabs, the step numbers and states. */
export const HOME_LABELS: ReadonlySet<string> = new Set([
  ...strings(L),
  OVERVIEW_TAB,
  CEMETERY_TAB,
  "1",
  "2",
  "3",
  "4",
  "Possessed",
  "Dead",
  "Haunted",
  "Restless",
  "Alive",
]);
