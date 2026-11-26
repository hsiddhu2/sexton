// The frame budget of every speed case (spec judge-path, Deliberate test change 9, decision 12). Locally a repaint
// must fit one 60 Hz frame. A shared CI runner's timings vary by more than two times for unchanged code, so there the
// budget is CI_BUDGET_MS: it catches only a large regression, and the local run keeps the strict budget.
export const FRAME_MS = 16;
export const CI_BUDGET_MS = 50;
export const BUDGET_MS = process.env["CI"] ? CI_BUDGET_MS : FRAME_MS;
