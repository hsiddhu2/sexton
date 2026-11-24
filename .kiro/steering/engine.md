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
- The Timeline lives in packages/engine/src/timeline. timelineFacts keeps at most 50 versions, 20 advisories and 10 maintainers per version, and records coveredFrom when older versions are dropped.
- stateAsOf(facts, health, scanDate, asOf) is pure. At or after the scan date it returns the scan form. Before the installed version is seen it returns the Not-published form. Otherwise it builds StateInputs from dated facts and calls evaluateState, so there is one copy of the state rules. Deprecation, undated advisories and snapshot history are unavailable before the scan date.
- The Engine computes the Segments. buildTimeline calls stateAsOf at every instant where a form can change and writes at most 64 Segments of { from, state, reason, ghost }. The web app only looks the Segments up (time/form-at.ts) and holds no state rule. The optional Segment version is set by the replay generator, never by buildTimeline.
