import { REPLAY_BUTTON_TEXT, REPLAY_GROUP_LABEL, REPLAY_IDS, type ReplayId } from "./replay-ids.js";

/** One button for each replay id, after a visible group label. Rendered after the Scan button. Spec cemetery-time, 18.1, and cemetery-time-fixes, 8. */
export function ReplayButtons({ onReplay }: { readonly onReplay: (id: ReplayId) => void }) {
  return (
    <div className="replay-group" role="group" aria-labelledby="replay-label">
      <span id="replay-label" className="replay-label">
        {REPLAY_GROUP_LABEL}
      </span>
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
