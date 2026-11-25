import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock("../models/GuardianCommunication.js", () => ({
  default: { updateOne: mocks.updateOne },
}));

import { receiveMsg91Status } from "../controllers/msg91WebhookController.js";

function makeResponse() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe("MSG91 delivery status webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MSG91_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("updates the matching SMS channel when MSG91 confirms delivery", async () => {
    const req = {
      query: { token: "test-webhook-secret" },
      get: () => undefined,
      body: { CRQID: "school-erp-correlation-id", status: "1", telNum: "919876543210" },
    };
    const res = makeResponse();
    await receiveMsg91Status(req, res, vi.fn());

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { channels: { $elemMatch: { providerMessageId: "school-erp-correlation-id", providerName: "msg91" } } },
      { $set: expect.objectContaining({
        "channels.$.providerStatus": "delivered",
        "channels.$.deliveredAt": expect.any(Date),
      }) },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a callback with the wrong shared token", async () => {
    const req = { query: { token: "wrong" }, get: () => undefined, body: { CRQID: "x", status: "1" } };
    const res = makeResponse();
    await receiveMsg91Status(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("marks rejected delivery as failed and stores the provider reason", async () => {
    const req = {
      query: { token: "test-webhook-secret" },
      get: () => undefined,
      body: { CRQID: "school-erp-correlation-id", status: "2", failureReason: "Invalid destination" },
    };
    const res = makeResponse();
    await receiveMsg91Status(req, res, vi.fn());
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { channels: { $elemMatch: { providerMessageId: "school-erp-correlation-id", providerName: "msg91" } } },
      { $set: expect.objectContaining({
        "channels.$.providerStatus": "failed",
        "channels.$.status": "failed",
        "channels.$.error": "Invalid destination",
      }) },
    );
  });
});
