import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  tenantAggregate,
  subscriptionFind,
  invoiceAggregate,
  paymentAggregate,
  commercialEventFind,
} = vi.hoisted(() => ({
  tenantAggregate: vi.fn(),
  subscriptionFind: vi.fn(),
  invoiceAggregate: vi.fn(),
  paymentAggregate: vi.fn(),
  commercialEventFind: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({ default: { aggregate: tenantAggregate } }));
vi.mock("../models/SchoolSubscription.js", () => ({ default: { find: subscriptionFind } }));
vi.mock("../models/PlatformInvoice.js", () => ({ default: { aggregate: invoiceAggregate } }));
vi.mock("../models/PlatformPayment.js", () => ({ default: { aggregate: paymentAggregate } }));
vi.mock("../models/PlatformCommercialEvent.js", () => ({ default: { find: commercialEventFind } }));

import { getBusinessOverview } from "../controllers/platformBillingController.js";

describe("getBusinessOverview", () => {
  let res;
  let next;
  let eventQuery;

  beforeEach(() => {
    vi.clearAllMocks();
    res = { json: vi.fn().mockReturnThis() };
    next = vi.fn();

    tenantAggregate.mockResolvedValue([
      { _id: "active", count: 3 },
      { _id: "pending", count: 1 },
      { _id: "suspended", count: 1 },
    ]);

    const now = Date.now();
    const subscriptionQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { currency: "INR", billingInterval: "monthly", amount: 1200, status: "active", nextBillingAt: new Date(now + 10 * 86400000) },
        { currency: "INR", billingInterval: "annual", amount: 12000, status: "active", nextBillingAt: new Date(now + 60 * 86400000) },
        { currency: "INR", billingInterval: "monthly", amount: 500, status: "past_due", nextBillingAt: new Date(now - 86400000) },
        { currency: "USD", billingInterval: "monthly", amount: 700, status: "pending", nextBillingAt: null },
      ]),
    };
    subscriptionFind.mockReturnValue(subscriptionQuery);

    invoiceAggregate
      .mockResolvedValueOnce([
        { _id: "INR", invoiced: 30000, outstanding: 5000, overdue: 1200, invoiceCount: 3, outstandingInvoiceCount: 2, overdueInvoiceCount: 1 },
      ])
      .mockResolvedValueOnce([{ _id: "INR", sales: 8000 }]);
    paymentAggregate.mockResolvedValue([
      { _id: "INR", collected: 25000, paymentCount: 4 },
    ]);

    eventQuery = {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { action: "PAYMENT_RECORDED", tenantId: { name: "Green Valley School" } },
      ]),
    };
    commercialEventFind.mockReturnValue(eventQuery);
  });

  it("returns school, subscription, receivables, collection and recent activity metrics", async () => {
    await getBusinessOverview({}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledOnce();

    const { data } = res.json.mock.calls[0][0];
    expect(data.schools).toEqual({
      total: 5,
      active: 3,
      byStatus: [
        { _id: "active", count: 3 },
        { _id: "pending", count: 1 },
        { _id: "suspended", count: 1 },
      ],
    });
    expect(data.subscriptionStatusCounts).toEqual({ active: 2, "past_due": 1, pending: 1 });
    expect(data.renewalsDueSoon).toBe(1);
    expect(data.subscriptions.INR).toMatchObject({
      activeSubscriptions: 2,
      pendingSubscriptions: 0,
      pastDueSubscriptions: 1,
      renewalsDueSoon: 1,
      mrr: 2200,
      arr: 26400,
      lifetimeSales: 8000,
    });
    expect(data.subscriptions.USD.pendingSubscriptions).toBe(1);
    expect(data.invoiced[0]).toMatchObject({
      invoiced: 30000,
      outstanding: 5000,
      overdue: 1200,
      invoiceCount: 3,
      outstandingInvoiceCount: 2,
      overdueInvoiceCount: 1,
    });
    expect(data.collected[0]).toMatchObject({ collected: 25000, paymentCount: 4 });
    expect(data.recentActivity[0].action).toBe("PAYMENT_RECORDED");
    expect(data.generatedAt).toBeInstanceOf(Date);
  });

  it("calculates invoice balances after recorded payments rather than treating full totals as overdue", async () => {
    await getBusinessOverview({}, res, next);

    const invoicePipeline = invoiceAggregate.mock.calls[0][0];
    const paymentLookup = invoicePipeline.find((stage) => stage.$lookup)?.$lookup;
    expect(paymentLookup.from).toBe("platformpayments");
    expect(paymentLookup.pipeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          $expr: expect.any(Object),
        }),
      }),
    ]));
    expect(invoicePipeline.some((stage) => stage.$addFields?.outstandingAmount)).toBe(true);
  });

  it("forwards unexpected aggregation errors", async () => {
    const error = new Error("Metrics database unavailable");
    tenantAggregate.mockRejectedValueOnce(error);

    await getBusinessOverview({}, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
