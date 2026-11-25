import GuardianCommunication from "../models/GuardianCommunication.js";
import { isValidTwilioSignature } from "../utils/twilioSignature.js";

const terminalFailureStatuses = new Set(["failed", "undelivered"]);
const validStatuses = new Set(["accepted", "queued", "sending", "sent", "delivered", "undelivered", "failed", "canceled", "read"]);

export const receiveTwilioStatus = async (req, res, next) => {
  try {
    const callbackUrl = (process.env.TWILIO_STATUS_CALLBACK_URL || "").trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
    const signature = req.get("X-Twilio-Signature");
    if (!callbackUrl || !authToken || !isValidTwilioSignature({
      url: callbackUrl, params: req.body, signature, authToken,
    })) {
      return res.status(403).json({ success: false, message: "Invalid Twilio webhook signature" });
    }

    const expectedAccountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
    if (expectedAccountSid && req.body.AccountSid !== expectedAccountSid) {
      return res.status(403).json({ success: false, message: "Unexpected Twilio account" });
    }

    const messageSid = String(req.body.MessageSid || "").trim();
    const providerStatus = String(req.body.MessageStatus || req.body.SmsStatus || "").toLowerCase();
    if (!/^(SM|MM)[a-fA-F0-9]{32}$/.test(messageSid) || !validStatuses.has(providerStatus)) {
      return res.status(400).json({ success: false, message: "Invalid Twilio status callback payload" });
    }

    const update = {
      "channels.$.providerStatus": providerStatus,
      "channels.$.providerErrorCode": req.body.ErrorCode ? String(req.body.ErrorCode).slice(0, 40) : null,
      "channels.$.providerErrorMessage": req.body.ErrorMessage ? String(req.body.ErrorMessage).slice(0, 240) : null,
      "channels.$.statusUpdatedAt": new Date(),
    };
    if (providerStatus === "delivered") update["channels.$.deliveredAt"] = new Date();
    if (terminalFailureStatuses.has(providerStatus)) {
      update["channels.$.status"] = "failed";
      update["channels.$.error"] = req.body.ErrorMessage
        ? String(req.body.ErrorMessage).slice(0, 240)
        : `Twilio reported ${providerStatus}`;
    }

    const result = await GuardianCommunication.updateOne(
      { "channels.providerMessageId": messageSid },
      { $set: update },
    );
    // Acknowledge unknown SIDs so unrelated Twilio messages are not retried.
    return res.status(200).json({ success: true, matched: result.matchedCount > 0 });
  } catch (error) { return next(error); }
};
