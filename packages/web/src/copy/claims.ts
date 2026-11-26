// The Claim registry (spec clean-site, design C7, requirements 9.4 and 17.5): every sentence the Site shows that says
// what Sexton does or can do, each tied to the README.md text it rests on. Components take Claims by id. A test checks
// that README.md holds every `readme` text, and that no rendered sentence naming a capability is missing from here.
// Pure data.

export interface Claim {
  readonly id: ClaimId;
  /** The text the Site shows: one sentence, or a few that belong together. */
  readonly text: string;
  /** The README.md texts the Claim rests on, each found in README.md as written. */
  readonly readme: readonly [string, ...string[]];
}

const README_DEMO_ONLY =
  "Opening the pull request is on `main` and on the hosted site, for the demo repository `hsiddhu2/sexton-demo` only. Every other repository shows the plan and the pull request body, with no button.";
const README_NO_SIGN_IN = "The hosted site needs no sign-in and never asks for a GitHub password.";
const README_FILES = "Sexton reads a repository's package.json and package-lock.json at its root.";
const README_PUBLIC = "It reads a GitHub repository only when it is public.";
const README_SAFE_BUMP = "Sexton proposes a bump only to a version that passes its checks; otherwise it proposes no change.";
const README_SOURCES = "Sexton sees what the npm registry, OSV, deps.dev and GitHub publish.";
const README_GRAVE = "Each grave is one dependency. Its shape and colour show its state.";
const README_FIX = "For each dangerous package it proposes one fix";
const README_EVIDENCE = "The pull request carries its evidence.";

