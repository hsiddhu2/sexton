// The Welcome bar (spec clean-site, design C7, requirements 9.5 to 9.9 and 9.11): in the page flow under the header,
// so it covers nothing.
import { CloseGlyph } from "../header/icons.js";

export const WELCOME_LEAD = "New here?";
export const WELCOME_TEXT = "Read the two-minute guide first. It explains what Sexton is and what the graves mean.";
export const READ_GUIDE_TEXT = "Read the guide";

export interface WelcomeBarProps {
  readonly onGuide: () => void;
  readonly onClose: () => void;
}

export function WelcomeBar({ onGuide, onClose }: WelcomeBarProps) {
  return (
    <div className="welcome" role="region" aria-label="Welcome">
      <p className="welcome-text">
        <b>{WELCOME_LEAD}</b> {WELCOME_TEXT}
      </p>
      <button type="button" className="button button-primary" onClick={onGuide}>
        {READ_GUIDE_TEXT}
      </button>
      <button type="button" className="icon-button" aria-label="Close the welcome bar" onClick={onClose}>
        <CloseGlyph />
      </button>
    </div>
  );
}
