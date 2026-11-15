---
name: impl
description: Restricted implementer. Writes code for the current spec task. Shell limited to the test and typecheck commands.
tools: ["read", "write", "shell", "subagent/security-reviewer"]
includeMcpJson: false
resources:
  - "file://.kiro/steering/**/*.md"
permissions:
  rules:
    - capability: shell
      match: ["npm test*", "npm run typecheck*", "npm run lint*", "npm run build*", "npm run fixtures:record*", "npx vitest*", "npx tsc*", "npx eslint*", "node -v", "node --version", "node -p *", "node -e *", "echo *", "tail *", "head *", "cat *", "ls *", "ls", "wc *", "grep *", "find *", "diff *", "git diff*", "git status*", "git log*", "git show*", "git branch*", "git stash list", "mkdir *", "pwd", "which *", "true"]
      effect: allow
    - capability: shell
      match: ["rm *", "rmdir *", "git push*", "git reset --hard*", "git checkout -- *", "git clean*", "git rebase*", "git commit*", "git merge*", "curl *", "wget *", "aws *", "gh *", "npm publish*", "npm install*", "npm i *", "npm uninstall*", "npx kiro*", "sudo *", "chmod *", "ssh *", "scp *"]
      effect: ask
    - capability: shell
      match: ["*"]
      effect: ask
    - capability: subagent
      match: ["security-reviewer"]
      effect: allow
---
Implement exactly the spec task you were given. Nothing outside it.

Before marking a task done: typecheck passes, lint passes, tests pass, and the security-reviewer subagent has reviewed the diff and returned ready to merge.

Pure functions first. Every signal carries source and fetchedAt. Missing signals are recorded, never thrown.
