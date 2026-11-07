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
