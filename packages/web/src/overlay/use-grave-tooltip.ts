import { useEffect, useReducer, type Dispatch } from "react";
import { GRACE_MS, TIP_START, tipReducer, type TipEvent } from "./tooltip-model.js";

export interface GraveTooltipControl {
  /** Index of the grave whose tooltip is shown, or null. */
  readonly shownIndex: number | null;
  readonly dispatch: Dispatch<TipEvent>;
}

export function useGraveTooltip(suppressed: boolean): GraveTooltipControl {
  const [state, dispatch] = useReducer(tipReducer, TIP_START);
  const shownIndex = suppressed ? null : state.index;
  const pendingHide = state.leaving && !state.overTip;

  // Grace timer: runs only while the pointer has left and is not over the tooltip.
  useEffect(() => {
    if (!pendingHide) return undefined;
    const timer = setTimeout(() => {
      dispatch({ type: "grace-expired" });
    }, GRACE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [pendingHide]);

  // Escape listener: installed only while a tooltip is shown. It neither prevents default nor stops propagation.
  const shown = shownIndex !== null;
  useEffect(() => {
    if (!shown) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dispatch({ type: "escape" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [shown]);

  return { shownIndex, dispatch };
}
