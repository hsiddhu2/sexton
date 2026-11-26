// The Replay as a story (spec clean-site, design C6, requirement 8). It takes the screen in place of Home while the
// screen state's View owner is "replay": the breadcrumb, headline and sub-line; the stage, which is the Scene in
// replay mode with the date badge of the Step time and the Burst; the Step panel with Back and "Next step"; the Why
// card; and the Footer bar with Play all, the Step cards and Exit replay. The Replay never moves by itself (8.3).
import type { ReplayInfo, ScanResponse } from "@sexton/api";
import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";
import { Cemetery } from "../Cemetery.js";
import { LoadingCard } from "../LoadingCard.js";
import type { Term } from "../glossary/glossary.js";
import { TermText } from "../glossary/TermText.js";
import { useReserve } from "../home/use-reserve.js";
import type { LoadState } from "../load/use-scan-loader.js";
import type { Theme } from "../scene/layout.js";
import { overlayRects } from "../scene/overlay-band.js";
import { usePlay } from "../time/use-play.js";
import { REPLAY_CARD, type ReplayId } from "./replay-ids.js";
import {
  BACK_TO_CEMETERY,
  EXIT_REPLAY,
  NEXT_STEP,
  PLAY_ALL,
  REPLAY_NOT_LIVE,
  WHY_HEADING,
  isSafeSourceUrl,
  stepBadge,
  storySteps,
  type StoryStep,
} from "./replay-story.js";

export interface ReplayViewProps {
  readonly id: ReplayId;
  readonly load: LoadState;
  readonly theme: Theme;
  readonly reducedMotion: boolean;
  readonly repoFieldRef: RefObject<HTMLInputElement | null>;
  /** The Home action (8.6, 8.18): "← Cemetery", "Back to the cemetery" and "Exit replay". */
  readonly onHome: () => void;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
}

const noop = (): void => undefined;
/** A loaded file of this Replay whose Steps do not match its Stops: never a waiting card that waits for ever. */
export const STORY_MISSING = "This replay file has no story for its steps.";

export function ReplayView({ id, load, onHome, ...rest }: ReplayViewProps) {
  const card = REPLAY_CARD[id];
  // The file of this Replay once it has loaded; until then (or for a file of the other Replay) the waiting card.
  const ready = load.status === "ready" && load.response.replay?.id === id ? load : null;
  const steps = useMemo(() => (ready === null ? null : storySteps(ready.response)), [ready]);
  const hero = (
    <div className="hero">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="crumb-home" onClick={onHome}>
          ← Cemetery
        </button>
        <span aria-hidden="true">/</span>
        <span>Real attacks</span>
        <span aria-hidden="true">/</span>
        <span className="crumb-here">{card.package}</span>
      </nav>
      <h1 className="headline">Watch the {card.package} attack unfold</h1>
      <p className="hero-line">{card.date}. A real attack on one package, step by step. Watch the grave change.</p>
    </div>
  );
  if (ready !== null && steps !== null) {
    return <Story key={ready.loadId} hero={hero} response={ready.response} loadId={ready.loadId} steps={steps} onHome={onHome} {...rest} />;
  }
  return (
    <div className="home replay-view">
      <section className="home-left">
        {hero}
        <div className="scene-card scene-card-waiting">
          {load.status === "error" || ready !== null ? (
            <section role="alert" className="load-error">
              <h2>Scan could not be loaded</h2>
              {load.status === "error" ? (
                <p>
                  <code>{load.error.code}</code>: {load.error.message}
                </p>
              ) : (
                <p>{STORY_MISSING}</p>
              )}
            </section>
          ) : (
            <LoadingCard />
          )}
        </div>
      </section>
    </div>
  );
}

interface StoryProps extends Omit<ReplayViewProps, "id" | "load"> {
  readonly hero: ReactNode;
  readonly response: ScanResponse;
  readonly loadId: number;
  readonly steps: readonly StoryStep[];
}

