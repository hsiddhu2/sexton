// Structured logger and correlation ID. Spec: .kiro/specs/infra, Requirements 6.1, 6.4.

import { describe, expect, it } from "vitest";
import { correlationId, createLogger, errorName, logLine } from "../../src/log/logger.js";

const NOW = new Date("2026-11-20T01:02:03.456Z");

describe("logLine", () => {
  it("writes level, time and correlationId first, then the fields", () => {
    expect(JSON.parse(logLine("info", "cid", { msg: "x", n: 1, ok: true }, NOW))).toEqual({ level: "info", time: "2026-11-20T01:02:03.456Z", correlationId: "cid", msg: "x", n: 1, ok: true });
  });

  it("does not let fields override level, time or correlationId", () => {
    const line = JSON.parse(logLine("warn", "cid", { level: "info", time: "t", correlationId: "other", msg: "m" }, NOW)) as Record<string, unknown>;
    expect(line).toEqual({ level: "warn", time: NOW.toISOString(), correlationId: "cid", msg: "m" });
  });

  it("drops non-scalar values that reach it through a cast", () => {
    const fields = { msg: "m", body: { secret: "s" } } as unknown as Record<string, string>;
    expect(logLine("info", "c", fields, NOW)).not.toContain("secret");
  });
});

describe("createLogger", () => {
  it("writes one line per call to the sink at the right level", () => {
    const lines: string[] = [];
    const log = createLogger("cid", (line) => lines.push(line), () => NOW);
    log.info({ msg: "a" });
    log.warn({ msg: "b" });
    log.error({ msg: "c" });
    expect(lines.map((l) => (JSON.parse(l) as { level: string }).level)).toEqual(["info", "warn", "error"]);
  });
});

describe("a throwing sink", () => {
  it("never makes a log call throw", () => {
    const log = createLogger("cid", () => {
      throw new Error("sink down");
    });
    expect(() => log.error({ msg: "x" })).not.toThrow();
  });
});

describe("correlationId", () => {
  it("uses a valid x-amz-cf-id header, in any case", () => {
    expect(correlationId({ "x-amz-cf-id": "Abc_123=-xyz" }, "req")).toBe("Abc_123=-xyz");
    expect(correlationId({ "X-Amz-Cf-Id": "abc" }, "req")).toBe("abc");
    expect(correlationId({ "x-amz-cf-id": "a".repeat(128) }, "req")).toBe("a".repeat(128));
  });

  it("falls back to the Lambda request ID for an absent, empty, too long or unsafe header", () => {
    for (const headers of [undefined, {}, { "x-amz-cf-id": "" }, { "x-amz-cf-id": "a".repeat(129) }, { "x-amz-cf-id": "a/b" }, { "x-amz-cf-id": "a b" }, { "x-amz-cf-id": "a\nb" }]) {
      expect(correlationId(headers, "req-1")).toBe("req-1");
    }
  });
});

describe("errorName", () => {
  it("keeps the class name only, cleaned, and never the message", () => {
    expect(errorName(new TypeError("secret message"))).toBe("TypeError");
    expect(errorName(Object.assign(new Error("m"), { name: "Bad Name<script>" }))).toBe("BadNamescript");
    expect(errorName("a string")).toBe("string");
    expect(errorName(Object.assign(new Error("m"), { name: "!!!" }))).toBe("Error");
  });
});
