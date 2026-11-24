import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cemetery } from "./Cemetery.js";
import { LoadingCard } from "./LoadingCard.js";
import { Header } from "./header/Header.js";
import { headerModel } from "./header/header-model.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
import { requestRemediation, type RemediateView } from "./load/remediate-client.js";
import { useScanLoader } from "./load/use-scan-loader.js";
import { replayAddress, type ReplayId } from "./replay/replay-ids.js";
import { applyPalette, type Theme } from "./scene/palette.js";
import { Scrubber } from "./time/Scrubber.js";
import { stopsFor } from "./time/stops.js";

export interface AppProps {
  readonly fetchFn: typeof fetch;
  readonly apiBase: string | null;
  readonly initialSearch: string;
  readonly pageOrigin: string;
}

export function App({ fetchFn, apiBase, initialSearch, pageOrigin }: AppProps) {
  const loader = useScanLoader({ fetchFn, pageOrigin, apiBase, initialSearch });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const theme: Theme = "dark";
  const repoFieldRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    applyPalette(document.documentElement, theme);
  }, [theme]);
  const { state } = loader;
  const model = useMemo(
    () => (state.status === "ready" ? headerModel(state.response, state.isDemo, state.source === "hosted" ? apiBase : null) : null),
    [state, apiBase],
  );
  // The button exists only for a hosted scan whose response says the repository is on the allowlist.
  const onRemediate = useMemo(() => {
    if (state.status !== "ready" || state.source !== "hosted" || apiBase === null || state.response.actions?.remediate !== true) return undefined;
    const repo = state.response.report.scan?.repo.url;
    if (repo === undefined) return undefined;
    return (packageName: string): Promise<RemediateView> => requestRemediation(fetchFn, apiBase, repo, packageName);
  }, [state, apiBase, fetchFn]);
  const onReplay = useCallback(
    (id: ReplayId): void => {
      loader.loadFrom(replayAddress(id), "replay");
    },
    [loader],
  );
  const stopInfo = useMemo(() => (state.status === "ready" ? stopsFor(state.response) : null), [state]);
  const scrubberRef = useRef<HTMLInputElement | null>(null);
  // The chosen Stop belongs to one load: a new load id falls back to the Scan date (the last Stop).
  const [picked, setPicked] = useState<{ readonly loadId: number; readonly index: number } | null>(null);
  const last = stopInfo === null ? 0 : stopInfo.stops.length - 1;
  const index = picked !== null && picked.loadId === state.loadId ? Math.min(Math.max(picked.index, 0), last) : last;
  const showScrubber = stopInfo !== null && stopInfo.hasTimelines;
  const pick = useCallback(
    (next: number): void => {
      setPicked({ loadId: state.loadId, index: next });
    },
    [state.loadId],
  );
  const asOfMs = showScrubber ? (stopInfo.stops[index] ?? null) : null;
  const asOf = showScrubber && index < last && asOfMs !== null
    ? {
        iso: new Date(asOfMs).toISOString(),
        onBack: () => {
          pick(last);
          scrubberRef.current?.focus();
        },
      }
    : undefined;
  return (
    <>
      <Header model={model} theme={theme} apiConfigured={apiBase !== null} onSubmit={loader.submitRepo} fieldRef={repoFieldRef} onReplay={onReplay} {...(state.status === "ready" && state.response.replay !== undefined ? { replay: state.response.replay } : {})} {...(asOf !== undefined ? { asOf } : {})} />
      {showScrubber ? <Scrubber stops={stopInfo.stops} index={index} onChange={pick} inputRef={scrubberRef} /> : null}
      {state.status === "loading" ? (
        <LoadingCard />
      ) : state.status === "error" ? (
        <main className="panel-main">
          <section role="alert" className="load-error">
            <h2>Scan could not be loaded</h2>
            <p>
              <code>{state.error.code}</code>: {state.error.message}
            </p>
            {state.error.contractErrors === undefined ? null : (
              <ul>
                {state.error.contractErrors.map((e, i) => (
                  <li key={i}>
                    {e.path} {e.code} {e.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      ) : (
        <Cemetery
          key={state.loadId}
          response={state.response}
          theme={theme}
          reducedMotion={reducedMotion}
          asOfMs={asOfMs}
          repoFieldRef={repoFieldRef}
          {...(onRemediate !== undefined ? { onRemediate } : {})}
        />
      )}
    </>
  );
}
