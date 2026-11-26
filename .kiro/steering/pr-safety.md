---
inclusion: fileMatch
fileMatchPattern: ["packages/engine/src/remediation/**/*.ts", "packages/api/src/remediate/**/*.ts", "packages/api/src/remediate-handler.ts"]
---
# Pull request safety

- Always create a branch named sexton/<kind>-<package>. Never commit to the default branch.
- Always open a pull request. Never merge. Never force push.
- The PR body always contains: package and version, state and the rule that produced it, every signal with source and timestamp, the proposed change, and for migrations the files changed and the sites left for human review.
- One remediation per PR. Never batch packages.
- Open pull requests only on repositories in the remediate allowlist. Refuse every other repository before any request.
- Never delete a branch, including our own. A failed run leaves its branch for a person to review.
- Record every PR in the remediation log before returning.
- GitHub MCP in .kiro/settings/mcp.json: read tools are auto-approved; disabledTools blocks delete_repository, force_push, merge_pull_request, delete_branch, update_pull_request_branch, create_repository and fork_repository. Any other write tool asks first.
