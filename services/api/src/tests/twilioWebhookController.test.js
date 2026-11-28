import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock("../models/GuardianCommunication.js", () => ({
  default: { updateOne: mocks.updateOne },
}));

import { receiveTwilioStatus } from "../controllers/twilioWebhookController.js";
import { buildTwilioSignature } from "../utils/twilioSignature.js";

const callbackUrl = "https://school.example.com/api/v1/webhooks/twilio/status";
const authToken = "test-auth-token";
const accountSid = "AC" + "a".repeat(32);
const messageSid = "SM" + "b".repeat(32);

function makeRequest(overrides = {}) {
  const body = {
    AccountSid: accountSid,
    MessageSid: messageSid,
    MessageStatus: "delivered",
    To: "+919876543210",
    ...overrides,
  };
  return {
    body,
    get: (name) => name === "X-Twilio-Signature"
      ? buildTwilioSignature(callbackUrl, body, authToken)
      : undefined,
  };
}

function makeResponse() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe("Twilio delivery status webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_STATUS_CALLBACK_URL = callbackUrl;
    process.env.TWILIO_AUTH_TOKEN = authToken;
    process.env.TWILIO_ACCOUNT_SID = accountSid;
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("updates the matching channel when Twilio confirms delivery", async () => {
    const req = makeRequest();
    const res = makeResponse();
    await receiveTwilioStatus(req, res, vi.fn());

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { "channels.providerMessageId": messageSid },
      { $set: expect.objectContaining({
        "channels.$.providerStatus": "delivered",
        "channels.$.deliveredAt": expect.any(Date),
      }) },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects callbacks with an invalid signature", async () => {
    const req = makeRequest();
    req.get = () => "invalid";
    const res = makeResponse();
    await receiveTwilioStatus(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("marks failed provider delivery and preserves the provider error", async () => {
    const req = makeRequest({ MessageStatus: "undelivered", ErrorCode: "30003", ErrorMessage: "Unreachable destination" });
    const res = makeResponse();
    await receiveTwilioStatus(req, res, vi.fn());

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { "channels.providerMessageId": messageSid },
      { $set: expect.objectContaining({
        "channels.$.providerStatus": "undelivered",
        "channels.$.status": "failed",
        "channels.$.providerErrorCode": "30003",
        "channels.$.error": "Unreachable destination",
      }) },
    );
  });
});
