---
inclusion: fileMatch
fileMatchPattern: "packages/engine/**/*.ts"
---
# Engine rules

- Pure functions first. The state function, the policy evaluator and the bump selector take data in and return data out. No I/O inside them.
- Every signal is { value, source, fetchedAt, available, reason? }. Never a bare value.
- Missing signals are recorded, never thrown. A package with missing signals still gets a state and a missingSignals list.
- Dates are ISO strings at the boundary and Date objects inside. Never compare strings.
- Severity is normalised to exactly one of Critical, High, Moderate, Low, Unknown before any rule reads it.
- State type and order: #[[file:packages/engine/src/state.ts]]
- Evidence modules live in packages/engine/src/evidence. buildEvidencePack never rejects and never mutates its input.
- The evidence digest is SHA-256 over the RFC 8785 canonical form of the body. It is not a signature.
- The SBOM is CycloneDX 1.5 JSON, written by hand in evidence/sbom.ts.
- The remediation log contract in remediation/remediation-log.ts has two methods, append and list. It has no update and no delete.
- Every log entry must pass isValidLogEntry. Its fields are repository, branch, prUrl, package, kind and timestamp.
- Remediation branch names start with sexton/ and pass isValidBranchName.
