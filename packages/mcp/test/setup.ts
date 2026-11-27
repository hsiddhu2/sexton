// Requirement 9.6: a test that reaches the real network fails. Every test passes its transport in.
globalThis.fetch = (() => {
  throw new Error("network use in a test");
}) as typeof fetch;
