// The two primary tabs of the shared top bar (spec home-page, requirement 12): "Overview" (the Home page at "/") and
// "Cemetery" (the Cemetery view), right after the wordmark on every page. Each is a real link. A plain primary press
// takes the move it is given, a modified press follows the link. The current page's tab carries aria-current="page"
// and is marked by the text colour and an underline, never the gold accent (spec clean-site, 1.8).
import { homeClick } from "./Wordmark.js";

export const OVERVIEW_TAB = "Overview";
export const CEMETERY_TAB = "Cemetery";
/** The accessible name of the tabs' navigation landmark. */
export const SITE_TABS_NAME = "Site";

export type SiteTab = "overview" | "cemetery";

export interface SiteTabsProps {
  /** The tab of the page on screen. */
  readonly current: SiteTab;
  /** The move of "Overview" on a plain primary press: to the Home page at its top (12.1). */
  readonly onOverview?: () => void;
  /** The move of "Cemetery" on a plain primary press: to "/cemetery", or the Home action inside the Cemetery view. */
  readonly onCemetery?: () => void;
}

export function SiteTabs({ current, onOverview, onCemetery }: SiteTabsProps) {
  const tab = (id: SiteTab, href: string, text: string, onPress: (() => void) | undefined) => (
    <a className="site-tab" href={href} aria-current={current === id ? "page" : undefined} onClick={homeClick(onPress)}>
      {text}
    </a>
  );
  return (
    <nav className="site-tabs" aria-label={SITE_TABS_NAME}>
      {tab("overview", "/", OVERVIEW_TAB, onOverview)}
      {tab("cemetery", "/cemetery", CEMETERY_TAB, onCemetery)}
    </nav>
  );
}
