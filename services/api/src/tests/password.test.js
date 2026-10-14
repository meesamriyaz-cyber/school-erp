
import { describe, it, expect, vi, beforeEach } from "vitest";

const { hashMock, compareMock } = vi.hoisted(() => ({
  hashMock: vi.fn(),
  compareMock: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: hashMock,
    compare: compareMock,
  },
}));

import { hashPassword, verifyPassword } from "../utils/password.js";

describe("password utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hashPassword", () => {
    it("hashes a valid password using 12 salt rounds", async () => {
      hashMock.mockResolvedValue("hashed-password");

      await expect(hashPassword("Password123")).resolves.toBe(
        "hashed-password",
      );

      expect(hashMock).toHaveBeenCalledWith("Password123", 12);
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 12345678],
      ["an object", {}],
      ["an array", ["Password123"]],
      ["a short password", "short"],
      ["an empty password", ""],
    ])("rejects %s", async (_description, password) => {
      await expect(hashPassword(password)).rejects.toThrow(
        "Password must be a string containing at least 8 characters",
      );

      expect(hashMock).not.toHaveBeenCalled();
    });

    it("accepts a password containing exactly 8 characters", async () => {
      hashMock.mockResolvedValue("hashed-password");

      await expect(hashPassword("12345678")).resolves.toBe(
        "hashed-password",
      );
    });

    it("rejects passwords exceeding 72 UTF-8 bytes", async () => {
      const password = "a".repeat(73);

      await expect(hashPassword(password)).rejects.toThrow(
        "Password must not exceed 72 bytes when encoded as UTF-8",
      );

      expect(hashMock).not.toHaveBeenCalled();
    });

    it("accepts a password containing exactly 72 UTF-8 bytes", async () => {
      const password = "a".repeat(72);
      hashMock.mockResolvedValue("hashed-password");

      await expect(hashPassword(password)).resolves.toBe(
        "hashed-password",
      );

      expect(hashMock).toHaveBeenCalledWith(password, 12);
    });

    it("checks UTF-8 byte length rather than character count", async () => {
      const password = "é".repeat(37);

      expect(password.length).toBe(37);
      expect(Buffer.byteLength(password, "utf8")).toBe(74);

      await expect(hashPassword(password)).rejects.toThrow(
        "Password must not exceed 72 bytes when encoded as UTF-8",
      );

      expect(hashMock).not.toHaveBeenCalled();
    });

    it("propagates hashing errors", async () => {
      const error = new Error("Hashing failed");
      hashMock.mockRejectedValue(error);

      await expect(hashPassword("Password123")).rejects.toBe(error);
    });
  });

  describe("verifyPassword", () => {
    it("returns true when the password matches", async () => {
      compareMock.mockResolvedValue(true);

      await expect(
        verifyPassword("Password123", "stored-hash"),
      ).resolves.toBe(true);

      expect(compareMock).toHaveBeenCalledWith(
        "Password123",
        "stored-hash",
      );
    });

    it("returns false when the password does not match", async () => {
      compareMock.mockResolvedValue(false);

      await expect(
        verifyPassword("WrongPassword", "stored-hash"),
      ).resolves.toBe(false);
    });

    it.each([
      ["undefined password", undefined, "stored-hash"],
      ["null password", null, "stored-hash"],
      ["numeric password", 12345678, "stored-hash"],
      ["undefined hash", "Password123", undefined],
      ["null hash", "Password123", null],
      ["numeric hash", "Password123", 123],
    ])("returns false for %s", async (_description, password, hash) => {
      await expect(verifyPassword(password, hash)).resolves.toBe(false);

      expect(compareMock).not.toHaveBeenCalled();
    });

    it("returns false when bcrypt comparison throws", async () => {
      compareMock.mockRejectedValue(new Error("Invalid hash"));

      await expect(
        verifyPassword("Password123", "invalid-hash"),
      ).resolves.toBe(false);
    });
  });
});
