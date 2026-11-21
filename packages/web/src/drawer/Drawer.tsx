import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { DrawerModel } from "./drawer-model.js";
import { trapStep } from "./focus-trap.js";

export interface DrawerProps {
  readonly model: DrawerModel;
  readonly onClose: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !(el as HTMLButtonElement).disabled,
  );
}

export function Drawer({ model, onClose }: DrawerProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onClose();
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
    <div className="backdrop" onClick={onBackdropClick}>
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
                <p>Fetched at: {s.fetchedAt}</p>
                {s.available ? (
                  <pre>{s.valueText}</pre>
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
                        <p>Fetched at: {f.fetchedAt}</p>
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
              <pre className="drawer-prbody">{model.remediation.prBody}</pre>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
