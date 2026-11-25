import { useState, type FormEvent, type RefObject } from "react";
import type { Theme } from "../scene/palette.js";
import { HOSTED_UNAVAILABLE_TEXT } from "../load/use-scan-loader.js";
import type { HeaderModel } from "./header-model.js";
import { failingRulesText } from "./failing-rules-text.js";
import { Legend } from "./Legend.js";
import { ScanTime } from "./ScanTime.js";
import { Wordmark } from "./Wordmark.js";
import { ReplayButtons } from "../replay/ReplayButtons.js";
import type { ReplayId } from "../replay/replay-ids.js";

export const SOUND_NOTE_TEXT = "Sound arrives in the next release";

export interface HeaderProps {
  /** Null while loading or after a load error: only the shell is shown. */
  readonly model: HeaderModel | null;
  readonly theme: Theme;
  readonly apiConfigured: boolean;
  /** Returns fixed text when no request started, or null when one did. */
  readonly onSubmit: (value: string) => string | null;
  /** Lets the page move focus to the Repository URL box (task 7). */
  readonly fieldRef?: RefObject<HTMLInputElement | null>;
  /** Renders the Replay buttons after the Scan button when present. */
  readonly onReplay?: (id: ReplayId) => void;
  /** Set while the As-of date is before the scan date. */
  readonly asOf?: { readonly iso: string; readonly onBack: () => void };
  /** Serious mode toggle (spec cemetery-undead, 8.1). Shown when onSerious is given. */
  readonly serious?: boolean;
  readonly onSerious?: () => void;
  /** A replay labels its two times: "Window ends" and "Showing" (spec cemetery-undead-2, A2). */
  readonly replay?: boolean;
}

function DownloadGlyph() {
  return (
    <svg className="evidence-glyph" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M5 1h2v5h2.5L6 10 2.5 6H5z M2 11h8v1H2z" />
    </svg>
  );
}

export function Header({ model, theme, apiConfigured, onSubmit, fieldRef, asOf, onReplay, serious = false, onSerious, replay = false }: HeaderProps) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setMessage(onSubmit(value));
  };
  return (
    <header className="site-header">
      <div className="header-top">
        <Wordmark />
        <div className="header-summary">
          {model === null ? null : (
            <>
              <p className="header-repo">
                <span className="repo-text">{model.repoText}</span>
                {model.demoLabel === null ? null : <span className="demo-label"> {model.demoLabel}</span>}
              </p>
              <p className="header-time">
                {replay ? "Window ends " : null}
                <ScanTime iso={model.scanTime} />
              </p>
              {asOf === undefined ? null : (
                <p className="header-asof">
                  <span className="as-of">
                    {replay ? "Showing " : "as of "}
                    <ScanTime iso={asOf.iso} />
                  </span>{" "}
                  <button type="button" className="asof-back" onClick={asOf.onBack}>
                    Back to now
                  </button>
                </p>
              )}
              {model.unlockedNotice === null ? null : <p className="notice notice-unlocked">{model.unlockedNotice}</p>}
              {model.cappedNotice === null ? null : <p className="notice notice-capped">{model.cappedNotice}</p>}
              {model.showPolicy ? (
                <p className="header-policy">
                  policy: <strong>{model.policyStatus}</strong>, {model.policyLabel}, {failingRulesText(model.failingRules)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      {model?.evidenceLinks == null ? null : (
        <div className="header-evidence" role="group" aria-label="Evidence pack">
          <a className="evidence-link" href={model.evidenceLinks.json} download aria-label="Download evidence pack as JSON">
            <DownloadGlyph />
            JSON
          </a>
          <a className="evidence-link" href={model.evidenceLinks.markdown} download aria-label="Download evidence pack as Markdown">
            <DownloadGlyph />
            Markdown
          </a>
        </div>
      )}
      <form className="repo-form" onSubmit={submit}>
        <label>
          <span className="repo-label-text">Repository URL</span>
          <input
            ref={fieldRef}
            type="text"
            name="repo"
            placeholder="Paste a public repository URL"
            value={value}
            disabled={!apiConfigured}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        </label>
        <button type="submit" className="scan-button" disabled={!apiConfigured}>
          Scan
        </button>
        {apiConfigured ? null : <span className="repo-disabled">{HOSTED_UNAVAILABLE_TEXT}</span>}
      </form>
      {/* Sound comes in Phase 2: shown, disabled, with its note for assistive technology (spec cemetery-undead, 9.2). */}
      <button type="button" className="sound-toggle" disabled aria-describedby="sound-note">
        <svg className="sound-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M2 6h3l4-3v10l-4-3H2z M11 5l4 6 M15 5l-4 6" />
        </svg>
        Sound off
      </button>
      <span id="sound-note" className="visually-hidden">
        {SOUND_NOTE_TEXT}
      </span>
      {onSerious === undefined ? null : (
        <button type="button" className="serious-toggle" aria-pressed={serious} onClick={onSerious}>
          Serious mode
        </button>
      )}
      <Legend theme={theme} />
      {onReplay === undefined ? null : <ReplayButtons onReplay={onReplay} />}
      {message === null ? null : (
        <p role="alert" className="header-message">
          {message}
        </p>
      )}
    </header>
  );
}
