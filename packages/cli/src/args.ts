// Argument parsing with node:util parseArgs, strict. Spec: .kiro/specs/cli-and-action, Requirements 3.1, 3.3. Pure.

import { parseArgs } from "node:util";

export type Command =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "scan"; readonly target: string; readonly repo?: string; readonly out?: string }
  | { readonly kind: "check"; readonly target?: string; readonly repo?: string; readonly summary?: string }
  | { readonly kind: "evidence"; readonly target?: string; readonly repo?: string; readonly outDir?: string }
  | { readonly kind: "verify"; readonly file: string };

export type Parsed = { readonly ok: true; readonly command: Command } | { readonly ok: false; readonly reason: string };

const OPTIONS = {
  repo: { type: "string" },
  out: { type: "string" },
  summary: { type: "string" },
  "out-dir": { type: "string" },
  verify: { type: "string" },
  help: { type: "boolean" },
  version: { type: "boolean" },
} as const;

type OptionName = keyof typeof OPTIONS;

const ALLOWED: Readonly<Record<string, readonly OptionName[]>> = {
  scan: ["repo", "out"],
  check: ["repo", "summary"],
  evidence: ["repo", "out-dir", "verify"],
};

function fail(reason: string): Parsed {
  return { ok: false, reason };
}

export function parseCommand(argv: readonly string[]): Parsed {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; strict: true; tokens: true }>>;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true, tokens: true });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return fail(code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" ? "an option is missing its value" : "unknown option");
  }
  const seen = new Map<string, number>();
  for (const token of parsed.tokens) if (token.kind === "option") seen.set(token.name, (seen.get(token.name) ?? 0) + 1);
  if ([...seen.values()].some((n) => n > 1)) return fail("an option is given twice");
  const given = [...seen.keys()] as OptionName[];
  const { values, positionals } = parsed;

  if (values.help === true || values.version === true) {
    if (given.length !== 1 || positionals.length > 0) return fail("--help and --version take nothing else");
    return { ok: true, command: { kind: values.help === true ? "help" : "version" } };
  }
  const [name, ...rest] = positionals;
  if (name === undefined) return fail("no command");
  const allowed = Object.hasOwn(ALLOWED, name) ? ALLOWED[name] : undefined;
  if (allowed === undefined) return fail("unknown command");
  if (given.some((g) => !allowed.includes(g))) return fail("an option does not belong to this command");
  if (rest.length > 1) return fail("too many arguments");
  const target = rest[0];
  if (target === "") return fail("the target is empty");
  for (const g of given) if (values[g] === "") return fail("an option value is empty");
  const repo = values.repo;

  switch (name) {
    case "scan":
      if (target === undefined) return fail("scan needs a repository URL or a directory");
      return { ok: true, command: { kind: "scan", target, ...(repo !== undefined ? { repo } : {}), ...(values.out !== undefined ? { out: values.out } : {}) } };
    case "check":
      return {
        ok: true,
        command: { kind: "check", ...(target !== undefined ? { target } : {}), ...(repo !== undefined ? { repo } : {}), ...(values.summary !== undefined ? { summary: values.summary } : {}) },
      };
    default:
      if (values.verify !== undefined) {
        if (given.length !== 1 || target !== undefined) return fail("--verify takes a file and nothing else");
        return { ok: true, command: { kind: "verify", file: values.verify } };
      }
      return {
        ok: true,
        command: {
          kind: "evidence",
          ...(target !== undefined ? { target } : {}),
          ...(repo !== undefined ? { repo } : {}),
          ...(values["out-dir"] !== undefined ? { outDir: values["out-dir"] } : {}),
        },
      };
  }
}
