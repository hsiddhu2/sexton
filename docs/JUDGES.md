# Sexton: a guide for judges

One page. Everything named here is on `main`. The hosted site is deployed by hand, so it can lag `main`. It was last deployed on 28 November 2026. Release 0.1.0 of the CLI and the MCP server is on npm.

## Open

- The home page: https://de1giv8lj8sfh.cloudfront.net. It says what Sexton is and links to the rest. The tabs "Overview" and "Cemetery" at the top of every page switch between the two.
- The cemetery: https://de1giv8lj8sfh.cloudfront.net/cemetery
- The two replays: https://de1giv8lj8sfh.cloudfront.net/cemetery?replay=axios and https://de1giv8lj8sfh.cloudfront.net/cemetery?replay=keyv

## Click

1. Hover a grave, or move to it with Tab and the arrow keys. The details panel shows its name, version, state, a plain sentence of why, and three of its signals. "Fix in this order" lists the packages to fix first. A chip over the cemetery picks one state and dims the rest, and "List" shows the packages as a table.
2. Click a grave, or press Enter. The drawer opens with three tabs: Evidence (the state, the reason and every signal with its source and the time it was read), The fix (the plan when there is one, its change to package.json and the pull request body Sexton would open) and History. Escape closes it.
3. Press "Watch a real attack" under the cemetery and pick axios or keyv. Each step says what happened and what Sexton shows. Press "Next step" to move on, or "Play all".
4. "What is Sexton?" opens a two-minute guide. Legend explains each grave. Tour points out the three main parts of the page. Music is off until you press it; then a recorded track plays and the characters dance to its beat.
5. The links in the site footer download the evidence pack as JSON and as Markdown.

Type a public GitHub repository, as owner/name or a github.com link, in the Scan box on the home page or the Scan field in the cemetery header, and press Scan for a live scan. The "Open pull request" button on the drawer's fix tab appears only on a live scan of the demo repository `https://github.com/hsiddhu2/sexton-demo`, and it opens a real pull request there.

## The five states

The rules run in this order, and the first match wins.

| State | When |
|---|---|
| Possessed | A maintainer changed in the last 90 days, provenance regressed, a new install script appeared, a new dependency has an install script or was published within 7 days, or the publisher changed from a trusted publisher to a token |
| Dead | The installed version is deprecated, or the last publish was more than 24 months ago and it has an advisory |
| Haunted | It has a High or Critical advisory |
| Restless | The last publish was more than 24 months ago, or it has a Low or Moderate advisory. Also when last publish, deprecation and advisories are all unavailable and no Possessed rule matched |
| Alive | None of the above |

## Run it locally

From npm, with Node.js 20.19 or later:

```sh
npx sexton --help                        # the commands and the exit codes
```

Then run the `scan`, `check` and `evidence` commands below with `npx sexton` in place of `node packages/cli/dist/bin.js`.

The packages are [`sexton`](https://www.npmjs.com/package/sexton) and [`sexton-mcp`](https://www.npmjs.com/package/sexton-mcp). Both carry npm provenance from the release workflow.

With Node.js 22, from a clone:

```sh
npm ci                                   # exact versions from the lockfile
npm test                                 # every package's tests, no network
npx tsc -b packages/cli                  # build the CLI
node packages/cli/dist/bin.js scan https://github.com/expressjs/express
node packages/cli/dist/bin.js check https://github.com/expressjs/express
node packages/cli/dist/bin.js evidence https://github.com/expressjs/express
```

`scan` prints a table and writes `scan.json`. `check` evaluates the repository's `sexton.policy.yml`, or the default policy when it has none, and exits 1 when a rule fails. `evidence` writes `sexton-evidence.json` and `sexton-evidence.md` and prints the digest. The last three commands read the npm registry, OSV, deps.dev and GitHub, so they need network.

## The GitHub Action on a pull request

`packages/action` builds the CLI from its own checkout, runs `sexton check` on the pull request's checkout, writes the job summary and posts one summary comment. It never installs or runs code from the repository it checks. This repository runs it on its own pull requests in `.github/workflows/sexton.yml`.

## Where things are

- `.kiro/specs`: one folder per spec, each with requirements.md, design.md and tasks.md
- `.kiro/steering`: the rules every spec follows
- `.kiro/hooks` and `.kiro/agents`: the hooks and agents
- `docs/requirements.md`: the product requirements every spec traces to
- `build/reviews`: the review record of each spec
- `docs/architecture.md`, `docs/threat-model.md`: how it runs on AWS and what protects it