const DEFS = {
  // The Guide page (9.2).
  "guide.lead": {
    text: "A sexton is the person who looks after a churchyard and its graves. This one looks after your dependencies.",
    readme: ["Sexton finds the dependencies that will hurt you, proves it, and opens the pull request that fixes it."],
  },
  "guide.problem.1": {
    text: "Almost every app is built from small pieces of code written by strangers. These pieces are called dependencies. A normal app uses hundreds of them.",
    readme: ["It scores up to 300 direct dependencies per scan"],
  },
  "guide.problem.2": {
    text: "Some pieces get old and nobody looks after them. Some have known holes. And sometimes a bad person takes one over and hides harmful code inside. Your app pulls it in without anyone noticing.",
    readme: ["Supply-chain attacks arrive through packages that looked fine in the lockfile."],
  },
  "guide.step.1.title": { text: "It reads your list", readme: [README_FILES] },
  "guide.step.1.text": {
    text: "Give it a GitHub repo. It reads the list of pieces your app uses and looks each one up.",
    readme: [README_FILES, "Sexton reads those signals for every direct dependency of a repository"],
  },
  "guide.step.2.title": { text: "It shows you a graveyard", readme: [README_GRAVE] },
  "guide.step.2.text": {
    text: "Every piece becomes a grave. The shape tells you how healthy it is.",
    readme: [README_GRAVE],
  },
  "guide.step.3.title": { text: "It writes the fix", readme: [README_FIX] },
  "guide.step.3.text": {
    text: "For a dangerous piece it prepares the exact change, with proof, as a pull request.",
    readme: [README_FIX, README_EVIDENCE],
  },
  "guide.answer.pull-request": {
    text: "A suggested change to your code. Someone on your team reads it and decides whether to accept it. Sexton's suggestion says which piece to change, what to change it to, and shows the proof.",
    readme: [README_FIX, README_EVIDENCE],
  },
  "guide.answer.sign-in": {
    text: "No. Sexton reads public repos and never asks for your GitHub password.",
    readme: [README_NO_SIGN_IN, README_PUBLIC],
  },
  "guide.answer.how-opened": {
    text: 'On this site the "Open pull request" button works only on a live scan of the demo repo, hsiddhu2/sexton-demo, so you can watch a real one being made. For your own repo, Sexton shows the plan and the full pull request text.',
    readme: [README_DEMO_ONLY],
  },
  "guide.answer.automatic": {
    text: "Yes. Add the Sexton GitHub Action to your repo. It runs in your own GitHub workflow, checks every pull request against your rules, and leaves one summary comment. You can also run sexton check on your own computer, from a clone of Sexton.",
    readme: [
      "runs `sexton check` on your checkout, writes the job summary and posts one summary comment on the pull request.",
      "Sexton evaluates it and fails CI when a rule breaks.",
      "Not published to npm yet, run it from a clone with Node.js 22:",
    ],
  },
  "guide.answer.proof": {
    text: "Every signal shows where it came from and when it was read: the npm registry, OSV, deps.dev or GitHub.",
    readme: ["Every signal carries its source URL and fetch time.", README_SOURCES],
  },
  // What each State means, on the Guide page and in the Legend (9.2, 13.1).
  "state.Possessed": {
    text: "Something changed that should not have. Act now.",
    readme: ["A maintainer changed in the last 90 days, provenance regressed, a new install script appeared"],
  },
  "state.Dead": {
    text: "Deprecated, or abandoned with an open advisory.",
    readme: ["The installed version is deprecated, or the last publish was more than 24 months ago and it has an advisory"],
  },
  "state.Haunted": { text: "A High or Critical advisory is open.", readme: ["It has a High or Critical advisory"] },
  "state.Restless": {
    text: "A lower advisory, or no release in two years.",
    readme: ["The last publish was more than 24 months ago, or it has a Low or Moderate advisory"],
  },
  "state.Alive": { text: "No rule matched. Healthy.", readme: ["| Alive | None of the above |"] },
  // The Tour (13.3, 13.4).
  "tour.1.title": { text: "Every grave is one dependency", readme: [README_GRAVE] },
  "tour.1.text": { text: "Its shape tells you its health. The worst ones stand in the front row.", readme: [README_GRAVE] },
  "tour.2.title": { text: "One panel, always in the same place", readme: ["Every signal carries its source URL and fetch time."] },
  "tour.2.text": {
    text: "Hover a grave and its details show here. Nothing floats over the graves.",
    readme: ["Every signal carries its source URL and fetch time."],
  },
  "tour.3.title": { text: "Scan your own repo", readme: [README_PUBLIC] },
  "tour.3.text": {
    text: "Paste a public GitHub repo with a package.json at the top. Sexton reads it and builds its cemetery. No sign-in needed.",
    readme: [README_PUBLIC, README_FILES, README_NO_SIGN_IN],
  },
  "tour.3.off": {
    text: "Scanning is off in this build. The hosted site scans public GitHub repos with a package.json at the top.",
    readme: [README_PUBLIC, README_FILES],
  },
  // The fix tab's notes (7.7, 7.8, 7.13 to 7.15).
  "fix.note.sample": {
    text: "No sign-in needed. Open pull request works on a live scan of hsiddhu2/sexton-demo. For your own repo, Sexton shows this plan and the full pull request text.",
    readme: [README_NO_SIGN_IN, README_DEMO_ONLY],
  },
  "fix.note.live-remediate": {
    text: "No sign-in needed. This button opens a real pull request on hsiddhu2/sexton-demo.",
    readme: [README_NO_SIGN_IN, README_DEMO_ONLY],
  },
  "fix.note.live": {
    text: "No sign-in needed. For this repo Sexton shows the plan and the full pull request text.",
    readme: [README_NO_SIGN_IN, README_DEMO_ONLY],
  },
  "fix.note.safe-only": { text: "Sexton only proposes a version it can show is safe.", readme: [README_SAFE_BUMP] },
  "fix.note.maintainer": {
    text: "Check who the new maintainer is before the next install.",
    readme: ["A maintainer changed in the last 90 days"],
  },
  "fix.note.provenance": {
    text: "Check why this version has no provenance before the next install.",
    readme: ["provenance regressed"],
  },
  "fix.note.install-script": {
    text: "Check what the new install script runs before the next install.",
    readme: ["a new install script appeared"],
  },
  "fix.note.new-dependency": {
    text: "Check the new dependency before the next install.",
    readme: ["a new dependency has an install script or was published within 7 days"],
  },
  "fix.note.publisher": {
    text: "Check who published this version before the next install.",
    readme: ["the publisher changed from a trusted publisher to a token"],
  },
  "fix.note.other": { text: "Check what changed before the next install.", readme: ["Each package gets exactly one state."] },
  // The Drawer's Evidence tab (7.2, 16.10).
  "drawer.evidence-note": {
    text: "Every signal carries its source and the time it was fetched.",
    readme: ["Every signal carries its source URL and fetch time."],
  },
  // The Scan field's first example (1.9), the scanning card (1.14) and a failure card's next step (12.2).
  "example.demo": { text: "pull requests work here", readme: [README_DEMO_ONLY] },
  "scanning.sources": { text: "Asking npm, OSV and deps.dev", readme: [README_SOURCES] },
  "failure.not-readable": {
    text: "Check the spelling. Sexton can only read public repos with a package.json at the top.",
    readme: [README_PUBLIC, README_FILES],
  },
} as const satisfies Readonly<Record<string, { readonly text: string; readonly readme: readonly [string, ...string[]] }>>;

export type ClaimId = keyof typeof DEFS;

/** Every Claim, in the order above. */
export const CLAIMS: readonly Claim[] = (Object.keys(DEFS) as ClaimId[]).map((id) => ({ id, ...DEFS[id] }));

/** The text of a Claim. */
export function claim(id: ClaimId): string {
  return DEFS[id].text;
}
