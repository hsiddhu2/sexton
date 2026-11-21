import { describe, expect, it } from "vitest";
import { parseApiBase } from "../src/load/api-base.js";

describe("parseApiBase", () => {
  it("accepts a valid https value", () => {
    expect(parseApiBase("https://api.sexton.example")).toBe("https://api.sexton.example");
    expect(parseApiBase("https://api.sexton.example/v1")).toBe("https://api.sexton.example/v1");
  });
  it("strips one trailing slash", () => {
    expect(parseApiBase("https://api.sexton.example/")).toBe("https://api.sexton.example");
    expect(parseApiBase("https://api.sexton.example/v1/")).toBe("https://api.sexton.example/v1");
  });
  it("returns null for absent, empty and invalid values", () => {
    expect(parseApiBase(undefined)).toBeNull();
    expect(parseApiBase("")).toBeNull();
    expect(parseApiBase("not a url")).toBeNull();
  });
  it("rejects http, query, fragment, bare question mark and credentials", () => {
    expect(parseApiBase("http://api.sexton.example")).toBeNull();
    expect(parseApiBase("https://api.sexton.example/?a=1")).toBeNull();
    expect(parseApiBase("https://api.sexton.example/#x")).toBeNull();
    expect(parseApiBase("https://api.sexton.example/?")).toBeNull();
    expect(parseApiBase("https://user:pw@api.sexton.example")).toBeNull();
    expect(parseApiBase("https://user@api.sexton.example")).toBeNull();
  });
});
