// Signal envelope constructors. Requirement 1.

import type { AvailableSignal, Signal, UnavailableSignal } from "./types.js";

export const MAX_REASON_LENGTH = 200;

/** Builds an available signal. Requirement 1.2, 1.4, 1.5. */
export function available<T>(value: T, source: string, fetchedAt: Date): AvailableSignal<T> {
  return { value, source, fetchedAt: toIso(fetchedAt), available: true };
}

/** Builds an unavailable signal with a single-line reason of at most 200 characters. Requirement 1.3. */
export function unavailable(reason: string, source: string, fetchedAt: Date): UnavailableSignal {
  return { value: null, source, fetchedAt: toIso(fetchedAt), available: false, reason: cleanReason(reason) };
}

/** Collapses whitespace, removes newlines and truncates to 200 characters. */
export function cleanReason(reason: string): string {
  const flat = reason.replace(/\s+/g, " ").trim();
  return flat.length > MAX_REASON_LENGTH ? flat.slice(0, MAX_REASON_LENGTH) : flat;
}

/** ISO 8601 in UTC with the Z designator. Requirement 2.1. */
export function toIso(date: Date): string {
  return date.toISOString();
}

/** Parses an ISO string back to the same instant. Requirement 2.4. */
export function fromIso(iso: string): Date {
  return new Date(iso);
}

export function isAvailable<T>(signal: Signal<T>): signal is AvailableSignal<T> {
  return signal.available;
}
