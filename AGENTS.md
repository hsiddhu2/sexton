# Sexton: agent guide

Read .kiro/steering first. product.md says what Sexton is. tech.md says how it is built. structure.md says where things go.

Non-negotiable:
- Specs live in .kiro/specs. Every task names the requirements it implements.
- No network in tests. No secrets in files. No pushes to the default branch. No merges.
- Pure functions in packages/engine. I/O at the edges.

Product requirements: docs/requirements.md
