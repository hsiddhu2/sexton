import { useLayoutEffect, useMemo, useState } from "react";
import { Cemetery } from "./Cemetery.js";
import { Header } from "./header/Header.js";
import { headerModel } from "./header/header-model.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  useLayoutEffect(() => {
    applyPalette(document.documentElement, theme);
  }, [theme]);
  const { state } = loader;
  const model = useMemo(
    () => (state.status === "ready" ? headerModel(state.response, state.isDemo) : null),
    [state],
  );
  return (
    <>
      {/* The header joins the Cemetery's inert region while the drawer is open; the drawer stays outside both. */}
      <div inert={drawerOpen}>
        <Header model={model} theme={theme} apiConfigured={apiBase !== null} onSubmit={loader.submitRepo} />
      </div>
      {state.status === "loading" ? (
        <main>
          <p role="status">loading scan</p>
        </main>
      ) : state.status === "error" ? (
        <main>
          <section role="alert" className="load-error">
            <h2>Scan could not be loaded</h2>
            <p>
              {state.error.code}: {state.error.message}
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
          onDrawerOpenChange={setDrawerOpen}
        />
      )}
    </>
  );
}
