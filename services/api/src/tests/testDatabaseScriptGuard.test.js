import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    nodeEnv: "test",
    mongoUri: "mongodb://localhost:27017/school-erp-test",
  },
}));

vi.mock("../config/env.js", () => ({
  default: mockEnv,
}));

import { getTestDatabaseUri } from "../scripts/utils/testDatabase.js";

describe("test database script guard", () => {
  beforeEach(() => {
    mockEnv.nodeEnv = "test";
    mockEnv.mongoUri = "mongodb://localhost:27017/school-erp-test";
  });

  it("returns the selected test database URI in test mode", () => {
    expect(getTestDatabaseUri()).toBe(
      "mongodb://localhost:27017/school-erp-test"
    );
  });

  it.each(["development", "production"])(
    "refuses to run in %s mode before opening a connection",
    (nodeEnv) => {
      mockEnv.nodeEnv = nodeEnv;

      expect(() => getTestDatabaseUri()).toThrow(
        "This script is restricted to NODE_ENV=test. No database connection was opened."
      );
    }
  );
});
