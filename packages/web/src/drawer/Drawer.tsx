// The Drawer (spec clean-site, design C5, requirement 7): one sheet that slides in from the right with the breadcrumb
// "← Cemetery / <name>", the name, version and State badge, the scan date, the tabs Evidence, The fix and History, and
// one close button. Focus moves to the close button and stays inside; a press on the scrim closes it. The tab is the
// Drawer's own state, so it never touches the address (10.16).
import type { ReplayInfo } from "@sexton/api";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Term } from "../glossary/glossary.js";
import { TermText } from "../glossary/TermText.js";
import { ScanTime } from "../header/ScanTime.js";
import { hasPrPrefix, type RemediateView } from "../load/remediate-client.js";
import { reasonSentence } from "../panel/reason-family.js";
import { ReplayBanner } from "../replay/ReplayBanner.js";
import { copyText, type CopyResult } from "./clipboard.js";
import type { DrawerModel, SignalRow } from "./drawer-model.js";
import {
  COPIED_TEXT,
  COPY_BLOCKED_TEXT,
  COPY_ISSUE_TEXT,
  COPY_PR_TEXT,
  HOW_LINK_TEXT,
  OPEN_PR_TEXT,
  READ_PR_TEXT,
  type FixView,
} from "./fix-view.js";
import { trapStep } from "./focus-trap.js";
import { displayValue } from "./format-value.js";
import { NO_HISTORY_TEXT, type HistoryRow } from "./history-rows.js";
import { issueText } from "./issue-text.js";
import { PrPreview } from "./PrPreview.js";
import { SIGNAL_LABELS } from "./signal-labels.js";

export { OPEN_PR_TEXT } from "./fix-view.js";
export const PR_LINK_TEXT = "View the pull request on GitHub";
export const CEMETERY_CRUMB = "← Cemetery";
export const EVIDENCE_NOTE = "Every signal carries its source and the time it was fetched.";

export type DrawerTab = "evidence" | "fix" | "history";
export const DRAWER_TABS: readonly { readonly id: DrawerTab; readonly label: string }[] = [
  { id: "evidence", label: "Evidence" },
  { id: "fix", label: "The fix" },
  { id: "history", label: "History" },
];

export interface DrawerProps {
  readonly model: DrawerModel;
  /** The fix tab (7.3 to 7.16, 7.26, 7.27). */
  readonly fix: FixView;
  /** The History tab's rows, or null for "No history for this scan." (7.17, 7.18). */
  readonly history: readonly HistoryRow[] | null;
  /** One line "State on <date>: <State>. <reason>" for a versioned Segment (spec cemetery-time, 12.9). */
  readonly asOfLine?: string;
  /** Set for a replay: the banner shows at the top of the Evidence tab (spec cemetery-time, 19.1). */
  readonly replay?: ReplayInfo;
  readonly onClose: () => void;
  /** Present only for a hosted scan with actions.remediate true (spec remediate, Requirement 9.2). */
  readonly onRemediate?: (packageName: string) => Promise<RemediateView>;
  /** A press on the scrim at (x, y). Returns true when it moved focus to the Scan field and closed the drawer. */
  readonly onDismissToField?: (x: number, y: number) => boolean;
  /** Opens a Term's meaning (11.4). */
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
  /** Opens the Guide page from "How does this work?" (7.13 to 7.15); absent, the link is not shown. */
  readonly onGuide?: () => void;
  /** True while a Pop-over is open: Escape then closes the Pop-over first and leaves the Drawer open (10.3). */
  readonly popoverOpen?: boolean;
}

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** The Tab stops inside the Drawer: no disabled control, no roving tab out of turn, nothing inside a closed disclosure. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.tabIndex < 0) return false;
    const closed = el.closest("details:not([open])");
    return closed === null || (el.tagName === "SUMMARY" && el.parentElement === closed);
  });
}

const labelOf = (name: string): string => (Object.hasOwn(SIGNAL_LABELS, name) ? SIGNAL_LABELS[name as keyof typeof SIGNAL_LABELS] : name);

function SignalValue({ valueText }: { readonly valueText: string }) {
  const v = displayValue(valueText);
  return v.kind === "block" ? <pre className="signal-value">{v.text}</pre> : <code className="signal-value">{v.text}</code>;
}

/** A source is a link only for an https:// address, shown by its host; anything else is plain text. */
function SourceCell({ source }: { readonly source: string }) {
  if (!source.startsWith("https://")) return <>{source}</>;
  let host: string;
  try {
    host = new URL(source).host;
  } catch {
    return <>{source}</>;
  }
  return (
    <a href={source} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      {host}
    </a>
  );
}

type TermProp = { readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void };
const termProp = (onTerm: DrawerProps["onTerm"]): TermProp => (onTerm !== undefined ? { onTerm } : {});

