// The facts of the two incident replays and nothing else. Spec cemetery-time, requirements 17.1 to 17.9,
// design.md section "Replay facts" (23 Nov 2026), with the registry publish times of spec cemetery-time-fixes,
// requirement 2 (24 Nov 2026). A field that no source gives is null here or left out.
// Nothing in this file is derived: the generator derives the states, reasons and signals from these facts.

/** The eight source URLs. Every one is https. A replay may list only these. */
export const SOURCE_URLS = Object.freeze({
  trendmicro: "https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html",
  csa: "https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-002/",
  npmTrusted: "https://docs.npmjs.com/trusted-publishers",
  snyk: "https://snyk.io/blog/inside-keyv-npm-compromise-preinstall-malware-trusted-provenance-ide-hooks/",
  osv: "https://osv.dev/vulnerability/MAL-2026-11524",
  ghIssue: "https://github.com/jaredwray/cacheable/issues/1692",
  registryAxios: "https://registry.npmjs.org/axios",
  registryKeyv: "https://registry.npmjs.org/keyv",
});

/** The reason of every required signal that no source gives. */
export const NOT_IN_PUBLIC_REPORTS = "not in public reports";

/**
 * Per replay:
 * - `versions`: the sourced versions in Version order. `publishedAt` null means no source gives a publish time.
 *   `installScript` and `provenance` null mean the sources do not say. `deprecated`, when present, is the registry's
 *   deprecated flag (false: the registry document has no deprecated field).
 * - `stops`: the Resolved version (what a fresh `npm install` resolves) from each instant. The first `from` is the
 *   window start, one hour before the bad publish. The last `from` is the Scan date (`generatedAt`): for axios the
 *   removal of 1.14.1, for keyv the publish of 6.0.0.
 * - `factSources`: the URL that a signal of the installed version cites.
 * - Spec new-signals: `publisher` ({ name, method } or null) and `dependencies` (object or null) per version, and
 *   `newDependencies`: per added dependency name, the version its range resolved to at the parent's publish time, that
 *   version's publish time and its install script flag. The name of the account that published axios 1.14.1 is sourced
 *   but left out (design.md Decisions 12), so that publisher is { name: null, method: "token" }.
 * - Spec clean-site, 8.12 to 8.14: `steps`, one per Stop in order (a title, "What happened" and "What Sexton shows"),
 *   and `why`, the "Why attackers do this" text. Each sentence is followed by a comment naming the SOURCE_URLS key it
 *   rests on; a "What Sexton shows" sentence about the grave also rests on the Segment the generator derives for that
 *   Stop. No sentence states a fact that its source does not give.
 */
