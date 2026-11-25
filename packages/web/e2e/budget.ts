// The frame budget of every speed case (spec judge-path, Deliberate test change 9). Locally a repaint must fit one
// 60 Hz frame. On a shared CI runner the same code measures up to CI_FACTOR slower (design.md, decision 10), so the
// budget is widened by that factor there and a real regression still fails.
export const FRAME_MS = 16;
export const CI_FACTOR = 1.4;
export const BUDGET_MS = process.env["CI"] ? FRAME_MS * CI_FACTOR : FRAME_MS;
