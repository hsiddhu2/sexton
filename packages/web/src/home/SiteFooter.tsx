// The site footer (spec clean-site, design C15, requirement 16.12): the scan time in a time element, the policy line
// as main writes it, the evidence links where main offers them, and the track credit slot.
import type { HeaderModel } from "../header/header-model.js";
import { failingRulesText } from "../header/failing-rules-text.js";
import { ScanTime } from "../header/ScanTime.js";

export const EVIDENCE_JSON_TEXT = "Evidence JSON";
export const EVIDENCE_MARKDOWN_TEXT = "Evidence Markdown";

export function SiteFooter({ model }: { readonly model: HeaderModel }) {
  return (
    <footer className="site-footer">
      <p className="site-footer-line">
        <span>
          Scanned <ScanTime iso={model.scanTime} />
        </span>
        {model.showPolicy ? (
          <span className="footer-policy">
            policy: <strong>{model.policyStatus}</strong>, {model.policyLabel}, {failingRulesText(model.failingRules)}
          </span>
        ) : null}
        {model.evidenceLinks === null ? null : (
          <>
            <a className="evidence-link" href={model.evidenceLinks.json} download>
              {EVIDENCE_JSON_TEXT}
            </a>
            <a className="evidence-link" href={model.evidenceLinks.markdown} download>
              {EVIDENCE_MARKDOWN_TEXT}
            </a>
          </>
        )}
        {/* The track credit shows here once a track is set in the Track slot (14.6, task 10). */}
      </p>
    </footer>
  );
}
