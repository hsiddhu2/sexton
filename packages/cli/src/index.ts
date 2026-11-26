// The public surface of @sexton/cli. Spec: .kiro/specs/sexton-power, Requirement 8.2.
// The MCP server reuses the scan composition through these exports; nothing here changes what the CLI prints or exits with.
export { runCli } from "./run-cli.js";
export { runScanPipeline, resolveTarget } from "./compose.js";
export type { PipelineError, PipelineResult, ResolvedTarget } from "./compose.js";
export { createRealDeps } from "./real-deps.js";
export { repoFromRemote } from "./repo-name.js";
export { MSG } from "./messages.js";
export { safe } from "./safe-text.js";
export { renderCheck } from "./check-output.js";
export type { CliDeps, FilePort, GitPort, ReadOutcome, TreeSource } from "./deps.js";
