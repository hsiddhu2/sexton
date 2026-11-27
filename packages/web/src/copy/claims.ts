// The Claim registry (spec clean-site, design C7, requirements 9.4 and 17.5; spec home-page, C7 and requirement 11):
// every sentence the Site shows that says what Sexton does or can do, each tied to the README.md texts it rests on, or
// to texts of a named repository file such as a spec. Components take Claims by id. A test checks that README.md and
// each named file hold every text, that no rendered sentence naming a capability is missing from here, and that every
// sentence of the Home page is a Claim or a listed label. Pure data.

export interface Claim {
  readonly id: ClaimId;
  /** The text the Site shows: one sentence, or a few that belong together. */
  readonly text: string;
  /** The README.md texts the Claim rests on, each found in README.md as written. */
  readonly readme: readonly string[];
  /** Texts of other repository files the Claim rests on, as [path from the repository root, text] pairs. */
  readonly files?: readonly (readonly [string, string])[];
}

const README_DEMO_ONLY =
  "Opening the pull request is on `main` and on the hosted site, for the demo repository `hsiddhu2/sexton-demo` only. Every other repository shows the plan and the pull request body, with no button.";
const README_NO_SIGN_IN = "The hosted site needs no sign-in and never asks for a GitHub password.";
const README_FILES = "Sexton reads a repository's package.json and package-lock.json at its root.";
const README_PUBLIC = "It reads a GitHub repository only when it is public.";
const README_SAFE_BUMP = "Sexton proposes a bump only to a version that passes its checks; otherwise it proposes no change.";
const README_SOURCES = "Sexton sees what the npm registry, OSV, deps.dev and GitHub publish.";
const README_GRAVE = "Each grave is one dependency. Its shape and colour show its state.";
const README_ORDER =
  "The cemetery puts the graves to fix first in front: Possessed, then Dead, Haunted and Restless, then by advisory severity and reach.";
