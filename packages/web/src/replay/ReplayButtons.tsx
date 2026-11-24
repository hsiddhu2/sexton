import { REPLAY_BUTTON_TEXT, REPLAY_IDS, type ReplayId } from "./replay-ids.js";

/** One button for each replay id. Rendered after the Scan button. Spec cemetery-time, requirement 18.1. */
export function ReplayButtons({ onReplay }: { readonly onReplay: (id: ReplayId) => void }) {
  return (
    <div className="replay-group" role="group" aria-label="Replay">
      {REPLAY_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className="replay-button"
          onClick={() => {
            onReplay(id);
          }}
        >
          {REPLAY_BUTTON_TEXT[id]}
        </button>
      ))}
    </div>
  );
}
