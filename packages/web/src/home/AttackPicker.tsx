// "Watch a real attack" and its Pop-over (spec clean-site, requirements 16.7 and 16.16): one line on what these are
// and one button per Replay with its package, date and number of Steps.
import { PlayGlyph } from "../header/icons.js";
import { REPLAY_CARD, REPLAY_IDS, type ReplayId } from "../replay/replay-ids.js";

export const WATCH_ATTACK_TEXT = "Watch a real attack";
export const ATTACKS_HEADING = "Two real npm attacks from 2026";
export const ATTACKS_LINE =
  "A trusted package was taken over and a bad version was published. See how each one would have looked in your cemetery.";

export interface AttackPickerProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onReplay: (id: ReplayId) => void;
}

export function AttackPicker({ open, onToggle, onReplay }: AttackPickerProps) {
  return (
    <div className="attack-picker" data-popover="attacks">
      <button type="button" className="button" aria-expanded={open} aria-controls="attack-pop" onClick={onToggle}>
        <PlayGlyph />
        {WATCH_ATTACK_TEXT}
      </button>
      {open ? (
        <div id="attack-pop" className="pop pop-up">
          <p className="pop-heading">{ATTACKS_HEADING}</p>
          <p className="pop-line">{ATTACKS_LINE}</p>
          {REPLAY_IDS.map((id) => {
            const card = REPLAY_CARD[id];
            return (
              <button
                key={id}
                type="button"
                className="attack"
                onClick={() => {
                  onReplay(id);
                }}
              >
                <b>{card.package}</b>
                <span>
                  {card.date}. {card.steps} steps.
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
