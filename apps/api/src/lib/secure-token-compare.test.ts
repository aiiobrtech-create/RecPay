import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "./secure-token-compare.js";

describe("timingSafeStringEqual", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeStringEqual("same", "same")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeStringEqual("a", "b")).toBe(false);
  });

  it("handles different lengths without throwing", () => {
    expect(timingSafeStringEqual("short", "longer-secret")).toBe(false);
  });
});
