# Reviews: spec 07 evidence-pack

Each review was run by an independent reviewer that had not seen the implementation, with the spec folder, the diff against main, docs/requirements.md, the handoff and the steering files.

## Review 1: spec (requirements, design, tasks), 21 Nov 2026

Verdict: NOT READY, 3 defects, all fixed before the spec commit.

1. The verification text of Requirement 5.2 was undefined (a dangling reference in Decisions item 4), and `jq -cjS` differs from RFC 8785 for U+007F, keys above U+E000 and numbers from 1e21 (measured with jq-1.7.1-apple). Fixed: Decisions item 4 defines `VERIFY_TEXT`, the jq command with its one reachable limit (U+007F) and `verifyEvidencePack` named as exact, with a fallback text if the demo trial fails; Overview caveated.
2. Requirement 8.2 (null for any `?scan=` load) contradicted Decisions item 6 (the demo address through `?scan=` shows demo links). Fixed: 8.2 reworded, example test traced.
3. Requirements 1.2 and 4.4 could not be met for `-0` and lone-surrogate edits. Fixed: 1.2 excludes them, the leaf-edit criterion (now 4.5) requires a lone-surrogate-free value with a different canonical text, 4.2 split, verify criteria renumbered 4.1 to 4.6, traces updated.

Notes acted on: policy digest is over BOM-stripped text too; 3.4 says "after the Clean copy"; README moves the pack to "on main"; decisions 10 to 15 (hosted Markdown before deploy, evidence-specific invalid-request message, each download runs a scan, log sort by timestamp text, golden files embed ENGINE_VERSION, evidence-too-large is API only). Notes kept: EARS bundling in 2.2, 2.4, 3.2, 5.4, 7.5 (each tested by one example); task 1 trace kept as in spec 06; the docs/cemetery.png note goes in the report.

## Review 1b: spec re-review

Verdict: READY. Notes fixed: task 9 carries the jq trial; 5.2 names `VERIFY_TEXT` so it holds with either text; Testing Strategy says which properties exclude `-0` and lone surrogates.
