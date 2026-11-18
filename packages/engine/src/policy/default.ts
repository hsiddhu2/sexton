// The built-in policy applied when a repository has none. Requirement 8.1.

import type { Policy } from "../types.js";

export const DEFAULT_POLICY: Policy = {
  version: 1,
  rules: [{ type: "forbid_state", states: ["Possessed", "Dead"] }],
};