function SignalCells({ signal, onTerm }: { readonly signal: SignalRow } & TermProp) {
  return (
    <tr>
      <td className="drawer-signal-label">
        <TermText text={labelOf(signal.name)} {...termProp(onTerm)} />
      </td>
      <td>{signal.available && signal.valueText !== null ? <SignalValue valueText={signal.valueText} /> : <span>unavailable: {signal.reason}</span>}</td>
      <td>
        <SourceCell source={signal.source} />
      </td>
      <td>
        <ScanTime iso={signal.fetchedAt} />
      </td>
    </tr>
  );
}

function EvidenceTab({ model, replay, onTerm }: { readonly model: DrawerModel; readonly replay: ReplayInfo | undefined } & TermProp) {
  return (
    <>
      {replay === undefined ? null : <ReplayBanner replay={replay} />}
      <div className={`verdict verdict-${model.state.toLowerCase()}`}>
        <b>{model.state}.</b> <TermText text={reasonSentence(model.stateReason)} {...termProp(onTerm)} />
      </div>
      <h3>Signals and where they came from</h3>
      <div className="drawer-table-wrap">
        <table className="drawer-signals">
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Value</th>
              <th scope="col">Source</th>
              <th scope="col">Fetched</th>
            </tr>
          </thead>
          <tbody>
            {model.signals.map((s) => (
              <SignalCells key={s.name} signal={s} {...termProp(onTerm)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="drawer-note">{EVIDENCE_NOTE}</p>
      <h3>Missing signals</h3>
      <ul className="drawer-missing">
        {model.missingSignals.length === 0 ? <li>none</li> : model.missingSignals.map((name) => <li key={name}>{labelOf(name)}</li>)}
      </ul>
      <h3>Failing policy rules</h3>
      {model.failingRules.length === 0 ? (
        <p>no failing policy rules for this package</p>
      ) : (
        <ul className="drawer-rules">
          {model.failingRules.map((rule) => (
            <li key={rule.index} data-rule-index={rule.index}>
              <p>
                Rule {rule.index}: {rule.type}
                {rule.name === null ? "" : ` (${rule.name})`}
              </p>
              <ul>
                {rule.failures.map((f, i) => (
                  <li key={i}>
                    <p>Reason: {f.reason}</p>
                    <p>Source: {f.source}</p>
                    <p>
                      Fetched at: <ScanTime iso={f.fetchedAt} />
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FixTab({ fix, onTerm }: { readonly fix: FixView } & TermProp) {
  return (
    <>
      <h3>Proposed change</h3>
      <div className="fix-box">
        {fix.title === null ? null : <b>{fix.title}</b>}
        {fix.summary === null ? null : (
          <p>
            <TermText text={fix.summary} {...termProp(onTerm)} />
          </p>
        )}
      </div>
      {fix.diff.length === 0 ? null : (
        <>
          <h3>package.json</h3>
          <div className="diff" role="group" aria-label="package.json change">
            <div className="diff-file">package.json</div>
            {fix.diff.map((line, i) => (
              <div key={i} className={line.sign === "+" ? "diff-add" : "diff-remove"}>
                <span aria-hidden="true">{line.sign} </span>
                <span className="visually-hidden">{line.sign === "+" ? "Added: " : "Removed: "}</span>
                {line.text}
              </div>
            ))}
          </div>
        </>
      )}
      {fix.prBody === null ? null : (
        <details className="pr-disclosure">
          <summary>{READ_PR_TEXT}</summary>
          <PrPreview source={fix.prBody} />
        </details>
      )}
    </>
  );
}

function HistoryTab({ rows, onTerm }: { readonly rows: readonly HistoryRow[] | null } & TermProp) {
  if (rows === null) return <p>{NO_HISTORY_TEXT}</p>;
  return (
    <>
      <h3>How this grave changed</h3>
      <ol className="history">
        {rows.map((row) => (
          <li key={row.from} className={`history-${(row.state ?? "pending").toLowerCase()}`}>
            <time dateTime={row.from}>{row.date}</time>
            <b>{row.state ?? "Not published"}</b>
            <span>
              <TermText text={row.reason} {...termProp(onTerm)} />
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

export function Drawer({ model, fix, history, asOfLine, replay, onClose, onRemediate, onDismissToField, onTerm, onGuide, popoverOpen = false }: DrawerProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState<DrawerTab>("evidence");
  // The outcome of opening a pull request and of a copy outlive a tab switch.
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemediateView | null>(null);
  const [copied, setCopied] = useState<CopyResult | null>(null);

  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };
  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || onDismissToField === undefined) return;
    if (onDismissToField(event.clientX, event.clientY)) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      // A Pop-over over the Drawer closes first: the page's Escape takes it (10.3).
      if (popoverOpen) return;
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    event.preventDefault();
    const list = focusables(dialog);
    const next = trapStep(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
    (next === -1 ? dialog : list[next])?.focus();
  };
  // Left and Right, Home and End move between the tabs and show the one they reach.
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = DRAWER_TABS.findIndex((t) => t.id === tab);
    const last = DRAWER_TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (at + 1) % DRAWER_TABS.length : event.key === "ArrowLeft" ? (at - 1 + DRAWER_TABS.length) % DRAWER_TABS.length : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    const target = DRAWER_TABS[next];
    if (target === undefined) return;
    event.preventDefault();
    setTab(target.id);
    tabRefs.current[next]?.focus();
  };

  const packageName = model.name;
  const openPr = fix.openPr && onRemediate !== undefined;
  const remediate = (): void => {
    if (busy || onRemediate === undefined) return;
    setBusy(true);
    setResult(null);
    void onRemediate(packageName).then((view) => {
      setResult(view);
      setBusy(false);
    });
  };
  const copy = (): void => {
    const text = fix.copy === "pr" ? (model.remediation?.prBody ?? "") : issueText(model, model.name, model.version, model.remediation);
    void copyText(text).then(setCopied);
  };

  return (
    <div className="backdrop" onClick={onBackdropClick} onMouseDown={onBackdropMouseDown}>
      <section ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <div className="drawer-head-text">
              <nav className="crumbs" aria-label="Breadcrumb">
                <button type="button" className="crumb-home" onClick={onClose}>
                  {CEMETERY_CRUMB}
                </button>
                <span aria-hidden="true">/</span>
                <b>{model.name}</b>
              </nav>
              <h2 id="drawer-title">
                {model.name} <span className="drawer-version">{model.version}</span>
              </h2>
              <p className="drawer-badge">
                <span className={`badge badge-${model.state.toLowerCase()}`}>
                  <span className="badge-dot" aria-hidden="true" />
                  {model.state}
                </span>
              </p>
              <p className="drawer-scan-date">
                Scan of <ScanTime iso={model.scanDate} />
              </p>
              {asOfLine === undefined ? null : <p className="drawer-asof">{asOfLine}</p>}
            </div>
            <button ref={closeRef} type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="tabs" role="tablist" aria-label="Package details" onKeyDown={onTabKey}>
            {DRAWER_TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`drawer-tab-${t.id}`}
                className="tab"
                aria-selected={tab === t.id}
                aria-controls="drawer-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => {
                  setTab(t.id);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div id="drawer-panel" className="drawer-body" role="tabpanel" aria-labelledby={`drawer-tab-${tab}`} tabIndex={0}>
          {tab === "evidence" ? (
            <EvidenceTab model={model} replay={replay} {...termProp(onTerm)} />
          ) : tab === "fix" ? (
            <FixTab fix={fix} {...termProp(onTerm)} />
          ) : (
            <HistoryTab rows={history} {...termProp(onTerm)} />
          )}
        </div>
        {tab === "fix" && (openPr || fix.copy !== null || fix.note !== null) ? (
          <div className="drawer-result">
            {openPr || fix.copy !== null ? (
              <div className="drawer-actions">
                {/* aria-disabled, not disabled: focus stays on the button inside the focus trap while the request runs. */}
                {openPr ? (
                  <button type="button" className="drawer-remediate-button" aria-disabled={busy} onClick={remediate}>
                    {OPEN_PR_TEXT}
                  </button>
                ) : null}
                {fix.copy === null ? null : (
                  <button type="button" className="button" onClick={copy}>
                    {fix.copy === "pr" ? COPY_PR_TEXT : COPY_ISSUE_TEXT}
                  </button>
                )}
              </div>
            ) : null}
            {openPr ? (
              <p role="status" className="drawer-remediate-status">
                {busy ? "Opening the pull request." : (result?.text ?? "")}
              </p>
            ) : null}
            {result !== null && result.prUrl !== null && hasPrPrefix(result.prUrl) ? (
              <p>
                <a href={result.prUrl} target="_blank" rel="noopener noreferrer">
                  {PR_LINK_TEXT}
                </a>
              </p>
            ) : null}
            {fix.copy === null ? null : (
              <p className="drawer-copy-status" aria-live="polite">
                {copied === "ok" ? COPIED_TEXT : copied === "blocked" ? COPY_BLOCKED_TEXT : ""}
              </p>
            )}
            {fix.note === null ? null : (
              <p className="drawer-note">
                <TermText text={fix.note} {...termProp(onTerm)} />
                {fix.howLink && onGuide !== undefined ? (
                  <>
                    {" "}
                    <button type="button" className="link-button" onClick={onGuide}>
                      {HOW_LINK_TEXT}
                    </button>
                  </>
                ) : null}
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
