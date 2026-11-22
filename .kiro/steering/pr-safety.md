---
inclusion: fileMatch
fileMatchPattern: ["packages/engine/src/remediation/**/*.ts", "packages/api/src/github/**/*.ts", "packages/api/src/remediate/**/*.ts"]
---
# Pull request safety

- Always create a branch named sexton/<kind>-<package>. Never commit to the default branch.
- Always open a pull request. Never merge. Never force push. Never delete a branch that is not ours.
- The PR body always contains: package and version, state and the rule that produced it, every signal with source and timestamp, the proposed change, and for migrations the files changed and the sites left for human review.
- One remediation per PR. Never batch packages.
- Open pull requests only on repositories in the remediate allowlist. Refuse every other repository before any request.
- Never delete a branch, including our own. A failed run leaves its branch for a person to review.
- Record every PR in the remediation log before returning.
- GitHub MCP tools allowed: create_branch, push_files, create_or_update_file, create_pull_request, and read tools. Everything else is disabled in mcp.json.
