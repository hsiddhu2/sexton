import { useState, type FormEvent } from "react";
import type { Theme } from "../scene/palette.js";
import { HOSTED_UNAVAILABLE_TEXT } from "../load/use-scan-loader.js";
import type { HeaderModel } from "./header-model.js";
import { Legend } from "./Legend.js";

export interface HeaderProps {
  /** Null while loading or after a load error: only the shell is shown. */
  readonly model: HeaderModel | null;
  readonly theme: Theme;
  readonly apiConfigured: boolean;
  /** Returns fixed text when no request started, or null when one did. */
  readonly onSubmit: (value: string) => string | null;
}

export function Header({ model, theme, apiConfigured, onSubmit }: HeaderProps) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setMessage(onSubmit(value));
  };
  return (
    <header>
      <h1>Sexton cemetery</h1>
      {model === null ? null : (
        <>
          <p className="header-repo">
            <span>{model.repoText}</span>
            {model.demoLabel === null ? null : <span className="demo-label"> {model.demoLabel}</span>}
          </p>
          <p className="header-time">{model.scanTime}</p>
          {model.unlockedNotice === null ? null : <p className="notice notice-unlocked">{model.unlockedNotice}</p>}
          {model.cappedNotice === null ? null : <p className="notice notice-capped">{model.cappedNotice}</p>}
          <p className="header-policy">
            policy: <strong>{model.policyStatus}</strong>, {model.policyLabel}, {String(model.failingRules)} failing
            rules
          </p>
        </>
      )}
      <Legend theme={theme} />
      <form className="repo-form" onSubmit={submit}>
        <label>
          Repository URL
          <input
            type="text"
            name="repo"
            value={value}
            disabled={!apiConfigured}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={!apiConfigured}>
          Scan
        </button>
        {apiConfigured ? null : <span className="repo-disabled">{HOSTED_UNAVAILABLE_TEXT}</span>}
      </form>
      {message === null ? null : <p role="alert">{message}</p>}
    </header>
  );
}
