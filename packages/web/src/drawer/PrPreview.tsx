// Renders the parsed pull request body as React elements. Spec: cemetery-polish, Requirement 8.11, 8.12, 8.14.
// Text is always a React text child. Only the link element carries an href.
import type { ReactElement, ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "./markdown.js";

function inline(nodes: readonly Inline[]): ReactNode[] {
  return nodes.map((node, i): ReactNode => {
    switch (node.kind) {
      case "text":
        return node.text;
      case "code":
        return <code key={i}>{node.text}</code>;
      case "bold":
        return <strong key={i}>{inline(node.children)}</strong>;
      case "link":
        if (!node.href.startsWith("https://")) return node.text; // the parser guarantees it, kept as a second guard
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            {node.text}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, key: number, tableNumber: number): ReactElement {
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? <h4 key={key}>{inline(block.children)}</h4> : <h5 key={key}>{inline(block.children)}</h5>;
    case "paragraph":
      return (
        <p key={key} className="pr-p">
          {inline(block.children)}
        </p>
      );
    case "quote":
      return (
        <blockquote key={key}>
          {inline(block.children)}
        </blockquote>
      );
    case "rule":
      return <hr key={key} />;
    case "list": {
      const items = block.items.map((item, i) => <li key={i}>{inline(item)}</li>);
      return block.ordered ? (
        <ol key={key} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "table":
      return (
        <div key={key} className="pr-table-wrap" role="region" aria-label={`Table ${String(tableNumber)}`} tabIndex={0}>
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function PrPreview({ source }: { readonly source: string }): ReactElement {
  let tables = 0;
  const children = parseMarkdown(source).map((block, i) => {
    if (block.kind === "table") tables += 1;
    return renderBlock(block, i, tables);
  });
  return <div className="pr-preview">{children}</div>;
}
