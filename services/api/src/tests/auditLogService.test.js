import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditLogModel, outboxModel } = vi.hoisted(() => ({
  auditLogModel: { create: vi.fn() },
  outboxModel: {
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("../models/AuditLog.js", () => ({ default: auditLogModel }));
vi.mock("../models/AuditOutbox.js", () => ({ default: outboxModel }));

import { processPendingAuditEvents, withAuditTransaction, writeUserAudit } from "../services/auditLogService.js";

const leanResult = (value) => ({ lean: vi.fn().mockResolvedValue(value) });

describe("user audit outbox service", () => {
  const actorUserId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const outboxId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    outboxModel.create.mockImplementation(async ({ event }) => {
      outboxModel.findOneAndUpdate
        .mockReset()
        .mockReturnValueOnce(leanResult({ _id: outboxId, attempts: 1, event }))
        .mockReturnValue(leanResult(null));
      return { _id: outboxId };
    });
    outboxModel.findOneAndUpdate
      .mockReturnValueOnce(leanResult({
        _id: outboxId,
        attempts: 1,
        event: { eventId: new mongoose.Types.ObjectId(), action: "USER_PROFILE_UPDATED" },
      }))
      .mockReturnValue(leanResult(null));
    outboxModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    outboxModel.findById.mockReturnValue({
      select: vi.fn().mockReturnValue(leanResult({ status: "delivered" })),
    });
  });

  it("durably enqueues sanitized events before attempting delivery", async () => {
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
    expect(outboxModel.create).toHaveBeenCalledOnce();
    const queued = outboxModel.create.mock.calls[0][0];
    expect(queued.status).toBeUndefined();
    expect(queued.event).toMatchObject({
      actorUserId,
      actorRole: "school_admin",
      tenantId,
      targetUserId,
      targetTenantId: tenantId,
      action: "USER_PROFILE_UPDATED",
      changedFields: ["firstName"],
    });
    expect(queued.event.eventId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(queued.event).not.toHaveProperty("password");
    expect(queued.event).not.toHaveProperty("passwordHash");
    expect(queued.event).not.toHaveProperty("accessToken");
    expect(queued.event).not.toHaveProperty("refreshToken");
    expect(auditLogModel.create).toHaveBeenCalledWith(queued.event);
    expect(outboxModel.updateOne).toHaveBeenCalledWith(
      { _id: outboxId, status: "processing" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "delivered" }),
      }),
    );
  });

  it("requeues failed deliveries with backoff and logs sanitized context", async () => {
    auditLogModel.create.mockRejectedValueOnce(new Error("database unavailable\nsecret detail"));
    outboxModel.findById.mockReturnValue({
      select: vi.fn().mockReturnValue(leanResult({ status: "pending" })),
    });
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
      expect(outboxModel.updateOne).toHaveBeenCalledWith(
        { _id: outboxId, status: "processing" },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "pending",
            nextAttemptAt: expect.any(Date),
            lastError: "database unavailable secret detail",
          }),
          $unset: { processingStartedAt: 1 },
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Audit outbox delivery failed",
        expect.objectContaining({ action: "USER_ROLE_CHANGED", attempts: 1 }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("marks an event delivered when an earlier attempt inserted it before crashing", async () => {
    auditLogModel.create.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: 11000 }));
    const result = await processPendingAuditEvents({ batchSize: 1 });

    expect(result.processed).toBe(1);
    expect(outboxModel.updateOne).toHaveBeenCalledWith(
      { _id: outboxId, status: "processing" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "delivered" }),
      }),
    );
  });

  it("keeps an outbox enqueue failure visible and does not claim delivery", async () => {
    outboxModel.create.mockRejectedValueOnce(new Error("outbox unavailable"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await writeUserAudit({
        actorUserId,
        actorRole: "platform_admin",
        targetUserId,
        action: "USER_ROLE_CHANGED",
        changedFields: ["role"],
      });
      expect(result).toBe(false);
      expect(auditLogModel.create).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "Failed to enqueue user-management audit event",
        expect.objectContaining({ action: "USER_ROLE_CHANGED" }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });
  it("runs the mutation callback in a MongoDB transaction and closes the session", async () => {
    const session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    const startSession = vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    try {
      const result = await withAuditTransaction(async (activeSession) => {
        expect(activeSession).toBe(session);
        return "committed";
      });
      expect(result).toBe("committed");
      expect(session.withTransaction).toHaveBeenCalledOnce();
      expect(session.endSession).toHaveBeenCalledOnce();
    } finally {
      startSession.mockRestore();
    }
  });

  it("propagates transaction failure so the caller cannot report a committed mutation", async () => {
    const session = {
      withTransaction: vi.fn().mockRejectedValue(new Error("transaction aborted")),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    const startSession = vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    try {
      await expect(withAuditTransaction(async () => "must-not-commit")).rejects.toThrow("transaction aborted");
      expect(session.endSession).toHaveBeenCalledOnce();
    } finally {
      startSession.mockRestore();
    }
  });
  it("enqueues the sanitized event with the active transaction session", async () => {
    const session = { id: "active-session" };
    outboxModel.create.mockResolvedValueOnce([{ _id: outboxId }]);
    const result = await writeUserAudit({
      actorUserId, actorRole: "school_admin", targetUserId, tenantId,
      action: "USER_PROFILE_UPDATED", changedFields: ["email"],
    }, { session });

    expect(result).toBe(true);
    expect(outboxModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ event: expect.objectContaining({ action: "USER_PROFILE_UPDATED" }) })],
      { session },
    );
    expect(auditLogModel.create).not.toHaveBeenCalled();
  });

  it("throws on transactional outbox failure so the enclosing mutation rolls back", async () => {
    const session = { id: "active-session" };
    outboxModel.create.mockRejectedValueOnce(new Error("outbox unavailable"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(writeUserAudit({
        actorUserId, actorRole: "school_admin", targetUserId, tenantId,
        action: "USER_PROFILE_UPDATED", changedFields: ["email"],
      }, { session })).rejects.toThrow("outbox unavailable");
      expect(auditLogModel.create).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
