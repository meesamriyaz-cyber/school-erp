import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDatabaseStatus, getBackgroundWorkerHealth } = vi.hoisted(() => ({
  getDatabaseStatus: vi.fn(),
  getBackgroundWorkerHealth: vi.fn(),
}));
vi.mock("../config/database.js", () => ({ getDatabaseStatus }));
vi.mock("../services/workerHealth.js", () => ({ getBackgroundWorkerHealth }));
import { getPlatformOperationalHealth } from "../controllers/platformOperationsController.js";

describe("platform operational health controller", () => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  beforeEach(() => {
    vi.clearAllMocks();
    getDatabaseStatus.mockReturnValue("connected");
    getBackgroundWorkerHealth.mockReturnValue({
      status: "healthy", ready: true,
      workers: { trialExpiry: { status: "healthy", lastErrorName: null } },
    });
  });

  it("returns database and worker health without internal error details", () => {
    getBackgroundWorkerHealth.mockReturnValue({
      status: "not_ready", ready: false,
      workers: { trialExpiry: { status: "degraded", lastErrorName: "MongoNetworkError" } },
    });
    getPlatformOperationalHealth({}, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      success: true,
      data: { status: "attention_required", ready: false, database: "connected" },
    });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("connection string");
  });

  it("reports healthy when database and all workers are ready", () => {
    getPlatformOperationalHealth({}, res);
    expect(res.json.mock.calls[0][0].data).toMatchObject({
      status: "healthy", ready: true, database: "connected",
    });
    expect(Number.isNaN(Date.parse(res.json.mock.calls[0][0].data.sampledAt))).toBe(false);
  });
});
