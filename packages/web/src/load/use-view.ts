// The page's one owner of what is open (spec clean-site, design C1 and C8): a ScreenState changed only through
// `reduce`. This first version keeps the state in memory. The View address, push, replace, popstate and the Drawer's
// Back step join here in task 8; every caller already goes through `dispatch`, so they need no change.
import { useCallback, useReducer } from "react";
import { initialScreen, reduce, type ScreenEvent, type ScreenState } from "./screen-state.js";
import type { View } from "./view-address.js";

export interface ViewStore {
  readonly state: ScreenState;
  readonly dispatch: (event: ScreenEvent) => void;
}

export function useView(initial: View): ViewStore {
  const [state, send] = useReducer(reduce, initial, initialScreen);
  const dispatch = useCallback((event: ScreenEvent): void => {
    send(event);
  }, []);
  return { state, dispatch };
}
