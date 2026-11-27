// The Home page at "/" (spec home-page, design C3, requirements 2 to 10, 14 and 16): its sections in the order of
// those requirements. Every sentence is a Claim (copy/claims.ts) or a label (copy/home.ts). Each section is a region
// named by its heading. Every link to another site is an OffSiteLink (2.5).
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import type { Entry } from "../cache/scan-cache.js";
import { clearCache, readCache } from "../cache/scan-store.js";
import { claim, type ClaimId } from "../copy/claims.js";
import { GITHUB_URL, L, POWER_URL } from "../copy/home.js";
import { normaliseRepo, REPO_INPUT_HINT } from "../header/repo-input.js";
import { SiteTabs } from "../header/SiteTabs.js";
import { Wordmark } from "../header/Wordmark.js";
import { HOSTED_UNAVAILABLE_TEXT } from "../load/use-scan-loader.js";
import { TRACK } from "../music/track.js";
import type { Navigate } from "../site/Root.js";
import { CEMETERY_PATH, SCAN_PATH } from "../site/route.js";
import { useNarrow } from "../site/use-narrow.js";
import { RecentScans } from "./RecentScans.js";
import { SiteLink } from "./SiteLink.js";
import { DEMO_VIDEO_URL, videoUrl } from "./video.js";
import { OffSiteLink } from "./OffSiteLink.js";
import "./home-page.css";

export interface HomePageProps {
  readonly apiBase: string | null;
  readonly onNavigate: Navigate;
  /** The clock of Recent scans. */
  readonly now?: () => number;
  /** The demo video URL; the constant of home-page/video.ts by default (8.1). */
  readonly video?: string | null;
}

/** How often the ages of Recent scans are read again. */
const AGE_TICK_MS = 30_000;

/** Pure. The address of a Live scan of an owner/name (3.3). */
export function scanAddress(label: string): string {
  return `${SCAN_PATH}?repo=${label}`;
}

const STATE_CARDS: readonly { readonly state: string; readonly id: ClaimId }[] = [
  { state: "Possessed", id: "home.state.Possessed" },
  { state: "Dead", id: "home.state.Dead" },
  { state: "Haunted", id: "state.Haunted" },
  { state: "Restless", id: "home.state.Restless" },
  { state: "Alive", id: "home.state.Alive" },
];

const STEP_CLAIMS: readonly ClaimId[] = ["home.how.1", "home.how.2", "home.how.3", "home.how.4"];

const WHERE: readonly { readonly title: string; readonly id: ClaimId; readonly status: string; readonly tone: "alive" | "accent" }[] = [
  { title: L.where.cemetery, id: "home.where.cemetery", status: L.live, tone: "alive" },
  { title: L.where.cli, id: "home.where.cli", status: L.cliStatus, tone: "accent" },
  { title: L.where.action, id: "home.where.action", status: L.onMain, tone: "alive" },
  { title: L.where.power, id: "home.where.power", status: L.onMain, tone: "alive" },
  { title: L.where.evidence, id: "home.where.evidence", status: L.onMain, tone: "alive" },
];

const KIRO_CARDS: readonly { readonly title: string; readonly id: ClaimId }[] = [
  { title: L.kiroCards.specs, id: "home.kiro.card.specs" },
  { title: L.kiroCards.steering, id: "home.kiro.card.steering" },
  { title: L.kiroCards.hooks, id: "home.kiro.card.hooks" },
  { title: L.kiroCards.agents, id: "home.kiro.card.agents" },
  { title: L.kiroCards.power, id: "home.kiro.card.power" },
];

/** The sections an address can name by its id (2.2). */
export const SECTION_IDS: readonly string[] = ["attacks", "how", "where", "kiro", "roadmap", "open"];

const ROADMAP_CLAIMS: readonly ClaimId[] = ["home.roadmap.0.1", "home.roadmap.0.2", "home.roadmap.0.3", "home.roadmap.1.0"];

