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
  },
});

export const REPLAY_IDS = Object.freeze(["axios", "keyv"]);
