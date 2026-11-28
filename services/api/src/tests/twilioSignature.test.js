import { describe, expect, it } from "vitest";
import { buildTwilioSignature, isValidTwilioSignature } from "../utils/twilioSignature.js";

describe("Twilio webhook signature", () => {
  const url = "https://school.example.com/api/v1/webhooks/twilio/status";
  const params = { MessageSid: "SM123", MessageStatus: "delivered", To: "+919876543210" };
  const authToken = "test-auth-token";

  it("validates a signature built from the callback URL and sorted form parameters", () => {
    const signature = buildTwilioSignature(url, params, authToken);
    expect(isValidTwilioSignature({ url, params, signature, authToken })).toBe(true);
  });

  it("rejects a modified payload", () => {
    const signature = buildTwilioSignature(url, params, authToken);
    expect(isValidTwilioSignature({
      url, params: { ...params, MessageStatus: "failed" }, signature, authToken,
    })).toBe(false);
  });

  it("rejects missing signature configuration", () => {
    expect(isValidTwilioSignature({ url, params, signature: "", authToken })).toBe(false);
  });
});
