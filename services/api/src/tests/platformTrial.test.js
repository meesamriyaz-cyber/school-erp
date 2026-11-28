import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/Tenant.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/User.js", () => ({ default: { updateMany: vi.fn() } }));
vi.mock("../models/SchoolSubscription.js", () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock("../models/PlatformCommercialEvent.js", () => ({ default: { create: vi.fn() } }));

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import SchoolSubscription from "../models/SchoolSubscription.js";
import PlatformCommercialEvent from "../models/PlatformCommercialEvent.js";
import { startSchoolTrial } from "../controllers/platformBillingController.js";

describe("startSchoolTrial controller", () => {
  let session;
  let school;
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    school = {
      _id: new mongoose.Types.ObjectId(),
      name: "Trial School",
      status: "pending",
      trialHistory: [],
      save: vi.fn().mockResolvedValue(undefined),
    };
    session = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Tenant.findById.mockReturnValue({ session: vi.fn().mockResolvedValue(school) });
    SchoolSubscription.findOne.mockReturnValue({ session: vi.fn().mockResolvedValue(null) });
    SchoolSubscription.create.mockImplementation(async ([data]) => [{ ...data, _id: new mongoose.Types.ObjectId() }]);
    User.updateMany.mockResolvedValue({ modifiedCount: 1 });
    PlatformCommercialEvent.create.mockResolvedValue([]);
    req = {
      params: { schoolId: String(school._id) },
      auth: { userId: new mongoose.Types.ObjectId().toString() },
    };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it("starts one zero-cost 30-day trial and activates pending school administrators", async () => {
    await startSchoolTrial(req, res, next);

    const subscription = SchoolSubscription.create.mock.calls[0][0][0];
    expect(subscription).toEqual(expect.objectContaining({
      billingInterval: "trial",
      isTrial: true,
      amount: 0,
      status: "active",
    }));
    expect(subscription.trialEndsAt.getTime() - subscription.startsAt.getTime()).toBe(30 * 86400000);
    expect(school.status).toBe("active");
    expect(school.trialHistory).toHaveLength(1);
    expect(school.save).toHaveBeenCalledWith({ session });
    expect(User.updateMany).toHaveBeenCalledWith(
      { tenantId: school._id, role: "school_admin", status: "pending" },
      { $set: { status: "active" } },
      { session },
    );
    expect(PlatformCommercialEvent.create).toHaveBeenCalledWith(
      [expect.objectContaining({ action: "TRIAL_STARTED", tenantId: school._id })],
      { session },
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("prevents a school from receiving a second trial", async () => {
    school.trialStartedAt = new Date();
    school.trialHistory = [{ startedAt: new Date(), endsAt: new Date(Date.now() + 86400000) }];

    await startSchoolTrial(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "A free trial has already been used by this school",
    }));
    expect(SchoolSubscription.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("does not start a trial for a school that already has a subscription", async () => {
    SchoolSubscription.findOne.mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() }),
    });

    await startSchoolTrial(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(SchoolSubscription.create).not.toHaveBeenCalled();
  });
});
