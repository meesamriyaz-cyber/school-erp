import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import SchoolSubscription from "../models/SchoolSubscription.js";

describe("SchoolSubscription billing term validation", () => {
  it("preserves cancelledAt for a cancelled lifetime subscription", async () => {
    const cancelledAt = new Date("2026-11-27T10:00:00.000Z");
    const subscription = new SchoolSubscription({
      tenantId: new mongoose.Types.ObjectId(),
      planId: new mongoose.Types.ObjectId(),
      planName: "Lifetime",
      billingInterval: "one_time",
      amount: 5000,
      currency: "INR",
      status: "cancelled",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      cancelledAt,
      createdBy: new mongoose.Types.ObjectId(),
    });

    await subscription.validate();

    expect(subscription.lifetimeAccess).toBe(true);
    expect(subscription.cancelledAt).toEqual(cancelledAt);
    expect(subscription.currentPeriodEndsAt).toBeNull();
    expect(subscription.nextBillingAt).toBeNull();
  });
});
