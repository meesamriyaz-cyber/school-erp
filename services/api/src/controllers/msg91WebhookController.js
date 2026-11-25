import crypto from "node:crypto";
import GuardianCommunication from "../models/GuardianCommunication.js";

const statusMap = {
  "0": "sent", "1": "delivered", "2": "failed", "9": "failed",
  "16": "failed", "17": "failed", "20": "failed", "25": "failed",
  sent: "sent", delivered: "delivered", failed: "failed", rejected: "failed", blocked: "failed",
};

export const receiveMsg91Status = async (req, res, next) => {
  try {
    const secret = (process.env.MSG91_WEBHOOK_SECRET || "").trim();
    if (!secret && process.env.NODE_ENV === "production") {
      return res.status(503).json({ success: false, message: "MSG91 webhook secret is not configured" });
    }
    if (secret) {
      const supplied = String(req.query.token || req.get("x-msg91-webhook-secret") || "");
      const expectedBuffer = Buffer.from(secret);
      const suppliedBuffer = Buffer.from(supplied);
      if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
        return res.status(403).json({ success: false, message: "Invalid MSG91 webhook token" });
      }
    }

    const payloads = Array.isArray(req.body) ? req.body : [req.body || {}];
    let matched = 0;
    for (const payload of payloads) {
      const correlationId = String(payload.CRQID || payload.crqid || "").trim();
      const rawStatus = String(payload.status ?? payload.Status ?? "").trim().toLowerCase();
      const providerStatus = statusMap[rawStatus];
      if (!correlationId || !providerStatus) continue;
      const update = {
        "channels.$.providerStatus": providerStatus,
        "channels.$.providerErrorCode": payload.statusCode == null ? null : String(payload.statusCode).slice(0, 40),
        "channels.$.providerErrorMessage": providerStatus === "failed"
          ? String(payload.failureReason || payload.reason || "MSG91 reported delivery failure").slice(0, 240)
          : null,
        "channels.$.statusUpdatedAt": new Date(),
      };
      if (providerStatus === "delivered") update["channels.$.deliveredAt"] = new Date();
      if (providerStatus === "failed") {
        update["channels.$.status"] = "failed";
        update["channels.$.error"] = update["channels.$.providerErrorMessage"];
      }
      const result = await GuardianCommunication.updateOne(
        { channels: { $elemMatch: { providerMessageId: correlationId, providerName: "msg91" } } },
        { $set: update },
      );
      if (result.matchedCount) matched += 1;
    }
    return res.status(200).json({ success: true, matched });
  } catch (error) { return next(error); }
};
