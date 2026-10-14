
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashRefreshToken } from "../utils/refreshTokenHash.js";

describe("hashRefreshToken", () => {
  it("throws when the token is missing", () => {
    expect(() => hashRefreshToken()).toThrow(
      "A refresh token is required",
    );
  });

  it.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 12345],
    ["an object", {}],
    ["an array", []],
    ["a boolean", true],
  ])("rejects %s", (_description, token) => {
    expect(() => hashRefreshToken(token)).toThrow(
      "A refresh token is required",
    );
  });

  it("returns a SHA-256 hexadecimal hash", () => {
    const token = "test-refresh-token";

    const expectedHash = createHash("sha256")
      .update(token, "utf8")
      .digest("hex");

    expect(hashRefreshToken(token)).toBe(expectedHash);
  });

  it("returns a 64-character hexadecimal string", () => {
    const hash = hashRefreshToken("test-refresh-token");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same hash for the same token", () => {
    expect(hashRefreshToken("same-token")).toBe(
      hashRefreshToken("same-token"),
    );
  });

  it("returns different hashes for different tokens", () => {
    expect(hashRefreshToken("token-one")).not.toBe(
      hashRefreshToken("token-two"),
    );
  });

  it("handles UTF-8 tokens consistently", () => {
    const token = "refresh-token-كشمير-🔐";

    const expectedHash = createHash("sha256")
      .update(token, "utf8")
      .digest("hex");

    expect(hashRefreshToken(token)).toBe(expectedHash);
  });
});
