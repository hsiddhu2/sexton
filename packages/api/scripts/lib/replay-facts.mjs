// The facts of the two incident replays and nothing else. Spec cemetery-time, requirements 17.1 to 17.9,
// design.md section "Replay facts" (23 Nov 2026). A field that no source gives is null here or left out.
// Nothing in this file is derived: the generator derives the states, reasons and signals from these facts.

/** The six source URLs. Every one is https. A replay may list only these. */
export const SOURCE_URLS = Object.freeze({
  trendmicro: "https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html",
  csa: "https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-002/",
  npmTrusted: "https://docs.npmjs.com/trusted-publishers",
  snyk: "https://snyk.io/blog/inside-keyv-npm-compromise-preinstall-malware-trusted-provenance-ide-hooks/",
  osv: "https://osv.dev/vulnerability/MAL-2026-11524",
  ghIssue: "https://github.com/jaredwray/cacheable/issues/1692",
});

/** The reason of every required signal that no source gives. */
export const NOT_IN_PUBLIC_REPORTS = "not in public reports";

/**
 * Per replay:
 * - `versions`: the sourced versions in Version order. `publishedAt` null means no source gives a publish time.
 *   `installScript` and `provenance` null mean the sources do not say.
 * - `stops`: the Resolved version (what a fresh `npm install` resolves) from each instant. The first `from` is the
 *   window start. The last `from` is the Scan date (`generatedAt`) for axios and the publish of 6.0.0 for keyv.
 * - `factSources`: the URL that a signal of the installed version cites.
 */
export const REPLAYS = Object.freeze({
  axios: {
    id: "axios",
    package: "axios",
    title: "Replay: axios npm compromise, 31 March 2026",
    summary:
      "axios 1.14.1 was published by hand from a compromised maintainer account, with no provenance, and it added the dependency plain-crypto-js 4.2.1, whose postinstall ran the payload. npm removed 1.14.1 at about 03:29 UTC, so a fresh install resolves 1.14.0 again. Sexton marks 1.14.1 Possessed because provenance regressed.",
    generatedAt: "2026-03-31T03:29:00.000Z",
    sources: [
      { label: "Trend Micro: axios npm package compromised", url: SOURCE_URLS.trendmicro },
      { label: "CSA Singapore advisory AD-2026-002", url: SOURCE_URLS.csa },
      { label: "npm docs: trusted publishers", url: SOURCE_URLS.npmTrusted },
    ],
    versions: [
      { version: "1.14.0", publishedAt: null, installScript: null, provenance: true },
      { version: "1.14.1", publishedAt: "2026-03-31T00:21:00.000Z", installScript: false, provenance: false },
    ],
    stops: [
      { from: "2026-03-30T23:21:00.000Z", version: "1.14.0" },
      { from: "2026-03-31T00:21:00.000Z", version: "1.14.1" },
      { from: "2026-03-31T03:29:00.000Z", version: "1.14.0" },
    ],
    factSources: {
      publishedAt: SOURCE_URLS.trendmicro,
      installScript: SOURCE_URLS.trendmicro,
      provenance: SOURCE_URLS.npmTrusted,
    },
  },
  keyv: {
    id: "keyv",
    package: "keyv",
    title: "Replay: keyv npm compromise, 4 August 2026",
    summary:
      "keyv 6.0.0 was published on 4 August 2026 at 09:35 UTC and added a preinstall script, node setup.mjs. It still carried a valid provenance attestation from GitHub Actions, so provenance alone did not flag it. Sexton marks it Possessed because an install script appeared.",
    generatedAt: "2026-08-04T09:35:00.000Z",
    sources: [
      { label: "Snyk: inside the keyv npm compromise", url: SOURCE_URLS.snyk },
      { label: "OSV: MAL-2026-11524", url: SOURCE_URLS.osv },
      { label: "cacheable issue 1692", url: SOURCE_URLS.ghIssue },
    ],
    versions: [
      { version: "5.6.0", publishedAt: null, installScript: false, provenance: null },
      { version: "6.0.0-rc.1", publishedAt: null, installScript: false, provenance: null },
      { version: "6.0.0", publishedAt: "2026-08-04T09:35:00.000Z", installScript: true, provenance: true },
    ],
    // 6.0.0-rc.1 is a prerelease that a fresh install of a stable range does not resolve, so it is never a Stop version.
    stops: [
      { from: "2026-08-04T08:35:00.000Z", version: "5.6.0" },
      { from: "2026-08-04T09:35:00.000Z", version: "6.0.0" },
    ],
    factSources: {
      publishedAt: SOURCE_URLS.snyk,
      installScript: SOURCE_URLS.snyk,
      provenance: SOURCE_URLS.snyk,
    },
  },
});

export const REPLAY_IDS = Object.freeze(["axios", "keyv"]);
