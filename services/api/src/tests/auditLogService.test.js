import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditLogModel } = vi.hoisted(() => ({
  auditLogModel: { create: vi.fn() },
}));

vi.mock("../models/AuditLog.js", () => ({ default: auditLogModel }));

import { writeUserAudit } from "../services/auditLogService.js";

describe("user audit log service", () => {
  const actorUserId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
  });

  it("persists only allowlisted audit fields and excludes credential data", async () => {
    const result = await writeUserAudit({
      actorUserId,
      actorRole: "school_admin",
      tenantId,
      targetUserId,
      targetTenantId: tenantId,
      action: "USER_PROFILE_UPDATED",
      changedFields: ["firstName", "password", "passwordHash", "refreshToken"],
      password: "must-not-be-recorded",
      passwordHash: "must-not-be-recorded",
      accessToken: "must-not-be-recorded",
      refreshToken: "must-not-be-recorded",
    });

    expect(result).toBe(true);
    expect(auditLogModel.create).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId,
      actorRole: "school_admin",
      tenantId,
      targetUserId,
      targetTenantId: tenantId,
      action: "USER_PROFILE_UPDATED",
      changedFields: ["firstName"],
      previousValue: null,
      newValue: null,
    }));
    const record = auditLogModel.create.mock.calls[0][0];
    expect(record).not.toHaveProperty("password");
    expect(record).not.toHaveProperty("passwordHash");
    expect(record).not.toHaveProperty("accessToken");
    expect(record).not.toHaveProperty("refreshToken");
  });

  it("returns false and logs safe context when persistence fails", async () => {
    auditLogModel.create.mockRejectedValue(new Error("database unavailable"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await writeUserAudit({
        actorUserId,
        actorRole: "platform_admin",
        targetUserId,
        action: "USER_ROLE_CHANGED",
        changedFields: ["role"],
        previousValue: "teacher",
        newValue: "principal",
      });

      expect(result).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(
        "Failed to persist user-management audit event",
        expect.objectContaining({
          action: "USER_ROLE_CHANGED",
          actorUserId: String(actorUserId),
          targetUserId: String(targetUserId),
        }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });
});