export function HomePage({ apiBase, onNavigate, now = Date.now, video = DEMO_VIDEO_URL }: HomePageProps) {
  const [recent, setRecent] = useState<readonly Entry[]>(readCache);
  const [at, setAt] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => {
      setAt(now());
    }, AGE_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [now]);
  // An address ending in a section's id lands on that section (2.2). The page renders after the browser's own
  // fragment scroll, so the scroll is made here once, at mount. The heading's scroll margin keeps it below the bar.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id === "" || !SECTION_IDS.includes(id)) return undefined;
    const land = (): void => {
      document.getElementById(id)?.scrollIntoView();
    };
    land();
    // Fonts and pictures that arrive later can move the section, so it is found again once they are in, unless the
    // visitor has scrolled since.
    let live = true;
    let at = window.scrollY;
    const again = (): void => {
      if (!live || window.scrollY !== at) return;
      land();
      at = window.scrollY;
    };
    void (document.fonts as FontFaceSet | undefined)?.ready.then(again);
    window.addEventListener("load", again, { once: true });
    return () => {
      live = false;
      window.removeEventListener("load", again);
    };
  }, []);
  const toTop = useCallback((): void => {
    try {
      window.history.replaceState(null, "", "/");
    } catch {
      // History refused: the page still scrolls to the top.
    }
    window.scrollTo(0, 0);
  }, []);
  const toCemetery = useCallback((): void => {
    onNavigate(CEMETERY_PATH);
  }, [onNavigate]);
  const scan = useCallback(
    (label: string): void => {
      onNavigate(scanAddress(label), "scan");
    },
    [onNavigate],
  );
  const clear = useCallback((): void => {
    clearCache();
    setRecent([]);
  }, []);
  const shownVideo = videoUrl(video);
  return (
    <div className="hp">
      <header className="site-header">
        <Wordmark onHome={toTop} />
        <SiteTabs current="overview" onOverview={toTop} onCemetery={toCemetery} />
        <div className="header-buttons bar-end">
          <OffSiteLink className="ib" href={GITHUB_URL}>
            {L.github}
          </OffSiteLink>
          <SiteLink className="bar-cta" to={CEMETERY_PATH} onNavigate={onNavigate}>
            {L.tryDemo}
          </SiteLink>
        </div>
      </header>
      <main className="hp-main">
        <section id="top" className="hp-hero" aria-labelledby="hp-title">
          <div className="hp-wrap hp-hero-row">
            <div className="hp-hero-text">
              <p className="hp-eyebrow hp-eyebrow-accent">{L.heroEyebrow}</p>
              <h1 id="hp-title" className="hp-title">
                {claim("home.hero.title")}
              </h1>
              <p className="hp-pitch">{claim("home.hero.pitch")}</p>
              <HomeScan apiConfigured={apiBase !== null} onScan={scan} />
              <RecentScans className="recent hp-recent" entries={recent} now={at} onPick={scan} onClear={clear} />
              <div className="hp-hero-links">
                <SiteLink className="hp-btn hp-btn-line" to={CEMETERY_PATH} onNavigate={onNavigate}>
                  {L.walk}
                </SiteLink>
                <span className="hp-faint">{claim("home.hero.limits")}</span>
              </div>
            </div>
            <figure className="hp-hero-figure">
              <img src="/cemetery.png" alt={L.heroAlt} width={1440} height={900} />
              <figcaption>{claim("home.hero.caption")}</figcaption>
            </figure>
          </div>
        </section>

        <section id="attacks" className="hp-section" aria-labelledby="hp-attacks">
          <div className="hp-wrap">
            <p className="hp-eyebrow hp-eyebrow-possessed">{L.attacksEyebrow}</p>
            <h2 id="hp-attacks">{L.attacksHeading}</h2>
            <p className="hp-lead">{claim("home.attacks.lead")}</p>
            <div className="hp-grid hp-grid-attacks">
              <article className="hp-card hp-attack">
                <img className="hp-attack-art" src="/replay-axios.png" alt={L.axiosAlt} width={1440} height={900} />
                <div className="hp-attack-body">
                  <p className="hp-date">{L.axiosDate}</p>
                  <h3>{claim("home.attacks.axios.title")}</h3>
                  <p className="hp-body">{claim("home.attacks.axios.text")}</p>
                  <SiteLink className="hp-btn hp-btn-line" to={`${CEMETERY_PATH}?replay=axios`} onNavigate={onNavigate}>
                    {L.axiosLink}
                  </SiteLink>
                </div>
              </article>
              <article className="hp-card hp-attack">
                <img className="hp-attack-art" src="/replay-keyv.png" alt={L.keyvAlt} width={1440} height={900} />
                <div className="hp-attack-body">
                  <p className="hp-date">{L.keyvDate}</p>
                  <h3>{claim("home.attacks.keyv.title")}</h3>
                  <p className="hp-body">{claim("home.attacks.keyv.text")}</p>
                  <SiteLink className="hp-btn hp-btn-line" to={`${CEMETERY_PATH}?replay=keyv`} onNavigate={onNavigate}>
                    {L.keyvLink}
                  </SiteLink>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="how" className="hp-section hp-band" aria-labelledby="hp-how">
          <div className="hp-wrap">
            <p className="hp-eyebrow hp-eyebrow-accent">{L.howEyebrow}</p>
            <h2 id="hp-how">{L.howHeading}</h2>
            <ol className="hp-grid hp-grid-steps">
              {L.steps.map((title, i) => (
                <li key={title} className="hp-card hp-step">
                  <p className="hp-step-n" aria-hidden="true">
                    {String(i + 1)}
                  </p>
                  <h3>{title}</h3>
                  <p className="hp-muted">{claim(STEP_CLAIMS[i] as ClaimId)}</p>
                </li>
              ))}
            </ol>
            <h3 className="hp-subheading">{L.statesHeading}</h3>
            <ul className="hp-grid hp-grid-states">
              {STATE_CARDS.map((card) => (
                <li key={card.state} className={`hp-state hp-state-${card.state.toLowerCase()}`}>
                  <p className="hp-state-name">{card.state}</p>
                  <p className="hp-state-text">{claim(card.id)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="where" className="hp-section" aria-labelledby="hp-where">
          <div className="hp-wrap">
            <p className="hp-eyebrow hp-eyebrow-alive">{L.whereEyebrow}</p>
            <h2 id="hp-where">{L.whereHeading}</h2>
            <ul className="hp-grid hp-grid-where">
              {WHERE.map((card) => (
                <li key={card.title} className="hp-card hp-where">
                  <h3>{card.title}</h3>
                  <p className="hp-muted">{claim(card.id)}</p>
                  <span className={`hp-status hp-status-${card.tone}`}>{card.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="kiro" className="hp-section hp-band" aria-labelledby="hp-kiro">
          <div className="hp-wrap hp-kiro-row">
            <div className="hp-kiro-text">
              <p className="hp-eyebrow hp-eyebrow-haunted">{L.kiroEyebrow}</p>
              <h2 id="hp-kiro">{L.kiroHeading}</h2>
              <p className="hp-body">{claim("home.kiro.specs")}</p>
              <p className="hp-body">{claim("home.kiro.gravedigger")}</p>
            </div>
            <ul className="hp-grid hp-grid-kiro">
              {KIRO_CARDS.map((card) => (
                <li key={card.title} className="hp-card hp-kiro-card">
                  <h3>{card.title}</h3>
                  <p className="hp-muted">{claim(card.id)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {shownVideo === null ? null : (
          <section id="video" className="hp-section" aria-labelledby="hp-video">
            <div className="hp-wrap hp-narrow">
              <p className="hp-eyebrow hp-eyebrow-accent">{L.videoEyebrow}</p>
              <h2 id="hp-video">{L.videoHeading}</h2>
              <OffSiteLink className="hp-btn hp-btn-gold" href={shownVideo}>
                {L.videoLink}
              </OffSiteLink>
            </div>
          </section>
        )}

        <section id="roadmap" className="hp-section hp-roadmap" aria-labelledby="hp-roadmap">
          <div className="hp-wrap">
            <p className="hp-eyebrow hp-eyebrow-restless">{L.roadmapEyebrow}</p>
            <h2 id="hp-roadmap">{L.roadmapHeading}</h2>
            <p className="hp-lead">{claim("home.roadmap.lead")}</p>
            <div className="hp-path">
              <div className="hp-path-line" aria-hidden="true" />
              <ol className="hp-grid hp-grid-roadmap">
                {L.roadmap.map((stop, i) => (
                  <li key={stop.version} className={i === 0 ? "hp-stop hp-stop-lit" : "hp-stop"}>
                    <p className="hp-stone">{stop.version}</p>
                    <p className="hp-stop-label">{stop.label}</p>
                    <p className="hp-stop-items">{claim(ROADMAP_CLAIMS[i] as ClaimId)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="open" className="hp-section hp-open" aria-labelledby="hp-open">
          <div className="hp-wrap hp-narrow">
            <h2 id="hp-open">{L.openHeading}</h2>
            <p className="hp-body">{claim("home.open.text")}</p>
            <div className="hp-open-links">
              <OffSiteLink className="hp-btn hp-btn-gold" href={GITHUB_URL}>
                {L.star}
              </OffSiteLink>
              <SiteLink className="hp-btn hp-btn-line" to={CEMETERY_PATH} onNavigate={onNavigate}>
                {L.tryDemo}
              </SiteLink>
              <OffSiteLink className="hp-btn hp-btn-line" href={POWER_URL}>
                {L.installPower}
              </OffSiteLink>
            </div>
          </div>
        </section>
      </main>
      <footer className="hp-footer">
        <div className="hp-wrap hp-footer-row">
          <p>{claim("home.footer.owner")}</p>
          {TRACK === null ? null : (
            <p className="hp-credit">
              {TRACK.footer.map((part, i) =>
                part.href !== null && /^https:\/\/[^\s|]+$/.test(part.href) ? (
                  <OffSiteLink key={i} href={part.href}>
                    {part.text}
                  </OffSiteLink>
                ) : (
                  <Fragment key={i}>{part.text}</Fragment>
                ),
              )}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

interface HomeScanProps {
  readonly apiConfigured: boolean;
  readonly onScan: (label: string) => void;
}

/** The hero's Scan box (3.2 to 3.5). It starts empty on every visit to "/" (12.4). */
function HomeScan({ apiConfigured, onScan }: HomeScanProps) {
  const [value, setValue] = useState("");
  const [refused, setRefused] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!apiConfigured) return;
    const repo = normaliseRepo(value);
    if (!repo.ok) {
      setRefused(true);
      const field = event.currentTarget.elements.namedItem("repo");
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }
    setRefused(false);
    onScan(repo.label);
  };
  const describedBy = !apiConfigured ? "hp-scan-off" : refused ? "hp-scan-hint" : undefined;
  const narrow = useNarrow();
  return (
    <>
      <form className={refused ? "hp-scan hp-scan-refused" : "hp-scan"} onSubmit={submit} noValidate role="search">
        <label htmlFor="hp-repo" className="visually-hidden">
          {L.scanField}
        </label>
        <input
          id="hp-repo"
          name="repo"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={apiConfigured ? (narrow ? L.scanPlaceholderNarrow : L.scanPlaceholder) : ""}
          value={value}
          disabled={!apiConfigured}
          aria-invalid={refused}
          {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
          onChange={(event) => {
            setValue(event.target.value);
            if (refused) setRefused(false);
          }}
        />
        <button type="submit" disabled={!apiConfigured}>
          {L.scanButton}
        </button>
      </form>
      {apiConfigured ? null : (
        <p id="hp-scan-off" className="hp-scan-note">
          {HOSTED_UNAVAILABLE_TEXT}
        </p>
      )}
      {refused ? (
        <p id="hp-scan-hint" role="alert" className="hp-scan-note hp-scan-hint">
          {REPO_INPUT_HINT}
        </p>
      ) : null}
    </>
  );
}
