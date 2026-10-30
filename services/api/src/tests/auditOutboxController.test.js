import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { outboxModel, processPendingAuditEvents } = vi.hoisted(() => ({
  outboxModel: { countDocuments: vi.fn(), find: vi.fn(), findOneAndUpdate: vi.fn(), findById: vi.fn() },
  processPendingAuditEvents: vi.fn(),
}));

vi.mock("../models/AuditOutbox.js", () => ({ default: outboxModel }));
vi.mock("../services/auditLogService.js", () => ({ processPendingAuditEvents }));

import { getAuditOutboxStatus, retryFailedAuditEvent } from "../controllers/auditOutboxController.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
const chain = (value) => ({
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});

describe("audit outbox operations controller", () => {
  const outboxId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { auth: { userId: adminId.toString(), role: "platform_admin" }, params: { outboxId: outboxId.toString() } };
    res = response();
    next = vi.fn();
    outboxModel.countDocuments.mockResolvedValue(0);
    outboxModel.find.mockReturnValue(chain([]));
    outboxModel.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: outboxId, status: "pending", attempts: 0, manualRetryCount: 1 }),
    });
    outboxModel.findById.mockReturnValue(chain({
      _id: outboxId, status: "delivered", attempts: 1, manualRetryCount: 1, lastError: null,
    }));
    processPendingAuditEvents.mockResolvedValue({ processed: 1, skipped: false });
  });

  it("returns delivery counts and failed-event metadata without event payloads", async () => {
    outboxModel.countDocuments
      .mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1)
      .mockResolvedValueOnce(40).mockResolvedValueOnce(3);
    outboxModel.find.mockReturnValue(chain([{
      _id: outboxId, status: "failed", attempts: 10, manualRetryCount: 0,
      lastError: "database unavailable", createdAt: new Date(), updatedAt: new Date(), event: { secret: "never expose" },
    }]));

    await getAuditOutboxStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.counts).toEqual({ pending: 2, processing: 1, staleProcessing: 1, delivered: 40, failed: 3 });
    expect(payload.data.failedEvents[0]).not.toHaveProperty("event");
    expect(payload.data.failedEvents[0]).not.toHaveProperty("secret");
  });

  it("rejects malformed outbox IDs", async () => {
    req.params.outboxId = "not-an-object-id";
    await retryFailedAuditEvent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(outboxModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("retries only failed events and records the administrator", async () => {
    await retryFailedAuditEvent(req, res, next);

    expect(outboxModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: outboxId.toString(), status: "failed" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "pending", attempts: 0, nextAttemptAt: expect.any(Date),
          lastManualRetryAt: expect.any(Date), lastManualRetryBy: adminId,
        }),
        $inc: { manualRetryCount: 1 },
      }),
      { new: true },
    );
    expect(processPendingAuditEvents).toHaveBeenCalledWith({ batchSize: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns conflict when the event is not currently failed", async () => {
    outboxModel.findOneAndUpdate.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    await retryFailedAuditEvent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(processPendingAuditEvents).not.toHaveBeenCalled();
  });
});