/** The page of a loaded Replay: the hero, the stage and the Footer bar on the left, the Panel on the right. */
function Story({ hero, response, loadId, steps, theme, reducedMotion, repoFieldRef, onHome, onTerm }: StoryProps) {
  const stops = useMemo(() => steps.map((s) => s.ms), [steps]);
  // The Play model opens a Replay at Step 1 and moves only on a press (8.2, 8.3, 8.9 to 8.11).
  const player = usePlay(stops, loadId, true);
  const reserve = useReserve(loadId);
  const index = Math.min(player.index, steps.length - 1);
  const step = steps[index];
  if (step === undefined) return null;
  const last = index === steps.length - 1;
  const tone = step.state === null ? "pending" : step.state.toLowerCase();
  const termProp = onTerm !== undefined ? { onTerm } : {};
  return (
    <div className="home replay-view">
      <section className="home-left">
        {hero}
        <div className="scene-card replay-stage">
          <p className="date-badge" style={{ top: overlayRects(0).badge.y }}>
            {step.time}
          </p>
          {/* The grave opens nothing on a Replay (8.19): the open request is a no-op and no Drawer is kept. */}
          <Cemetery
            response={response}
            theme={theme}
            reducedMotion={reducedMotion}
            asOfMs={step.ms}
            repoFieldRef={repoFieldRef}
            reserve={reserve}
            open={null}
            onOpen={noop}
            onClose={noop}
          />
        </div>
        <footer className="night-footer foot-bar replay-foot">
          <button type="button" className="button" onClick={player.playing ? player.pause : player.play}>
            {player.playing ? "Pause" : PLAY_ALL}
          </button>
          <ol className="step-cards" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s.ms}>
                <button
                  type="button"
                  className={`step-card step-card-${s.state === null ? "pending" : s.state.toLowerCase()}`}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => {
                    player.seek(i);
                  }}
                >
                  <span className="step-card-number">Step {i + 1}</span>
                  <b className="step-card-title">{s.title}</b>
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="button" onClick={onHome}>
            {EXIT_REPLAY}
          </button>
          <p className="visually-hidden" aria-live="polite">
            {player.announce}
          </p>
        </footer>
      </section>
      <aside className="panel replay-panel" aria-label="Details">
        <section className="card step-panel" aria-labelledby="step-heading">
          <h2 id="step-heading" className="eyebrow">
            <span>
              Step {index + 1} of {steps.length}
            </span>
            <span className="eyebrow-time">{step.time}</span>
          </h2>
          <p className="step-title">{step.title}</p>
          <p className="inspector-badge">
            <span className={`badge badge-${tone}`}>
              <span className="badge-dot" aria-hidden="true" />
              {stepBadge(step)}
            </span>
          </p>
          <h3 className="eyebrow step-label">What happened</h3>
          <p className="step-text">
            <TermText text={step.happened} {...termProp} />
          </p>
          <h3 className="eyebrow step-label">What Sexton shows</h3>
          <p className="step-text">
            <TermText text={step.shows} {...termProp} />
          </p>
          <div className="step-buttons">
            <button
              type="button"
              className="button"
              disabled={index === 0}
              onClick={() => {
                player.seek(index - 1);
              }}
            >
              Back
            </button>
            {last ? (
              <button type="button" className="button button-primary step-next" onClick={onHome}>
                {BACK_TO_CEMETERY}
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary step-next"
                onClick={() => {
                  player.seek(index + 1);
                }}
              >
                {NEXT_STEP}
              </button>
            )}
          </div>
        </section>
        {response.replay === undefined ? null : <WhyCard replay={response.replay} {...termProp} />}
      </aside>
    </div>
  );
}

export interface WhyCardProps {
  readonly replay: ReplayInfo;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
}

/** The card "Why attackers do this" (8.12): the why text, the sources as links only for https, and the one not-live line. */
export function WhyCard({ replay, onTerm }: WhyCardProps) {
  return (
    <section className="card why-card" aria-labelledby="why-heading">
      <h2 id="why-heading" className="eyebrow">
        {WHY_HEADING}
      </h2>
      <p className="why-text">
        <TermText text={replay.why} {...(onTerm !== undefined ? { onTerm } : {})} />
      </p>
      <h3 className="eyebrow step-label">Sources</h3>
      <ul className="replay-sources">
        {replay.sources.map((source, i) => (
          <li key={i}>
            {isSafeSourceUrl(source.url) ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.label}
              </a>
            ) : (
              source.label
            )}
          </li>
        ))}
      </ul>
      <p className="replay-not-live">{REPLAY_NOT_LIVE}</p>
    </section>
  );
}
