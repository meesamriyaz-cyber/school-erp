import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findOneAndUpdate: vi.fn(), updateOne: vi.fn(), userFindOne: vi.fn() }));
vi.mock("../models/Notification.js", () => ({ default: {
  findOneAndUpdate: mocks.findOneAndUpdate,
  updateOne: mocks.updateOne,
} }));
vi.mock("../models/User.js", () => ({ default: { findOne: mocks.userFindOne } }));

import { notificationRetryPolicy, processPendingNotifications } from "../services/notificationDeliveryService.js";

const notification = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  tenantId: "bbbbbbbbbbbbbbbbbbbbbbbb",
  recipientUserId: "cccccccccccccccccccccccc",
  recipientRole: "parent",
  attempts: 1,
  processingToken: "lease-token",
};

const claimQuery = (value) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});
const userQuery = (value) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});

describe("notification delivery worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOneAndUpdate.mockReturnValue(claimQuery(notification));
    mocks.userFindOne.mockReturnValue(userQuery({ _id: notification.recipientUserId }));
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("claims pending work with a lease and delivers only to an active tenant-matched account", async () => {
    const result = await processPendingNotifications({ batchSize: 1 });

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ deliveryStatus: "pending", attempts: { $lt: notificationRetryPolicy.maxAttempts }, nextAttemptAt: { $lte: expect.any(Date) } }),
          expect.objectContaining({ deliveryStatus: "processing", attempts: { $lte: notificationRetryPolicy.maxAttempts } }),
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ deliveryStatus: "processing", processingToken: expect.any(String) }),
        $inc: { attempts: 1 },
      }),
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
    );
    expect(mocks.userFindOne).toHaveBeenCalledWith({
      _id: notification.recipientUserId,
      tenantId: notification.tenantId,
      role: "parent",
      status: "active",
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: notification._id, deliveryStatus: "processing", processingToken: notification.processingToken },
      expect.objectContaining({
        $set: expect.objectContaining({ deliveryStatus: "delivered", deliveredAt: expect.any(Date), lastError: null }),
        $push: { deliveryHistory: expect.objectContaining({ attempt: 1, outcome: "delivered" }) },
      }),
    );
    expect(result).toEqual({ processed: 1, skipped: false });
  });

  it("cancels delivery when the recipient is no longer active", async () => {
    mocks.userFindOne.mockReturnValue(userQuery(null));
    await processPendingNotifications({ batchSize: 1 });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({ deliveryStatus: "cancelled" }),
        $push: { deliveryHistory: expect.objectContaining({ outcome: "cancelled" }) },
      }),
    );
  });

  it("schedules transient failures with bounded exponential backoff", async () => {
    mocks.userFindOne.mockImplementation(() => { throw new Error("temporary database error"); });
    await processPendingNotifications({ batchSize: 1 });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          deliveryStatus: "pending",
          nextAttemptAt: expect.any(Date),
          lastError: "temporary database error",
        }),
        $push: { deliveryHistory: expect.objectContaining({ outcome: "retry_scheduled", error: "temporary database error" }) },
      }),
    );
  });

  it("marks exhausted work failed rather than retrying forever", async () => {
    mocks.findOneAndUpdate.mockReturnValue(claimQuery({ ...notification, attempts: notificationRetryPolicy.maxAttempts }));
    mocks.userFindOne.mockImplementation(() => { throw new Error("persistent error"); });
    await processPendingNotifications({ batchSize: 1 });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({ deliveryStatus: "failed" }),
        $push: { deliveryHistory: expect.objectContaining({ outcome: "failed" }) },
      }),
    );
  });

  it("stops when no due or abandoned work can be claimed", async () => {
    mocks.findOneAndUpdate.mockReturnValue(claimQuery(null));
    const result = await processPendingNotifications({ batchSize: 10 });
    expect(result).toEqual({ processed: 0, skipped: false });
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });
  it("finalizes a crashed lease after the last allowed attempt without dispatching again", async () => {
    mocks.findOneAndUpdate.mockReturnValue(claimQuery({ ...notification, attempts: notificationRetryPolicy.maxAttempts + 1 }));
    await processPendingNotifications({ batchSize: 1 });

    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({ deliveryStatus: "failed" }),
        $push: { deliveryHistory: expect.objectContaining({ outcome: "failed" }) },
      }),
    );
  });

});
