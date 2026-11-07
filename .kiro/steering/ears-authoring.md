---
inclusion: auto
name: ears-authoring
description: Use when writing or editing requirements.md acceptance criteria or bugfix.md so that property-based tests fall out of them
---
# Writing acceptance criteria that produce properties

Use the five EARS shapes and nothing else:
- Ubiquitous: THE SYSTEM SHALL ...
- Event: WHEN <trigger> THE SYSTEM SHALL ...
- Unwanted: IF <condition> THEN THE SYSTEM SHALL ...
- State: WHILE <state> THE SYSTEM SHALL ...
- Optional: WHERE <feature> THE SYSTEM SHALL ...

One testable behaviour per criterion. Name the input domain explicitly ("for any list of up to 300 packages", "for any ISO date string").

Prefer shapes that become properties:
- Round-trip: encode then decode returns the input.
- Idempotence: applying twice equals applying once.
- Invariant: some fact holds for every output.
- Monotonic: ordering of inputs is preserved in outputs.
- Rejection: for any invalid input the system refuses with a named error.
- Determinism: same inputs, same output.

Avoid criteria that depend on live network or wall-clock time without passing the clock in as an input.

Every task in tasks.md ends with _Requirements: x.y_ naming the criteria it implements.