export const REPLAYS = Object.freeze({
  axios: {
    id: "axios",
    package: "axios",
    title: "Replay: axios npm compromise, 31 March 2026",
    summary:
      "axios 1.14.1 was published by hand from a compromised maintainer account, with no provenance, and it added the dependency plain-crypto-js 4.2.1, whose postinstall ran the payload. plain-crypto-js 4.2.1 was published 22 minutes before axios 1.14.1. npm removed 1.14.1 at about 03:29 UTC, so a fresh install resolves 1.14.0 again. Sexton marks 1.14.1 Possessed because provenance regressed.",
    generatedAt: "2026-03-31T03:29:00.000Z",
    sources: [
      { label: "Trend Micro: axios npm package compromised", url: SOURCE_URLS.trendmicro },
      { label: "CSA Singapore advisory AD-2026-002", url: SOURCE_URLS.csa },
      { label: "npm docs: trusted publishers", url: SOURCE_URLS.npmTrusted },
      { label: "npm registry: axios", url: SOURCE_URLS.registryAxios },
    ],
    versions: [
      {
        version: "1.14.0",
        publishedAt: "2026-03-27T19:01:40.915Z",
        installScript: null,
        provenance: true,
        publisher: { name: "GitHub Actions", method: "trusted-publisher" },
        dependencies: { "form-data": "^4.0.5", "proxy-from-env": "^2.1.0", "follow-redirects": "^1.15.11" },
      },
      {
        version: "1.14.1",
        publishedAt: "2026-03-31T00:21:58.168Z",
        installScript: false,
        provenance: false,
        publisher: { name: null, method: "token" },
        dependencies: { "form-data": "^4.0.5", "proxy-from-env": "^2.1.0", "follow-redirects": "^1.15.11", "plain-crypto-js": "^4.2.1" },
      },
    ],
    // plain-crypto-js 4.2.1: publish time from the registry time map, postinstall from Trend Micro.
    newDependencies: {
      "plain-crypto-js": { resolvedVersion: "4.2.1", resolvedPublishTime: "2026-03-30T23:59:12.278Z", installScript: true },
    },
    stops: [
      { from: "2026-03-30T23:21:58.168Z", version: "1.14.0" },
      { from: "2026-03-31T00:21:58.168Z", version: "1.14.1" },
      { from: "2026-03-31T03:29:00.000Z", version: "1.14.0" },
    ],
    factSources: {
      publishedAt: SOURCE_URLS.registryAxios,
      installScript: SOURCE_URLS.trendmicro,
      provenance: SOURCE_URLS.npmTrusted,
      publisherChange: SOURCE_URLS.trendmicro,
      newDependency: SOURCE_URLS.trendmicro,
    },
    steps: [
      {
        title: "A normal day",
        happened: [
          "axios 1.14.0 is the current release.", // registryAxios: the newest 1.x version in the time map before 1.14.1
          "It was published by GitHub Actions through npm's trusted publishing, so it carries provenance.", // trendmicro, npmTrusted, registryAxios
        ].join(" "),
        shows: [
          "Nothing to flag.", // registryAxios: the facts of 1.14.0; the Segment is Alive, "no rule matched"
          "The grave is Alive.", // registryAxios: the Segment's State
        ].join(" "),
      },
      {
        title: "A poisoned release appears",
        happened: [
          "An attacker publishes axios 1.14.1 by hand from the lead maintainer's npm account, with a stolen access token.", // trendmicro
          "It adds a new dependency, plain-crypto-js 4.2.1, whose postinstall script installs a remote access trojan.", // trendmicro, csa
        ].join(" "),
        shows: [
          "The grave turns Possessed.", // trendmicro: the Segment is Possessed by "provenance regression"
          "1.14.0 had provenance and 1.14.1 has none.", // registryAxios, trendmicro ("no OIDC binding"), npmTrusted
          "That drop is the warning.", // npmTrusted: provenance comes with trusted publishing, which 1.14.1 skipped
        ].join(" "),
      },
      {
        title: "npm removes the bad release",
        happened: [
          "About three hours after it appeared, npm removes 1.14.1.", // trendmicro: published 00:21 UTC, removed about 03:30 UTC
          "A fresh install gets 1.14.0 again.", // registryAxios: no 1.x version between 1.14.0 and 1.15.0 but 1.14.1; csa
        ].join(" "),
        shows: [
          "The grave is Alive again.", // registryAxios: the Segment's State at the removal
          "A machine that installed 1.14.1 in those hours should still be treated as compromised.", // csa, trendmicro
        ].join(" "),
      },
    ],
    why: [
      "axios is a JavaScript HTTP client with over 100 million downloads a week on npm.", // trendmicro
      "An attacker who took over its lead maintainer's npm account published a version that exists only on npm, with no matching code on GitHub.", // trendmicro
      "The new dependency's install script left a remote access trojan on macOS, Windows and Linux machines, then erased its own traces.", // trendmicro
      "Anyone who installed it is told to assume compromise and rotate every credential.", // csa, trendmicro
    ].join(" "),
  },
  keyv: {
    id: "keyv",
    package: "keyv",
    title: "Replay: keyv npm compromise, 4 August 2026",
    summary:
      "keyv 6.0.0 was published on 4 August 2026 at 09:35 UTC and added a preinstall script, node setup.mjs. It still carried a valid provenance attestation from GitHub Actions, so provenance alone did not flag it. Sexton marks it Possessed because an install script appeared.",
    generatedAt: "2026-08-04T09:35:00.763Z",
    sources: [
      { label: "Snyk: inside the keyv npm compromise", url: SOURCE_URLS.snyk },
      { label: "OSV: MAL-2026-11524", url: SOURCE_URLS.osv },
      { label: "cacheable issue 1692", url: SOURCE_URLS.ghIssue },
      { label: "npm registry: keyv", url: SOURCE_URLS.registryKeyv },
    ],
    // 5.6.0: the registry document has no deprecated field and no dist.attestations, so deprecated and provenance
    // are false, both from the keyv registry URL.
    versions: [
      { version: "5.6.0", publishedAt: "2026-01-21T00:39:26.982Z", installScript: false, provenance: false, deprecated: false, publisher: null, dependencies: null },
      {
        version: "6.0.0-rc.1",
        publishedAt: "2026-08-03T19:21:08.158Z",
        installScript: false,
        provenance: null,
        publisher: { name: "GitHub Actions", method: "trusted-publisher" },
        dependencies: null,
      },
      // Snyk: "The npm manifest identifies GitHub Actions as the trusted publisher for keyv@6.0.0". No source names its dependencies.
      {
        version: "6.0.0",
        publishedAt: "2026-08-04T09:35:00.763Z",
        installScript: true,
        provenance: true,
        publisher: { name: "GitHub Actions", method: "trusted-publisher" },
        dependencies: null,
      },
    ],
    newDependencies: {},
    // 6.0.0-rc.1 is a prerelease that a fresh install of a stable range does not resolve, so it is never a Stop version.
    stops: [
      { from: "2026-08-04T08:35:00.763Z", version: "5.6.0" },
      { from: "2026-08-04T09:35:00.763Z", version: "6.0.0" },
    ],
    // provenance cites Snyk: the report signal is about the installed 6.0.0.
    factSources: {
      publishedAt: SOURCE_URLS.registryKeyv,
      installScript: SOURCE_URLS.snyk,
      provenance: SOURCE_URLS.snyk,
      deprecated: SOURCE_URLS.registryKeyv,
      publisherChange: SOURCE_URLS.snyk,
      newDependency: SOURCE_URLS.snyk,
    },
    steps: [
      {
        title: "A normal day",
        happened: [
          "keyv 5.6.0 is the latest stable release.", // snyk ("the latest clean stable 5.x version"), registryKeyv
          "It has no install script, so installing it runs nothing.", // registryKeyv: no preinstall, install or postinstall in 5.6.0
        ].join(" "),
        shows: [
          "Nothing to flag.", // registryKeyv: the facts of 5.6.0; the Segment is Alive, "no rule matched"
          "The grave is Alive.", // registryKeyv: the Segment's State
        ].join(" "),
      },
      {
        title: "A poisoned release appears",
        happened: [
          "keyv 6.0.0 is published at 09:35 UTC with a new preinstall script, node setup.mjs.", // snyk, ghIssue
          "It still carries valid provenance from GitHub Actions, the trusted publisher.", // snyk, ghIssue ("a valid SLSA attestation")
        ].join(" "),
        shows: [
          "The grave turns Possessed.", // snyk: the Segment is Possessed by "install script added in 6.0.0"
          "An install script appeared that earlier versions did not have.", // ghIssue: "absent from the version immediately preceding it"
          "Provenance alone would not have flagged it.", // ghIssue ("proves only that poisoned source was built by the real pipeline"), snyk
        ].join(" "),
      },
    ],
    why: [
      "npm recorded 619,682,667 downloads of keyv from 5 July to 3 August.", // snyk
      "npm runs a preinstall script by itself during install, so no one has to import keyv or start an app for the code to run.", // snyk
      "Reports say its hidden second stage goes after GitHub and npm tokens, cloud credentials and private keys.", // snyk (from the incident reports it cites)
      "Developer laptops and CI runners are prized targets because they often hold those credentials.", // snyk
    ].join(" "),
  },
});

export const REPLAY_IDS = Object.freeze(["axios", "keyv"]);
