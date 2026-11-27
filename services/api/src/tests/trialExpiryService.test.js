import { beforeEach, describe, expect, it, vi } from "vitest";

const { tenantFind, tenantUpdateOne, subscriptionUpdateMany } = vi.hoisted(() => ({
  tenantFind: vi.fn(),
  tenantUpdateOne: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({
  default: { find: tenantFind, updateOne: tenantUpdateOne },
}));
vi.mock("../models/SchoolSubscription.js", () => ({
  default: { updateMany: subscriptionUpdateMany },
}));

import { processDueTrials } from "../services/trialExpiryService.js";

describe("trial expiry worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
    tenantUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    subscriptionUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it("expires due active trials and their active trial subscriptions", async () => {
    const now = new Date("2026-11-27T12:00:00.000Z");
    const schoolId = "school-due";
    tenantFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: schoolId }]) }) });

    const result = await processDueTrials({ now });

    expect(result).toEqual({ expired: 1, skipped: false });
    expect(tenantFind).toHaveBeenCalledWith({ status: "active", trialEndsAt: { $lte: now } });
    expect(tenantUpdateOne).toHaveBeenCalledWith(
      { _id: schoolId, status: "active", trialEndsAt: { $lte: now } },
      { $set: { status: "trial_expired", trialExpiredAt: now } },
    );
    expect(subscriptionUpdateMany).toHaveBeenCalledWith(
      { tenantId: schoolId, isTrial: true, status: "active" },
      { $set: { status: "expired" } },
    );
  });

  it("does not update a school whose trial was converted or otherwise changed before transition", async () => {
    tenantFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: "converted-school" }]) }) });
    tenantUpdateOne.mockResolvedValueOnce({ modifiedCount: 0 });

    const result = await processDueTrials({ now: new Date("2026-11-27T12:00:00.000Z") });

    expect(result).toEqual({ expired: 0, skipped: false });
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it("is repeat-safe when no active trials are due", async () => {
    const result = await processDueTrials({ now: new Date("2026-11-27T12:00:00.000Z") });
    expect(result).toEqual({ expired: 0, skipped: false });
    expect(tenantUpdateOne).not.toHaveBeenCalled();
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });
});
