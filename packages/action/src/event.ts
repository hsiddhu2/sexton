// The pull request number from the event file. Spec: .kiro/specs/cli-and-action, Requirement 9.9. Pure.

/** Returns the number only when it is a positive safe integer, from pull_request.number or number. */
export function prNumberFromEvent(eventText: string): number | null {
  let event: unknown;
  try {
    event = JSON.parse(eventText);
  } catch {
    return null;
  }
  if (typeof event !== "object" || event === null || Array.isArray(event)) return null;
  const record = event as Record<string, unknown>;
  const pr = Object.hasOwn(record, "pull_request") ? record["pull_request"] : undefined;
  const fromPr = typeof pr === "object" && pr !== null && Object.hasOwn(pr, "number") ? (pr as Record<string, unknown>)["number"] : undefined;
  const value = fromPr ?? (Object.hasOwn(record, "number") ? record["number"] : undefined);
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
