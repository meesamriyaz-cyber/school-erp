import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  tenantAggregate,
  tenantFind,
  subscriptionAggregate,
  invoiceAggregate,
  paymentAggregate,
  commercialEventFind,
} = vi.hoisted(() => ({
  tenantAggregate: vi.fn(),
  tenantFind: vi.fn(),
  subscriptionAggregate: vi.fn(),
  invoiceAggregate: vi.fn(),
  paymentAggregate: vi.fn(),
  commercialEventFind: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({ default: { aggregate: tenantAggregate, find: tenantFind } }));
vi.mock("../models/SchoolSubscription.js", () => ({ default: { aggregate: subscriptionAggregate } }));
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

    tenantFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    tenantAggregate.mockResolvedValue([
      { _id: "active", count: 3 },
      { _id: "pending", count: 1 },
      { _id: "suspended", count: 1 },
    ]);

    subscriptionAggregate.mockResolvedValue([
      { _id: { currency: "INR", billingInterval: "monthly", status: "active" }, count: 1, amount: 1200, renewalsDueSoon: 1 },
      { _id: { currency: "INR", billingInterval: "annual", status: "active" }, count: 1, amount: 12000, renewalsDueSoon: 0 },
      { _id: { currency: "INR", billingInterval: "monthly", status: "past_due" }, count: 1, amount: 500, renewalsDueSoon: 0 },
      { _id: { currency: "USD", billingInterval: "monthly", status: "pending" }, count: 1, amount: 700, renewalsDueSoon: 0 },
    ]);

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

  it("returns school, subscription, receivables, collection and recent activity metrics without querying or mutating trial records", async () => {
    await getBusinessOverview({}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(tenantFind).not.toHaveBeenCalled();
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
