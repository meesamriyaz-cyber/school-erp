import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/Tenant.js", () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../models/User.js", () => ({ default: { updateMany: vi.fn() } }));
vi.mock("../models/Session.js", () => ({ default: { updateMany: vi.fn() } }));
vi.mock("../models/SubscriptionPlan.js", () => ({ default: {} }));
vi.mock("../models/SchoolSubscription.js", () => ({ default: { findOne: vi.fn(), updateMany: vi.fn() } }));
vi.mock("../models/PlatformInvoice.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/PlatformPayment.js", () => ({ default: { findOne: vi.fn(), aggregate: vi.fn(), create: vi.fn() } }));
vi.mock("../models/PlatformCommercialEvent.js", () => ({ default: { create: vi.fn() } }));

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import SchoolSubscription from "../models/SchoolSubscription.js";
import PlatformInvoice from "../models/PlatformInvoice.js";
import PlatformPayment from "../models/PlatformPayment.js";
import PlatformCommercialEvent from "../models/PlatformCommercialEvent.js";
import { recordPlatformPayment, reversePlatformPayment } from "../controllers/platformBillingController.js";

const id = () => new mongoose.Types.ObjectId();
const date = value => new Date(value);

function sessionStub() {
  return {
    withTransaction: vi.fn(async callback => callback()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
}
function query(value) {
  return { session: vi.fn().mockResolvedValue(value) };
}
function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe("platform subscription payment lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not downgrade a newer paid period when an older invoice payment is reversed", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const subscription = {
      _id: id(), tenantId, billingInterval: "monthly", status: "active",
      currentPeriodStartsAt: date("2026-11-01T00:00:00Z"),
      currentPeriodEndsAt: date("2026-12-01T00:00:00Z"),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const invoice = {
      _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100,
      billingPeriodStartsAt: date("2026-10-01T00:00:00Z"),
      billingPeriodEndsAt: date("2026-11-01T00:00:00Z"),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const payment = {
      _id: id(), tenantId, invoiceId: invoice._id, amount: 100, status: "recorded",
      save: vi.fn().mockResolvedValue(undefined),
    };
    PlatformPayment.findOne.mockReturnValue(query(payment));
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
    Tenant.findById.mockReturnValue(query({ _id: tenantId, status: "active" }));

    const res = response();
    await reversePlatformPayment({
      params: { paymentId: payment._id.toString() },
      body: { reason: "Reversal of duplicate collection" },
      auth: { userId: id().toString() },
    }, res, vi.fn());

    expect(subscription.status).toBe("active");
    expect(subscription.save).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("marks a matching current recurring period past due when its payment is reversed", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const startsAt = date("2026-11-01T00:00:00Z");
    const endsAt = date("2026-12-01T00:00:00Z");
    const subscription = {
      _id: id(), tenantId, billingInterval: "monthly", status: "active",
      currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const invoice = {
      _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100,
      billingPeriodStartsAt: startsAt, billingPeriodEndsAt: endsAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const payment = {
      _id: id(), tenantId, invoiceId: invoice._id, amount: 100, status: "recorded",
      save: vi.fn().mockResolvedValue(undefined),
    };
    PlatformPayment.findOne.mockReturnValue(query(payment));
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    PlatformCommercialEvent.create.mockResolvedValue(undefined);

    await reversePlatformPayment({
      params: { paymentId: payment._id.toString() },
      body: { reason: "Charge reversed" },
      auth: { userId: id().toString() },
    }, response(), vi.fn());

    expect(subscription.status).toBe("past_due");
    expect(subscription.pastDueSince).toBeInstanceOf(Date);
    expect(subscription.graceEndsAt.getTime() - subscription.pastDueSince.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(subscription.graceExpiredAt).toBeNull();
    expect(subscription.save).toHaveBeenCalledWith({ session });
  });

  it("advances a renewal period once and does not advance it again after a replacement payment", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const startsAt = date("2026-10-01T00:00:00Z");
    const endsAt = date("2026-11-01T00:00:00Z");
    const subscription = {
      _id: id(), tenantId, billingInterval: "monthly", status: "past_due",
      currentPeriodStartsAt: date("2026-09-01T00:00:00Z"), currentPeriodEndsAt: startsAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const invoice = {
      _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100,
      status: "issued", notes: "Automated subscription renewal",
      issuedAt: startsAt, billingPeriodStartsAt: startsAt, billingPeriodEndsAt: endsAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    PlatformPayment.create.mockResolvedValue([{ _id: id(), amount: 100 }]);
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    SchoolSubscription.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
    Tenant.findById.mockReturnValue(query({ _id: tenantId, status: "active" }));
    const req = {
      params: { invoiceId: invoice._id.toString() },
      body: { amount: 100, method: "upi" },
      auth: { userId: id().toString() },
    };

    await recordPlatformPayment(req, response(), vi.fn());
    expect(subscription.currentPeriodStartsAt).toEqual(startsAt);
    expect(subscription.currentPeriodEndsAt).toEqual(endsAt);
    expect(subscription.status).toBe("active");

    subscription.status = "past_due";
    invoice.status = "issued";
    subscription.save.mockClear();
    await recordPlatformPayment(req, response(), vi.fn());

    expect(subscription.currentPeriodStartsAt).toEqual(startsAt);
    expect(subscription.currentPeriodEndsAt).toEqual(endsAt);
    expect(subscription.save).toHaveBeenCalledWith({ session });
  });
  it("invalidates existing credentials when payment reactivates a trial-expired school", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const subscription = { _id: id(), tenantId, billingInterval: "monthly", status: "pending", currentPeriodStartsAt: date("2026-11-28T00:00:00Z"), currentPeriodEndsAt: date("2026-12-28T00:00:00Z"), save: vi.fn().mockResolvedValue(undefined) };
    const invoice = { _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100, status: "issued", save: vi.fn().mockResolvedValue(undefined) };
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    PlatformPayment.create.mockResolvedValue([{ _id: id(), amount: 100 }]);
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    SchoolSubscription.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
    Tenant.findById.mockReturnValue(query({ _id: tenantId, status: "trial_expired" }));
    Tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await recordPlatformPayment({ params: { invoiceId: invoice._id.toString() }, body: { amount: 100, method: "upi" }, auth: { userId: id().toString() } }, response(), vi.fn());

    expect(User.updateMany).toHaveBeenCalledWith({ tenantId }, { $inc: { authVersion: 1 } }, { session });
    expect(Session.updateMany).toHaveBeenCalledWith({ tenantId, revokedAt: null }, { $set: { revokedAt: expect.any(Date) } }, { session });
    expect(Tenant.updateOne).toHaveBeenCalledWith(
      { _id: tenantId, $or: [{ status: { $in: ["pending", "active", "trial_expired"] } }, { status: "suspended", subscriptionSuspendedAt: { $ne: null } }] },
      { $set: { status: "active", trialEndsAt: null, trialExpiredAt: null, subscriptionSuspendedAt: null, suspensionReason: null } },
      { session },
    );
  });

  it("does not invalidate credentials for a school that was already active", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const subscription = { _id: id(), tenantId, billingInterval: "monthly", status: "pending", currentPeriodStartsAt: date("2026-11-28T00:00:00Z"), currentPeriodEndsAt: date("2026-12-28T00:00:00Z"), save: vi.fn().mockResolvedValue(undefined) };
    const invoice = { _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100, status: "issued", save: vi.fn().mockResolvedValue(undefined) };
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    PlatformPayment.create.mockResolvedValue([{ _id: id(), amount: 100 }]);
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    SchoolSubscription.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
    Tenant.findById.mockReturnValue(query({ _id: tenantId, status: "active" }));
    Tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await recordPlatformPayment({ params: { invoiceId: invoice._id.toString() }, body: { amount: 100, method: "upi" }, auth: { userId: id().toString() } }, response(), vi.fn());

    expect(User.updateMany).not.toHaveBeenCalled();
    expect(Session.updateMany).not.toHaveBeenCalled();
  });


  it("reactivates a school suspended by grace expiry when its overdue invoice is paid late", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const startsAt = date("2026-10-01T00:00:00Z");
    const endsAt = date("2026-11-01T00:00:00Z");
    const subscription = {
      _id: id(), tenantId, billingInterval: "monthly", status: "expired",
      graceExpiredAt: date("2026-11-08T00:00:00Z"),
      pastDueSince: date("2026-11-01T00:00:00Z"),
      graceEndsAt: date("2026-11-08T00:00:00Z"),
      currentPeriodStartsAt: date("2026-09-01T00:00:00Z"),
      currentPeriodEndsAt: startsAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const invoice = {
      _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100,
      status: "issued", billingPeriodStartsAt: startsAt, billingPeriodEndsAt: endsAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    PlatformPayment.create.mockResolvedValue([{ _id: id(), amount: 100 }]);
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    SchoolSubscription.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
    Tenant.findById.mockReturnValue(query({
      _id: tenantId, status: "suspended", subscriptionSuspendedAt: date("2026-11-08T00:00:00Z"),
    }));
    Tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = response();
    await recordPlatformPayment({
      params: { invoiceId: invoice._id.toString() },
      body: { amount: 100, method: "upi" },
      auth: { userId: id().toString() },
    }, res, vi.fn());

    expect(subscription.status).toBe("active");
    expect(subscription.pastDueSince).toBeNull();
    expect(subscription.graceEndsAt).toBeNull();
    expect(subscription.graceExpiredAt).toBeNull();
    expect(User.updateMany).toHaveBeenCalledWith({ tenantId }, { $inc: { authVersion: 1 } }, { session });
    expect(Session.updateMany).toHaveBeenCalledWith({ tenantId, revokedAt: null }, { $set: { revokedAt: expect.any(Date) } }, { session });
    expect(Tenant.updateOne).toHaveBeenCalledWith(
      { _id: tenantId, $or: [{ status: { $in: ["pending", "active", "trial_expired"] } }, { status: "suspended", subscriptionSuspendedAt: { $ne: null } }] },
      { $set: { status: "active", trialEndsAt: null, trialExpiredAt: null, subscriptionSuspendedAt: null, suspensionReason: null } },
      { session },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("does not automatically reactivate a manually suspended school when an invoice is paid", async () => {
    const session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const tenantId = id();
    const subscription = {
      _id: id(), tenantId, billingInterval: "monthly", status: "past_due",
      currentPeriodStartsAt: date("2026-10-01T00:00:00Z"),
      currentPeriodEndsAt: date("2026-11-01T00:00:00Z"),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const invoice = {
      _id: id(), tenantId, subscriptionId: subscription._id, totalAmount: 100, status: "issued",
      save: vi.fn().mockResolvedValue(undefined),
    };
    PlatformInvoice.findById.mockReturnValue(query(invoice));
    PlatformPayment.aggregate.mockReturnValue({ session: vi.fn().mockResolvedValue([{ total: 0 }]) });
    PlatformPayment.create.mockResolvedValue([{ _id: id(), amount: 100 }]);
    SchoolSubscription.findOne.mockReturnValue(query(subscription));
    SchoolSubscription.updateMany.mockResolvedValue({ modifiedCount: 0 });
    PlatformCommercialEvent.create.mockResolvedValue(undefined);
    Tenant.findById.mockReturnValue(query({ _id: tenantId, status: "suspended", subscriptionSuspendedAt: null }));
    Tenant.updateOne.mockResolvedValue({ modifiedCount: 0 });

    await recordPlatformPayment({
      params: { invoiceId: invoice._id.toString() },
      body: { amount: 100, method: "upi" },
      auth: { userId: id().toString() },
    }, response(), vi.fn());

    expect(subscription.status).toBe("active");
    expect(Tenant.updateOne).toHaveBeenCalled();
    expect(User.updateMany).not.toHaveBeenCalled();
    expect(Session.updateMany).not.toHaveBeenCalled();
  });

});
