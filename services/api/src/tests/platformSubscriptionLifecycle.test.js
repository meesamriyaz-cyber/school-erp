import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/Tenant.js", () => ({ default: { updateOne: vi.fn() } }));
vi.mock("../models/User.js", () => ({ default: {} }));
vi.mock("../models/SubscriptionPlan.js", () => ({ default: {} }));
vi.mock("../models/SchoolSubscription.js", () => ({ default: { findOne: vi.fn(), updateMany: vi.fn() } }));
vi.mock("../models/PlatformInvoice.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/PlatformPayment.js", () => ({ default: { findOne: vi.fn(), aggregate: vi.fn(), create: vi.fn() } }));
vi.mock("../models/PlatformCommercialEvent.js", () => ({ default: { create: vi.fn() } }));

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
    expect(subscription.save).toHaveBeenCalledWith({ session });
  });
});
