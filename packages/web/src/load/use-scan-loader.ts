import type { ScanResponse } from "@sexton/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkScanUrl } from "./check-scan-url.js";
import { makeLoadError, type LoadError } from "./load-error.js";
import { loadScan } from "./load-scan.js";
import { parseReplayParam, replayAddress } from "../replay/replay-ids.js";

export type LoadState =
  | { readonly status: "loading"; readonly loadId: number; readonly source: LoadSource }
  | { readonly status: "error"; readonly loadId: number; readonly error: LoadError }
  | {
      readonly status: "ready";
      readonly loadId: number;
      readonly response: ScanResponse;
      readonly isDemo: boolean;
      /** How the load started: the repository form (hosted) or an address. Spec evidence-pack, Requirement 8.2. */
      readonly source: LoadSource;
    };

export type LoadSource = "hosted" | "address" | "replay";

export interface ScanLoader {
  readonly state: LoadState;
  readonly loadFrom: (address: string, source?: LoadSource) => void;
  /** Returns fixed text when no request started, or null when one did. */
  readonly submitRepo: (value: string) => string | null;
  /** Shows a response already held in memory, with no request (a Live scan shown again on Back or Forward). */
  readonly show: (response: ScanResponse, source: LoadSource) => void;
}

export const DEMO_ADDRESS = "/demo/scan.json";
/** Spec clean-site, 1.13: the reason the Scan field is disabled with no API base. */
export const HOSTED_UNAVAILABLE_TEXT = "Scanning is off in this build.";
export const REPO_INPUT_TEXT = "Enter a repository URL of 1 to 200 characters.";
const MAX_REPO_LENGTH = 200;

export interface ScanLoaderDeps {
  readonly fetchFn: typeof fetch;
  readonly pageOrigin: string;
  readonly apiBase: string | null;
  readonly initialSearch: string;
}

export function useScanLoader(deps: ScanLoaderDeps): ScanLoader {
  const { fetchFn, pageOrigin, apiBase, initialSearch } = deps;
  const [state, setState] = useState<LoadState>({ status: "loading", loadId: 0, source: "address" });
  const controllerRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);

  const start = useCallback(
    (address: string, source: LoadSource = "address"): void => {
      idRef.current += 1;
      const loadId = idRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "loading", loadId, source });
      const check = checkScanUrl(address, pageOrigin, apiBase);
      if (!check.ok) {
        setState({ status: "error", loadId, error: makeLoadError("scan-url-rejected") });
        return;
      }
      const isDemo = check.url === new URL(DEMO_ADDRESS, pageOrigin).href;
      void loadScan(check.url, { fetchFn, signal: controller.signal }).then((result) => {
        if (controllerRef.current !== controller) return;
        setState(
          result.ok
            ? { status: "ready", loadId, response: result.value, isDemo, source }
            : { status: "error", loadId, error: result.error },
        );
      });
    },
    [fetchFn, pageOrigin, apiBase],
  );

  useEffect(() => {
    // The replay query is a closed set and wins over scan. A value outside it loads no address: start("") is rejected by checkScanUrl before any request.
    const replay = parseReplayParam(initialSearch);
    if (replay !== null) {
      if ("rejected" in replay) start("");
      else start(replayAddress(replay.id), "replay");
      return () => {
        controllerRef.current?.abort();
      };
    }
    const params = new URLSearchParams(initialSearch);
    start(params.has("scan") ? (params.get("scan") ?? "") : DEMO_ADDRESS);
    return () => {
      controllerRef.current?.abort();
    };
    // Runs once per mount: the initial address is read a single time.
  }, []);

  const submitRepo = useCallback(
    (value: string): string | null => {
      if (apiBase === null) return HOSTED_UNAVAILABLE_TEXT;
      const trimmed = value.trim();
      if (trimmed === "" || trimmed.length > MAX_REPO_LENGTH) return REPO_INPUT_TEXT;
      start(`${apiBase}/scan?repo=${encodeURIComponent(trimmed)}`, "hosted");
      return null;
    },
    [apiBase, start],
  );

  const show = useCallback((response: ScanResponse, source: LoadSource): void => {
    idRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "ready", loadId: idRef.current, response, isDemo: false, source });
  }, []);

  return { state, loadFrom: start, submitRepo, show };
}
