// The Guide page (spec clean-site, design C7, requirement 9). This first version holds the breadcrumb, the page's
// heading and its two buttons; its sections, taken from the Claim registry, land with task 7.
export const GUIDE_CRUMB = "What is Sexton?";
export const GUIDE_EYEBROW = "The two-minute guide";
export const GUIDE_HEADLINE = "Sexton looks after the code your app borrows.";
export const GUIDE_LEAD = "A sexton is the person who looks after a churchyard and its graves. This one looks after your dependencies.";

export interface GuidePageProps {
  readonly onHome: () => void;
  readonly onAttack: () => void;
}

export function GuidePage({ onHome, onAttack }: GuidePageProps) {
  return (
    <main className="guide">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="crumb-home" onClick={onHome}>
          ← Cemetery
        </button>
        <span aria-hidden="true">/</span>
        <span className="crumb-here">{GUIDE_CRUMB}</span>
      </nav>
      <p className="eyebrow">{GUIDE_EYEBROW}</p>
      <h1 className="guide-headline">{GUIDE_HEADLINE}</h1>
      <p className="guide-lead">{GUIDE_LEAD}</p>
      <p className="guide-buttons">
        <button type="button" className="button button-primary" onClick={onHome}>
          Go to the cemetery
        </button>
        <button type="button" className="button" onClick={onAttack}>
          Watch a real attack
        </button>
      </p>
    </main>
  );
}
