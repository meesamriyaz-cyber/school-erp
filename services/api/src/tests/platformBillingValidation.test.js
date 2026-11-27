import mongoose from "mongoose";
import PlatformInvoice from "../models/PlatformInvoice.js";
import PlatformPayment from "../models/PlatformPayment.js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/Tenant.js", () => ({ default: {} }));
vi.mock("../models/User.js", () => ({ default: {} }));
vi.mock("../models/SubscriptionPlan.js", () => ({ default: {} }));
vi.mock("../models/SchoolSubscription.js", () => ({ default: {} }));
vi.mock("../models/PlatformInvoice.js", () => ({ default: { find: vi.fn(), countDocuments: vi.fn() } }));
vi.mock("../models/PlatformPayment.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/PlatformCommercialEvent.js", () => ({ default: {} }));

import {
  assignSchoolSubscription,
  listCommercialEvents,
  listPlatformInvoices,
  recordPlatformPayment,
} from "../controllers/platformBillingController.js";

const validId = "507f1f77bcf86cd799439011";

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function sessionStub() {
  return { withTransaction: vi.fn(), endSession: vi.fn().mockResolvedValue(undefined) };
}

describe("platform billing request validation", () => {
  let session;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid payment dates before starting a transaction", async () => {
    session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const res = response();
    const next = vi.fn();

    await recordPlatformPayment({
      params: { invoiceId: validId },
      body: { amount: 25, method: "upi", paymentDate: "not-a-date" },
      auth: { userId: validId },
    }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Payment date must be a valid date" });
    expect(session.withTransaction).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects payment references and notes that exceed model limits", async () => {
    session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const res = response();
    const next = vi.fn();

    await recordPlatformPayment({
      params: { invoiceId: validId },
      body: { amount: 25, method: "upi", reference: "x".repeat(121) },
      auth: { userId: validId },
    }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Payment reference must be 120 characters or fewer" });
    expect(session.withTransaction).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    [{ page: "0" }, "Page must be a positive integer"],
    [{ page: "1.5" }, "Page must be a positive integer"],
    [{ limit: "101" }, "Limit must be between 1 and 100"],
    [{ limit: "nope" }, "Limit must be between 1 and 100"],
    [{ action: "UNKNOWN_EVENT" }, "Invalid commercial event action"],
  ])("rejects invalid commercial event query values %#", async (query, message) => {
    const res = response();
    const next = vi.fn();

    await listCommercialEvents({ query }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    [{ page: "0" }, "Page must be a positive integer"],
    [{ page: "2.5" }, "Page must be a positive integer"],
    [{ limit: "101" }, "Limit must be between 1 and 100"],
    [{ limit: "invalid" }, "Limit must be between 1 and 100"],
  ])("rejects invalid invoice pagination values %#", async (query, message) => {
    const res = response();
    const next = vi.fn();

    await listPlatformInvoices({ query }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns invoice payment history with reversed payments excluded from balances", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const invoice = { _id: invoiceId, totalAmount: 100, tenantId: validId };
    const recordedPayment = { _id: new mongoose.Types.ObjectId(), invoiceId, amount: 40, status: "recorded" };
    const reversedPayment = { _id: new mongoose.Types.ObjectId(), invoiceId, amount: 20, status: "reversed" };
    const invoiceQuery = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([invoice]),
    };
    const paymentQuery = {
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([recordedPayment, reversedPayment]),
    };
    PlatformInvoice.find.mockReturnValue(invoiceQuery);
    PlatformInvoice.countDocuments.mockResolvedValue(1);
    PlatformPayment.find.mockReturnValue(paymentQuery);
    const res = response();

    await listPlatformInvoices({ query: { page: "1", limit: "20" } }, res, vi.fn());

    expect(paymentQuery.sort).toHaveBeenCalledWith({ paymentDate: -1, _id: -1 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        payments: [recordedPayment, reversedPayment],
        paidAmount: 40,
        outstandingAmount: 60,
      })],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }));
  });

  it("rejects an invalid invoice due date before querying billing records", async () => {
    session = sessionStub();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const res = response();
    const next = vi.fn();

    await assignSchoolSubscription({
      params: { schoolId: validId },
      body: { planId: validId, dueAt: "not-a-date" },
      auth: { userId: validId },
    }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Invoice due date must be a valid date" });
    expect(session.withTransaction).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
