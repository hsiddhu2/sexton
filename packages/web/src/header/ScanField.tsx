// The Scan field (spec clean-site, design C2, requirements 1.9 to 1.13): a wide field with its Scan button and the
// example list, a Pop-over that opens when the field gains focus.
import { useEffect, useState, type FocusEvent, type FormEvent, type RefObject } from "react";
import { HOSTED_UNAVAILABLE_TEXT } from "../load/use-scan-loader.js";
import { EXAMPLES, EXAMPLES_HEADING } from "./examples.js";
import { SearchGlyph } from "./icons.js";
import { normaliseRepo, REPO_INPUT_HINT } from "./repo-input.js";

export const SCAN_PLACEHOLDER = "Scan a GitHub repo, for example  facebook/react";
export const SCAN_FIELD_NAME = "GitHub repository to scan";
/** The Scan button's name while a repository from the address waits for a press (10.11, 10.18). */
export const SCAN_PROMPT_TEXT = "Scan this repository";

export interface ScanFieldProps {
  readonly apiConfigured: boolean;
  readonly fieldRef?: RefObject<HTMLInputElement | null>;
  /** A repository from the address that waits for a press: it fills the field (10.11). */
  readonly prompt?: string | null;
  readonly examplesOpen: boolean;
  readonly onExamples: (open: boolean) => void;
  /** Starts a Live scan of the canonical repository URL. */
  readonly onScan: (url: string) => void;
}

export function ScanField({ apiConfigured, fieldRef, prompt = null, examplesOpen, onExamples, onScan }: ScanFieldProps) {
  const [value, setValue] = useState(prompt ?? "");
  useEffect(() => {
    if (prompt !== null) setValue(prompt);
  }, [prompt]);
  // The button reads "Scan this repository" while the field still holds the waiting repository.
  const prompting = prompt !== null && value === prompt;
  const [refused, setRefused] = useState(false);
  const scan = (input: string): boolean => {
    const repo = normaliseRepo(input);
    if (!repo.ok) {
      setRefused(true);
      return false;
    }
    setRefused(false);
    onScan(repo.url);
    return true;
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!apiConfigured) return;
    // A refused input keeps focus in the field and sends no request (1.12).
    if (!scan(value)) fieldRef?.current?.focus();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (examplesOpen) onExamples(false);
  };
  const describedBy = !apiConfigured ? "scan-off" : refused ? "scan-hint" : undefined;
  return (
    <div className="scan-wrap" data-popover="examples" data-tour="scan" onBlur={onBlur}>
      <form className={refused ? "scan-form scan-refused" : "scan-form"} onSubmit={submit} noValidate role="search">
        <SearchGlyph />
        <input
          ref={fieldRef}
          type="text"
          name="repo"
          autoComplete="off"
          spellCheck={false}
          placeholder={SCAN_PLACEHOLDER}
          aria-label={SCAN_FIELD_NAME}
          aria-invalid={refused}
          {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
          value={value}
          disabled={!apiConfigured}
          onFocus={() => {
            onExamples(true);
          }}
          onChange={(event) => {
            setValue(event.target.value);
            if (refused) setRefused(false);
          }}
        />
        <button type="submit" className="scan-button" disabled={!apiConfigured}>
          {prompting ? SCAN_PROMPT_TEXT : "Scan"}
        </button>
      </form>
      {apiConfigured ? null : (
        <p id="scan-off" className="scan-note">
          {HOSTED_UNAVAILABLE_TEXT}
        </p>
      )}
      {refused ? (
        <p id="scan-hint" role="alert" className="scan-note scan-hint">
          {REPO_INPUT_HINT}
        </p>
      ) : null}
      {examplesOpen && apiConfigured ? (
        <div className="examples pop">
          <p className="pop-heading">{EXAMPLES_HEADING}</p>
          {EXAMPLES.map((example) => (
            <button
              key={example.repo}
              type="button"
              className="example"
              onClick={() => {
                setValue(example.repo);
                scan(example.repo);
              }}
            >
              <span className="example-repo">{example.repo}</span>
              <span className={example.good ? "example-note example-good" : "example-note"}>{example.note}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
