import { useState, type FormEvent, type RefObject } from "react";
import type { Theme } from "../scene/palette.js";
import { HOSTED_UNAVAILABLE_TEXT } from "../load/use-scan-loader.js";
import type { HeaderModel } from "./header-model.js";
import { failingRulesText } from "./failing-rules-text.js";
import { Legend } from "./Legend.js";
import { ScanTime } from "./ScanTime.js";
import { Wordmark } from "./Wordmark.js";
import type { ReplayInfo } from "@sexton/api";
import { ReplayBanner } from "../replay/ReplayBanner.js";
import { ReplayButtons } from "../replay/ReplayButtons.js";
import type { ReplayId } from "../replay/replay-ids.js";

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
  /** Set while a replay is loaded: the banner shows in the header area. */
  readonly replay?: ReplayInfo;
  /** Set while the As-of date is before the scan date. */
  readonly asOf?: { readonly iso: string; readonly onBack: () => void };
}

function DownloadGlyph() {
  return (
    <svg className="evidence-glyph" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M5 1h2v5h2.5L6 10 2.5 6H5z M2 11h8v1H2z" />
    </svg>
  );
}

export function Header({ model, theme, apiConfigured, onSubmit, fieldRef, asOf, onReplay, replay }: HeaderProps) {
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
                <ScanTime iso={model.scanTime} />
              </p>
              {asOf === undefined ? null : (
                <p className="header-asof">
                  <span className="as-of">
                    as of <ScanTime iso={asOf.iso} />
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
      <Legend theme={theme} />
      <form className="repo-form" onSubmit={submit}>
        <label>
          Repository URL
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
      {onReplay === undefined ? null : <ReplayButtons onReplay={onReplay} />}
      {replay === undefined ? null : <ReplayBanner replay={replay} />}
      {message === null ? null : (
        <p role="alert" className="header-message">
          {message}
        </p>
      )}
    </header>
  );
}
