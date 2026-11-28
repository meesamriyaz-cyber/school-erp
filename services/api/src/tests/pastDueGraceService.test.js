import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscriptionFind: vi.fn(),
  subscriptionUpdateOne: vi.fn(),
  tenantUpdateOne: vi.fn(),
  userUpdateMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  eventCreate: vi.fn(),
}));
vi.mock("../models/SchoolSubscription.js", () => ({ default: { find: mocks.subscriptionFind, updateOne: mocks.subscriptionUpdateOne } }));
vi.mock("../models/Tenant.js", () => ({ default: { updateOne: mocks.tenantUpdateOne } }));
vi.mock("../models/User.js", () => ({ default: { updateMany: mocks.userUpdateMany } }));
vi.mock("../models/Session.js", () => ({ default: { updateMany: mocks.sessionUpdateMany } }));
vi.mock("../models/PlatformCommercialEvent.js", () => ({ default: { create: mocks.eventCreate } }));

import SchoolSubscription from "../models/SchoolSubscription.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import PlatformCommercialEvent from "../models/PlatformCommercialEvent.js";
import { processDuePastDueSubscriptions } from "../services/pastDueGraceService.js";

function sessionStub() {
  return {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
}

describe("past-due subscription grace worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SchoolSubscription.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
    SchoolSubscription.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });
    User.updateMany.mockResolvedValue({ modifiedCount: 1 });
    Session.updateMany.mockResolvedValue({ modifiedCount: 1 });
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
  });

  it("expires a subscription after seven calendar days and suspends/revokes school access atomically", async () => {
    const now = new Date("2026-12-06T09:30:00.000Z");
    const subscriptionId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const graceEndsAt = new Date("2026-12-05T09:30:00.000Z");
    const startSession = vi.spyOn(mongoose, "startSession").mockResolvedValue(sessionStub());
    SchoolSubscription.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: subscriptionId, tenantId, graceEndsAt }]),
      }),
    });

    const result = await processDuePastDueSubscriptions({ now });

    expect(result).toEqual({ expired: 1, skipped: false });
    expect(SchoolSubscription.find).toHaveBeenCalledWith({ status: "past_due", $or: [{ graceEndsAt: { $lte: now } }, { graceEndsAt: null }] });
    expect(SchoolSubscription.updateOne).toHaveBeenCalledWith(
      { _id: subscriptionId, tenantId, status: "past_due", graceEndsAt: { $lte: now } },
      { $set: { status: "expired", graceExpiredAt: now } },
      { session: expect.any(Object) },
    );
    expect(Tenant.updateOne).toHaveBeenCalledWith(
      { _id: tenantId, status: "active" },
      {
        $set: { status: "suspended", suspensionReason: "Subscription payment grace period expired", subscriptionSuspendedAt: now },
        $push: { suspensionHistory: { reason: "Subscription payment grace period expired", suspendedAt: now, suspendedBy: null } },
      },
      { session: expect.any(Object) },
    );
    expect(User.updateMany).toHaveBeenCalledWith({ tenantId }, { $inc: { authVersion: 1 } }, { session: expect.any(Object) });
    expect(Session.updateMany).toHaveBeenCalledWith({ tenantId, revokedAt: null }, { $set: { revokedAt: now } }, { session: expect.any(Object) });
    expect(PlatformCommercialEvent.create).toHaveBeenCalledWith([expect.objectContaining({
      actorUserId: null, tenantId, subscriptionId, action: "SUBSCRIPTION_GRACE_EXPIRED",
      details: expect.objectContaining({ graceDays: 7, schoolAccessSuspended: true, graceExpiredAt: now }),
    })], { session: expect.any(Object) });
    expect(startSession).toHaveBeenCalledOnce();
  });

  it("does not overwrite a manually suspended school or revoke credentials again", async () => {
    const now = new Date("2026-12-06T09:30:00.000Z");
    const tenantId = new mongoose.Types.ObjectId();
    const subscriptionId = new mongoose.Types.ObjectId();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(sessionStub());
    SchoolSubscription.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: subscriptionId, tenantId, graceEndsAt: new Date("2026-12-05T09:30:00.000Z") }]),
      }),
    });
    Tenant.updateOne.mockResolvedValue({ modifiedCount: 0 });

    const result = await processDuePastDueSubscriptions({ now });

    expect(result).toEqual({ expired: 1, skipped: false });
    expect(User.updateMany).not.toHaveBeenCalled();
    expect(Session.updateMany).not.toHaveBeenCalled();
    expect(PlatformCommercialEvent.create).toHaveBeenCalledWith([expect.objectContaining({
      action: "SUBSCRIPTION_GRACE_EXPIRED",
      details: expect.objectContaining({ schoolAccessSuspended: false }),
    })], { session: expect.any(Object) });
  });

  it("does not suspend a school when payment wins the conditional transition race", async () => {
    const now = new Date("2026-12-06T09:30:00.000Z");
    const tenantId = new mongoose.Types.ObjectId();
    const subscriptionId = new mongoose.Types.ObjectId();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(sessionStub());
    SchoolSubscription.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: subscriptionId, tenantId, graceEndsAt: new Date("2026-12-05T09:30:00.000Z") }]),
      }),
    });
    SchoolSubscription.updateOne.mockResolvedValue({ modifiedCount: 0 });

    const result = await processDuePastDueSubscriptions({ now });

    expect(result).toEqual({ expired: 0, skipped: false });
    expect(Tenant.updateOne).not.toHaveBeenCalled();
    expect(User.updateMany).not.toHaveBeenCalled();
    expect(PlatformCommercialEvent.create).not.toHaveBeenCalled();
  });

  it("is repeat-safe when no grace periods are due", async () => {
    const result = await processDuePastDueSubscriptions({ now: new Date("2026-12-06T09:30:00.000Z") });
    expect(result).toEqual({ expired: 0, skipped: false });
    expect(mocks.subscriptionUpdateOne).not.toHaveBeenCalled();
  });
});
