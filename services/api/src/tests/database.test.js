
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, connect, disconnect } = vi.hoisted(() => ({
  connection: { readyState: 0 },
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("mongoose", () => ({
  default: {
    connection,
    connect,
    disconnect,
  },
}));

vi.mock("../config/env.js", () => ({
  default: {
    mongoUri: "mongodb://localhost:27017/school-erp-test",
  },
}));

import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus,
} from "../config/database.js";

describe("database configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.readyState = 0;
  });

  describe("connectDatabase", () => {
    it("returns the existing connection when already connected", async () => {
      connection.readyState = 1;

      const result = await connectDatabase();

      expect(result).toBe(connection);
      expect(connect).not.toHaveBeenCalled();
    });

    it("connects and returns the connection when disconnected", async () => {
      connect.mockResolvedValueOnce(connection);
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const result = await connectDatabase();

      expect(connect).toHaveBeenCalledWith(
        "mongodb://localhost:27017/school-erp-test",
        { serverSelectionTimeoutMS: 10000 },
      );
      expect(result).toBe(connection);
      expect(consoleSpy).toHaveBeenCalledWith(
        "MongoDB connected successfully",
      );

      consoleSpy.mockRestore();
    });

    it("propagates connection errors", async () => {
      const error = new Error("Connection failed");
      connect.mockRejectedValueOnce(error);

      await expect(connectDatabase()).rejects.toBe(error);
    });
  });

  describe("disconnectDatabase", () => {
    it("does nothing when already disconnected", async () => {
      connection.readyState = 0;

      await disconnectDatabase();

      expect(disconnect).not.toHaveBeenCalled();
    });

    it("disconnects when the connection is active", async () => {
      connection.readyState = 1;
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await disconnectDatabase();

      expect(disconnect).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalledWith(
        "MongoDB disconnected",
      );

      consoleSpy.mockRestore();
    });

    it("propagates disconnection errors", async () => {
      connection.readyState = 1;
      const error = new Error("Disconnection failed");
      disconnect.mockRejectedValueOnce(error);

      await expect(disconnectDatabase()).rejects.toBe(error);
    });
  });

  describe("getDatabaseStatus", () => {
    it.each([
      [0, "disconnected"],
      [1, "connected"],
      [2, "connecting"],
      [3, "disconnecting"],
      [99, "unknown"],
    ])("returns %s status correctly", (readyState, expected) => {
      connection.readyState = readyState;

      expect(getDatabaseStatus()).toBe(expected);
    });
  });
});
