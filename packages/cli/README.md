# sexton

The Sexton command line. It scores every direct npm dependency of a repository, checks your `sexton.policy.yml`, and writes an evidence pack.

```sh
npx sexton scan https://github.com/<owner>/<repo>
```

Or install it, which gives you the `sexton` command:

```sh
npm install -g sexton
sexton scan <repo-or-path> [--repo <url>] [--out <file>]
sexton check [repo-or-path] [--repo <url>] [--summary <file>]
sexton evidence [repo-or-path] [--repo <url>] [--out-dir <dir>]
sexton evidence --verify <file>
```

- A target that is a GitHub repository URL is read from GitHub. Any other target is a local directory, default the current one. A local directory needs its repository name: `--repo`, or an `origin` remote on github.com.
- `scan` prints a table and writes `scan.json`. `check` prints every rule and exits non-zero when one fails. `evidence` writes `sexton-evidence.json` and `sexton-evidence.md` and prints the digest. `--verify` checks a pack.
- Exit codes: 0 success, 1 the policy failed or the pack did not verify, 2 anything else.
- One file, no dependencies: the engine and the libraries it uses are bundled in `sexton.mjs`, and their licences are in `THIRD-PARTY-NOTICES.md`.
- Node.js 20.19 or later.

Source, specs and the full documentation: https://github.com/hsiddhu2/sexton

Licensed under the Apache License, Version 2.0.
