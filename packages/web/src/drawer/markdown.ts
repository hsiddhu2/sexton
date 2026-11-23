// A small Markdown parser for exactly what packages/engine/src/remediation/pr-body.ts emits. Pure.
// Spec: .kiro/specs/cemetery-polish, Requirement 8. No library, no HTML, no regular expression with nested quantifiers.
// Every scanner remembers when a closing marker cannot exist after a position, so the cost is linear.

export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "bold"; readonly children: readonly Inline[] }
  | { readonly kind: "link"; readonly href: string; readonly text: string }; // href always starts with "https://"

export type Cell = readonly Inline[];

export type Block =
  | { readonly kind: "heading"; readonly level: 1 | 2; readonly children: readonly Inline[] }
  | { readonly kind: "paragraph"; readonly children: readonly Inline[] }
  | { readonly kind: "table"; readonly header: readonly Cell[]; readonly rows: readonly (readonly Cell[])[] }
  | { readonly kind: "list"; readonly ordered: false; readonly items: readonly Cell[] }
  | { readonly kind: "list"; readonly ordered: true; readonly start: number; readonly items: readonly Cell[] }
  | { readonly kind: "quote"; readonly children: readonly Inline[] }
  | { readonly kind: "rule" };

const HTTPS = "https://";
const SPACE = /\s/u;

/** True when the address holds white space or a control character. A linear scan. */
function hasBadChar(address: string): boolean {
  for (let k = 0; k < address.length; k += 1) {
    const code = address.charCodeAt(k);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || SPACE.test(address.charAt(k))) return true;
  }
  return false;
}

// ---- inline ----

function pushText(out: Inline[], text: string): void {
  if (text.length === 0) return;
  const last = out[out.length - 1];
  if (last !== undefined && last.kind === "text") out[out.length - 1] = { kind: "text", text: last.text + text };
  else out.push({ kind: "text", text });
}

/** Inline parse. `codeOnly` reads only code spans (used inside bold). */
function parseInline(source: string, codeOnly: boolean): Inline[] {
  const out: Inline[] = [];
  const n = source.length;
  let buffer = "";
  let i = 0;
  // Memos: once a closer is missing after a position, it is missing for every later opener.
  let noBacktick = false;
  let noBold = false;
  let noParen = false;
  let closeAt = -1; // cached position of the next "](" at or after the last search start
  let noClose = false;
  let openFor = -1; // last "[" before closeAt, cached for that closeAt
  let openForClose = -2;

  const flush = (): void => {
    pushText(out, buffer);
    buffer = "";
  };

  while (i < n) {
    const ch = source.charAt(i);
    if (ch === "`" && !noBacktick) {
      const end = source.indexOf("`", i + 1);
      if (end === -1) {
        noBacktick = true;
      } else {
        flush();
        out.push({ kind: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (!codeOnly && ch === "*" && source.charAt(i + 1) === "*" && !noBold) {
      const end = source.indexOf("**", i + 3);
      if (end === -1) {
        noBold = true;
      } else {
        flush();
        out.push({ kind: "bold", children: parseInline(source.slice(i + 2, end), true) });
        i = end + 2;
        continue;
      }
    } else if (!codeOnly && ch === "[" && !noClose) {
      if (closeAt < i + 1) {
        closeAt = source.indexOf("](", i + 1);
        if (closeAt === -1) noClose = true;
      }
      if (!noClose) {
        if (openForClose !== closeAt) {
          openFor = source.lastIndexOf("[", closeAt - 1);
          openForClose = closeAt;
        }
        if (openFor === i && !noParen) {
          const paren = source.indexOf(")", closeAt + 2);
          if (paren === -1) {
            noParen = true;
          } else {
            const label = source.slice(i + 1, closeAt);
            const address = source.slice(closeAt + 2, paren);
            flush();
            if (address.startsWith(HTTPS) && !hasBadChar(address)) out.push({ kind: "link", href: address, text: label });
            else pushText(out, label);
            i = paren + 1;
            continue;
          }
        }
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

// ---- blocks ----

function isSeparator(line: string): boolean {
  // ^\|(-+\|)+$ written as a scan
  if (line.length < 3 || line.charAt(0) !== "|" || line.charAt(line.length - 1) !== "|") return false;
  let dashes = 0;
  for (let k = 1; k < line.length; k += 1) {
    const c = line.charAt(k);
    if (c === "-") dashes += 1;
    else if (c === "|" && dashes > 0) dashes = 0;
    else return false;
  }
  return dashes === 0;
}

function splitRow(line: string): Cell[] {
  const parts: string[] = [];
  let current = "";
  const text = line.trimEnd();
  for (let k = 0; k < text.length; k += 1) {
    const c = text.charAt(k);
    if (c === "\\" && text.charAt(k + 1) === "|") {
      current += "\\|";
      k += 1;
    } else if (c === "|") {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current);
  parts.shift(); // before the first pipe
  const last = parts[parts.length - 1];
  if (last !== undefined && last.trim() === "") parts.pop();
  return parts.map((part) => parseInline(part.trim().split("\\|").join("|"), false));
}

const ORDERED = /^(\d{1,9})\. /;

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function startsBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i] ?? "";
  if (line.startsWith("# ") || line.startsWith("## ") || line.startsWith("- ") || line.startsWith("> ")) return true;
  if (line === "---" || ORDERED.test(line)) return true;
  return line.startsWith("|") && isSeparator((lines[i + 1] ?? "").trimEnd());
}

export function parseMarkdown(source: string): readonly Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line)) {
      i += 1;
    } else if (line.startsWith("# ")) {
      blocks.push({ kind: "heading", level: 1, children: parseInline(line.slice(2), false) });
      i += 1;
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", level: 2, children: parseInline(line.slice(3), false) });
      i += 1;
    } else if (line === "---") {
      blocks.push({ kind: "rule" });
      i += 1;
    } else if (line.startsWith("> ")) {
      const parts: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        parts.push((lines[i] ?? "").slice(2));
        i += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(parts.join("\n"), false) });
    } else if (line.startsWith("- ")) {
      const items: Cell[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("- ")) {
        items.push(parseInline((lines[i] ?? "").slice(2), false));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: false, items });
    } else if (ORDERED.test(line)) {
      const start = Number(ORDERED.exec(line)?.[1] ?? "1");
      const items: Cell[] = [];
      while (i < lines.length) {
        const match = ORDERED.exec(lines[i] ?? "");
        if (match === null) break;
        items.push(parseInline((lines[i] ?? "").slice(match[0].length), false));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: true, start, items });
    } else if (line.startsWith("|") && isSeparator((lines[i + 1] ?? "").trimEnd())) {
      const header = splitRow(line);
      i += 2;
      const rows: Cell[][] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        rows.push(splitRow(lines[i] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
    } else {
      const parts: string[] = [line];
      i += 1;
      while (i < lines.length && !isBlank(lines[i] ?? "") && !startsBlock(lines, i)) {
        parts.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "paragraph", children: parseInline(parts.join("\n"), false) });
    }
  }
  return blocks;
}

// ---- plain text ----

function inlineText(nodes: readonly Inline[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.kind === "bold") text += inlineText(node.children);
    else text += node.text;
  }
  return text;
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "quote":
      return inlineText(block.children);
    case "rule":
      return "";
    case "list":
      return block.items.map(inlineText).join("\n");
    case "table":
      return [block.header, ...block.rows].map((row) => row.map(inlineText).join(" | ")).join("\n");
  }
}

export function plainText(blocks: readonly Block[]): string {
  return blocks.map(blockText).join("\n\n");
}
