// Bounded concurrency for the engine's fetch loops. Moved from score.ts (spec submission-readiness, Requirement 5.4).

export const PACKAGE_CONCURRENCY = 8;

/** Runs fn over items with at most limit in flight. Preserves order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