const README_FIX = "For each dangerous package it proposes one fix";
const README_EVIDENCE = "The pull request carries its evidence.";
const README_LINE_1 = "Sexton finds the dependencies that will hurt you, proves it, and opens the pull request that fixes it.";
const README_SIGNALS = "Sexton reads those signals for every direct dependency of a repository";
const README_ONE_STATE = "Each package gets exactly one state.";
const README_FAILS_CI = "Sexton evaluates it and fails CI when a rule breaks.";
const README_SOURCE_TIME = "Every signal carries its source URL and fetch time.";
const SPEC_REPLAY_AXIOS = ".kiro/specs/cemetery-time/design.md";
const SPEC_REPLAY_TEXT = ".kiro/specs/clean-site/design.md";
const SPEC_SAFETY_BUG = ".kiro/specs/remediation-safety/bugfix.md";

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
  // The Legend's fix order line (13.1).
  "legend.fix-order": {
    text: "Fix order: Possessed first, then Dead, Haunted, Restless. Then by advisory severity and reach.",
    readme: [README_ORDER],
  },
  // The Tour (13.3, 13.4).
  "tour.1.title": { text: "Every grave is one dependency", readme: [README_GRAVE] },
  "tour.1.text": {
    text: "Its shape tells you its health. The worst ones stand in the front row.",
    readme: [README_GRAVE, README_ORDER],
  },
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
  // The Home page (spec home-page, requirements 3 to 10), in the order it shows them.
  "home.hero.title": { text: "Find the dependencies that will hurt you. Prove it. Open the fix.", readme: [README_LINE_1] },
  "home.hero.pitch": {
    text: "Sexton reads public registry signals for every direct dependency, gives each one a state you can see at a glance, enforces your policy in CI, and opens the pull request that fixes it, with its evidence attached.",
    readme: [README_SIGNALS, README_ONE_STATE, README_GRAVE, README_FAILS_CI, README_LINE_1, README_EVIDENCE],
  },
  "home.hero.limits": {
    text: "Public repos only. No sign-in. Apache-2.0.",
    readme: [README_PUBLIC, README_NO_SIGN_IN, "Apache-2.0. See LICENSE and NOTICE."],
  },
  "home.hero.caption": {
    text: "Each grave is one dependency. The worst stand in front. The purple one is Possessed.",
    readme: [README_GRAVE, README_ORDER],
    files: [[".kiro/specs/cemetery-undead/requirements.md", "Possessed #cc79a7"]],
  },
  "home.attacks.lead": {
    text: "Both replays are reconstructed from public reports, step by step. Watch each grave turn.",
    readme: ["A replay is reconstructed from public reports.", "Two replays tell real incidents step by step."],
  },
  "home.attacks.axios.title": {
    text: "A release published by hand, with no provenance",
    readme: [],
    files: [[SPEC_REPLAY_AXIOS, "by hand, with no OIDC binding and no gitHead"], [SPEC_REPLAY_AXIOS, "So `provenance: false` for 1.14.1"]],
  },
  "home.attacks.axios.text": {
    text: "Version 1.14.1 arrived without the trusted publishing its earlier release had, and pulled in a new dependency with an install script. Sexton calls that Possessed.",
    readme: [],
    files: [
      [".kiro/specs/cemetery-time-fixes/requirements.md", "Possessed \"provenance regression: 1.14.1 has no provenance, 1.14.0 had it\""],
      [SPEC_REPLAY_TEXT, "It adds a new dependency, plain-crypto-js 4.2.1, whose postinstall script installs a remote access trojan."],
      [SPEC_REPLAY_AXIOS, "1.14.0 was published by GitHub Actions as a trusted publisher."],
    ],
  },
  "home.attacks.keyv.title": {
    text: "A valid signature, and a new install script",
    readme: [],
    files: [[SPEC_REPLAY_TEXT, "keyv 6.0.0 is published with a new preinstall script, node setup.mjs. It still carries valid provenance from GitHub Actions."]],
  },
  "home.attacks.keyv.text": {
    text: "Version 6.0.0 kept its attestation, so a provenance check alone stayed quiet. It added a preinstall script. Sexton calls that Possessed too.",
    readme: [],
    files: [
      [".kiro/specs/cemetery-time/requirements.md", "the keyv compromise of 4 August 2026"],
      [SPEC_REPLAY_TEXT, "keyv 6.0.0 is published with a new preinstall script, node setup.mjs. It still carries valid provenance from GitHub Actions."],
      [".kiro/specs/cemetery-time-fixes/requirements.md", "Possessed \"install script added in 6.0.0\""],
    ],
  },
  "home.how.1": {
    text: "Twelve signals per package measure the seven product signals in the roadmap, from last publish and advisories to maintainer change, provenance and publisher. Each carries its source and the time it was read.",
    readme: ["on twelve signals", "These twelve measure the seven product signals in the roadmap", "from last publish date and known advisories to maintainer change, provenance", README_SOURCE_TIME],
  },
  "home.how.2": {
    text: "One of five states, with the reason that decided it. Dated snapshots catch changes a single read would miss.",
    readme: [README_ONE_STATE, "Sexton tells you which packages are likely to go bad, and why.", "A maintainer change or lost provenance is computed from the history, not from one read."],
  },
  "home.how.3": {
    text: "Commit a sexton.policy.yml. sexton check and the GitHub Action fail CI when a rule breaks.",
    readme: ["You commit a `sexton.policy.yml`", README_FAILS_CI, "The policy engine, `sexton check` and the GitHub Action are on `main`."],
  },
  "home.how.4": {
    text: "A bump, a removal or a migration, one pull request each, carrying its evidence. An evidence pack with an SBOM and a digest for a reviewer to check.",
    readme: [README_FIX, "a version bump, a removal, or a migration such as node-sass to sass", README_EVIDENCE, "lets a reviewer check it"],
  },
  "home.state.Possessed": {
    text: "A maintainer changed, provenance regressed, an install script or a risky new dependency appeared, or the publisher changed. Fix first.",
    readme: [
      "A maintainer changed in the last 90 days, provenance regressed, a new install script appeared, a new dependency has an install script or was published within 7 days, or the publisher changed from a trusted publisher to a token",
      README_ORDER,
    ],
  },
  "home.state.Dead": { text: "Deprecated, or more than two years quiet with an advisory open.", readme: ["The installed version is deprecated, or the last publish was more than 24 months ago and it has an advisory"] },
  "home.state.Restless": { text: "More than two years quiet, or a Low or Moderate advisory.", readme: ["The last publish was more than 24 months ago, or it has a Low or Moderate advisory"] },
  "home.state.Alive": { text: "None of the rules above matched.", readme: ["| Alive | None of the above |"] },
  "home.where.cemetery": {
    text: "Scan a public repo in the browser. History slider, replays, evidence.",
    readme: [README_PUBLIC, "The cemetery has a history scrubber under it.", "Two replays tell real incidents step by step.", "the demo download links in the site footer"],
  },
  "home.where.cli": {
    text: "sexton scan, check and evidence, on your repo or a local folder.",
    readme: ["CLI with scan, check and evidence.", "A target that is a GitHub repository URL is read from GitHub. Any other target is a local directory"],
  },
  "home.where.action": {
    text: "Checks every pull request against your policy and comments once.",
    readme: ["runs `sexton check` on your checkout, writes the job summary and posts one summary comment on the pull request."],
  },
  "home.where.power": {
    text: "Ask Kiro which dependencies to fix first. Four read-only tools.",
    readme: ["It gives Kiro four read-only tools", "Which of my npm dependencies should I fix first, and why?"],
  },
  "home.where.evidence": {
    text: "CycloneDX SBOM, every signal with its source, a SHA-256 digest.",
    readme: ["It writes a CycloneDX 1.5 SBOM, every signal with its source", "A SHA-256 digest over the canonical JSON body"],
  },
  "home.kiro.specs": {
    text: "Requirements in EARS, a design with correctness properties, tasks traced to requirement IDs. Property tests check the rules on 100 to 1,000 random cases each.",
    readme: ["Specs, each with its requirements (or bugfix), design and tasks, in `.kiro/specs/`:"],
    files: [
      [".kiro/steering/ears-authoring.md", "Use the five EARS shapes and nothing else"],
      [".kiro/specs/clean-site/design.md", "## Correctness Properties"],
      [".kiro/specs/clean-site/tasks.md", "_Requirements:"],
      [".kiro/steering/tech.md", "numRuns 100 default, 1000 for security invariants"],
    ],
  },
  "home.kiro.gravedigger": {
    text: "A read-only reviewer agent, the gravedigger, found four real defects in the remediation engine. A bugfix spec fixed them, with tests that failed first.",
    readme: ["`gravedigger.md`: read-only reviewer that checks a remediation plan can never make a repository worse."],
    files: [
      [SPEC_SAFETY_BUG, 'ended "unsafe" with three defects'],
      [SPEC_SAFETY_BUG, "D4 (added 25 Nov 2026, found by the gravedigger review of task 1)"],
      [".kiro/specs/remediation-safety/tasks.md", "18 tests, 0 passed, 18 failed"],
    ],
  },
  "home.kiro.card.specs": { text: "Feature and bugfix specs, in .kiro/specs.", readme: ["Specs, each with its requirements (or bugfix), design and tasks, in `.kiro/specs/`:"] },
  "home.kiro.card.steering": {
    text: "Product, engine, security and pull request rules Kiro follows.",
    readme: ["what Sexton is, how it is built, where things go.", "engine, cemetery, upstream, pull request and security rules."],
  },
  "home.kiro.card.hooks": {
    text: "An install gate that blocks npm install when the policy fails.",
    readme: ["before an npm install, runs `sexton check` on the repository and blocks the install when the policy fails"],
  },
  "home.kiro.card.agents": {
    text: "An implementer, a security reviewer and the gravedigger.",
    readme: ["`impl.md`: the implementer for spec tasks", "`security-reviewer.md`: read-only reviewer", "`gravedigger.md`: read-only reviewer"],
  },
  "home.kiro.card.power": {
    text: "Sexton inside Kiro, as an MCP server you install from GitHub.",
    readme: ["`powers/sexton` is a Kiro Power.", "the read-only MCP server `packages/mcp`", "Import power from a repository URL"],
  },
  "home.roadmap.lead": { text: "Releases are sequenced, not promised by date.", readme: ["Releases are sequenced, not promised by date."] },
  "home.roadmap.0.1": {
    text: "npm, seven signals, policy, fix pull requests, evidence pack, cemetery, CLI and GitHub Action",
    readme: ["- npm, direct dependencies, public GitHub repositories.", "- Seven signals:", "- Policy file with four rule types", "- Remediation pull requests:", "- Evidence pack:", "- Cemetery UI,", "- CLI with scan, check and evidence.", "- GitHub Action. On `main`"],
  },
  "home.roadmap.0.2": {
    text: "Transitive scoring, typosquat and license drift, private repos through a GitHub App, workspaces",
    readme: ["- Transitive package scoring", "- Typosquat distance and license drift signals", "- Private repositories through a GitHub App", "- Workspace scanning in the CLI"],
  },
  "home.roadmap.0.3": {
    text: "PyPI, SPDX export, download trend and bus factor, organisation policy defaults",
    readme: ["- PyPI", "- SPDX export", "- Download trend and bus factor signals", "- Policy inheritance and organisation defaults"],
  },
  "home.roadmap.1.0": {
    text: "Maven, Go and Cargo, signed evidence packs, SOC 2, DORA and CRA exports",
    readme: ["- Maven, Go, Cargo", "- Signed evidence packs", "- Evidence pack export for SOC 2, DORA and CRA reporting"],
  },
  "home.open.text": {
    text: "Sexton runs its own policy on its own dependencies on every push and pull request. Apache-2.0.",
    readme: ["Sexton runs its own policy against its own dependencies", "runs it on every push and pull request.", "Apache-2.0. See LICENSE and NOTICE."],
  },
  "home.footer.owner": {
    text: "Sexton · Harpreet Singh Siddhu · Apache-2.0 · Characters and ghost are original art.",
    readme: ["Apache-2.0. See LICENSE and NOTICE.", "Characters are original vector art. The ghost is original art."],
    files: [["NOTICE", "Copyright 2026 Harpreet Singh Siddhu"]],
  },
  // The Scan field's first example (1.9), the scanning card (1.14) and a failure card's next step (12.2).
  "example.demo": { text: "pull requests work here", readme: [README_DEMO_ONLY] },
  "scanning.sources": { text: "Asking npm, OSV and deps.dev", readme: [README_SOURCES] },
  "failure.not-readable": {
    text: "Check the spelling. Sexton can only read public repos with a package.json at the top.",
    readme: [README_PUBLIC, README_FILES],
  },
} as const satisfies Readonly<
  Record<string, { readonly text: string; readonly readme: readonly string[]; readonly files?: readonly (readonly [string, string])[] }>
>;

export type ClaimId = keyof typeof DEFS;

/** Every Claim, in the order above. */
export const CLAIMS: readonly Claim[] = (Object.keys(DEFS) as ClaimId[]).map((id) => ({ id, ...DEFS[id] }));

/** The text of a Claim. */
export function claim(id: ClaimId): string {
  return DEFS[id].text;
}
