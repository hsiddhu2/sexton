// The scanning card over the Scene while a Live scan loads (spec clean-site, design C2, requirement 1.14). Three
// fixed lines and no progress bar: the Site cannot measure the steps of one GET. The Scanning line (design C16, 19.8)
// sits under the note, as one more line in the same card.
import { claim } from "../copy/claims.js";
import { SCANNING_LINE } from "../copy/mischief.js";

export const SCANNING_LINES = ["Reading package.json and the lockfile", claim("scanning.sources"), "Reading each headstone"] as const;
export const SCANNING_NOTE = "This usually takes a few seconds.";

export function ScanningCard({ label }: { readonly label: string }) {
  return (
    <div role="status" className="scene-card-overlay scanning">
      <div className="scanning-box">
        <h2 className="scanning-title">Digging through {label}</h2>
        <p className="scanning-note">{SCANNING_NOTE}</p>
        <p className="scanning-mischief">{SCANNING_LINE}</p>
        <ul className="scanning-lines">
          {SCANNING_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
