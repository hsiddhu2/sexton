import { useLayoutEffect, useMemo, useRef } from "react";
import { Cemetery } from "./Cemetery.js";
import { LoadingCard } from "./LoadingCard.js";
import { Header } from "./header/Header.js";
import { headerModel } from "./header/header-model.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
import { requestRemediation, type RemediateView } from "./load/remediate-client.js";
import { useScanLoader } from "./load/use-scan-loader.js";
import { applyPalette, type Theme } from "./scene/palette.js";

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
  return (
    <>
      <Header model={model} theme={theme} apiConfigured={apiBase !== null} onSubmit={loader.submitRepo} fieldRef={repoFieldRef} />
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
          repoFieldRef={repoFieldRef}
          {...(onRemediate !== undefined ? { onRemediate } : {})}
        />
      )}
    </>
  );
}
