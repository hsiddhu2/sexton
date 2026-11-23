import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { hasPrPrefix, type RemediateView } from "../load/remediate-client.js";
import type { DrawerModel } from "./drawer-model.js";
import { ScanTime } from "../header/ScanTime.js";
import { trapStep } from "./focus-trap.js";
import { displayValue } from "./format-value.js";
import { PrPreview } from "./PrPreview.js";

export interface DrawerProps {
  readonly model: DrawerModel;
  readonly onClose: () => void;
  /** Present only for a hosted scan with actions.remediate true (spec remediate, Requirement 9.2). */
  readonly onRemediate?: (packageName: string) => Promise<RemediateView>;
  /** A press on the backdrop at (x, y). Returns true when it moved focus to the Repository URL box and closed the drawer. */
  readonly onDismissToField?: (x: number, y: number) => boolean;
}

export const DEMO_ONLY_TEXT = "Pull requests are opened only on the demo repository";
export const OPEN_PR_TEXT = "Open pull request";
export const PR_LINK_TEXT = "View the pull request on GitHub";

function RemediateAction({ packageName, onRemediate }: { readonly packageName: string; readonly onRemediate: DrawerProps["onRemediate"] }) {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<RemediateView | null>(null);
  if (onRemediate === undefined) return <p className="drawer-remediate-note">{DEMO_ONLY_TEXT}</p>;
  const onClick = (): void => {
    if (busy) return;
    setBusy(true);
    setView(null);
    void onRemediate(packageName).then((result) => {
      setView(result);
      setBusy(false);
    });
  };
  // aria-disabled, not disabled: focus stays on the button inside the focus trap while the request runs.
  return (
    <div className="drawer-remediate">
      <button type="button" className="drawer-remediate-button" aria-disabled={busy} onClick={onClick}>
        {OPEN_PR_TEXT}
      </button>
      <p role="status" className="drawer-remediate-status">
        {busy ? "Opening the pull request." : (view?.text ?? "")}
      </p>
      {view !== null && view.prUrl !== null && hasPrPrefix(view.prUrl) ? (
        <p>
          <a href={view.prUrl} target="_blank" rel="noopener noreferrer">
            {PR_LINK_TEXT}
          </a>
        </p>
      ) : null}
    </div>
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !(el as HTMLButtonElement).disabled,
  );
}

function SignalValue({ valueText }: { readonly valueText: string }) {
  const v = displayValue(valueText);
  return v.kind === "block" ? <pre className="signal-value">{v.text}</pre> : <code className="signal-value">{v.text}</code>;
}

export function Drawer({ model, onClose, onRemediate, onDismissToField }: DrawerProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <div className="backdrop" onClick={onBackdropClick} onMouseDown={onBackdropMouseDown}>
      <section
        ref={dialogRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button ref={closeRef} type="button" className="drawer-close" onClick={onClose}>
          Close
        </button>
        <h2 id="drawer-title">{model.title}</h2>
        <div className="drawer-body" role="region" aria-label="Package evidence" tabIndex={0}>
          <p>
            State: <strong>{model.state}</strong>
          </p>
          <p>Reason: {model.stateReason}</p>

          <h3>Signals</h3>
          <ul className="drawer-signals">
            {model.signals.map((s) => (
              <li key={s.name}>
                <h4>{s.name}</h4>
                <p>Source: {s.source}</p>
                <p>
                  Fetched at: <ScanTime iso={s.fetchedAt} />
                </p>
                {s.available && s.valueText !== null ? (
                  <SignalValue valueText={s.valueText} />
                ) : (
                  <p>
                    unavailable: {s.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <h3>Missing signals</h3>
          <ul className="drawer-missing">
            {model.missingSignals.length === 0 ? (
              <li>none</li>
            ) : (
              model.missingSignals.map((name) => <li key={name}>{name}</li>)
            )}
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

          <h3>Remediation preview</h3>
          {model.remediation === null ? (
            <p>no remediation proposed yet</p>
          ) : (
            <div>
              <p>Kind: {model.remediation.kind}</p>
              <p>Title: {model.remediation.title}</p>
              <PrPreview source={model.remediation.prBody} />
            </div>
          )}
        </div>
        {model.remediation !== null && model.remediation.status === "proposed" && model.remediation.intent !== undefined ? (
          <div className="drawer-result">
            <RemediateAction packageName={model.remediation.packageName} onRemediate={onRemediate} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
