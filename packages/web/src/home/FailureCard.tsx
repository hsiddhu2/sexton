// A failure card over the Scene (spec clean-site, design C10, requirements 12.1 and 12.7): one sentence, one next
// step and its buttons. The sentence and next step come from the fixed card table of load/scan-failure.ts, never from
// an error body (12.4).
export const TRY_DEMO_REPO = "Try the demo repo";
export const BACK_TO_SAMPLE = "Back to the sample";
export const TRY_AGAIN = "Try again";

export interface FailureAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface FailureCardProps {
  readonly sentence: string;
  readonly next: string;
  readonly actions: readonly FailureAction[];
}

export function FailureCard({ sentence, next, actions }: FailureCardProps) {
  return (
    <div className="scene-card-overlay">
      <section role="alert" className="failure-card">
        <span className="failure-mark" aria-hidden="true">
          !
        </span>
        <h2 className="failure-sentence">{sentence}</h2>
        <p className="failure-next">{next}</p>
        <p className="failure-buttons">
          {actions.map((action, i) => (
            <button key={action.label} type="button" className={i === 0 ? "button button-primary" : "button"} onClick={action.onPress}>
              {action.label}
            </button>
          ))}
        </p>
      </section>
    </div>
  );
}
