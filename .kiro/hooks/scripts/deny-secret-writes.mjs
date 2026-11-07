// PreToolUse guard. Reads the tool call from stdin, exits 2 to block writes to
// secret-bearing paths. Any other exit is an error, not a block.
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let path = "";
  try {
    const input = JSON.parse(raw);
    path = input?.tool_input?.path ?? input?.tool_input?.file_path ?? input?.path ?? "";
  } catch {
    process.exit(0);
  }
  const blocked = [/^\.env(\..*)?$/, /^private\//, /\.pem$/, /credentials/i, /secrets?\.(json|ya?ml|toml)$/i, /\.kiro\/settings\/mcp\.json$/];
  if (blocked.some((re) => re.test(path))) {
    process.stderr.write(`sexton guard: write to ${path} is blocked. Secrets and private files are never written by the agent.\n`);
    process.exit(2);
  }
  process.exit(0);
});
