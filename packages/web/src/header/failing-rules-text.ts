/** Pure. "0 failing rules", "1 failing rule", "2 failing rules". */
export function failingRulesText(count: number): string {
  return `${String(count)} failing ${count === 1 ? "rule" : "rules"}`;
}
