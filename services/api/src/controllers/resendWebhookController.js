import crypto from "node:crypto";
import Guardian from "../models/Guardian.js";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const DELIVERY_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
]);

function verifyResendSignature(req) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret.startsWith("whsec_")) return false;
  const id = req.get("svix-id");
  const timestamp = req.get("svix-timestamp");
  const signatures = req.get("svix-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  let key;
  try { key = Buffer.from(secret.slice(6), "base64"); } catch { return false; }
  if (!key.length || !Buffer.isBuffer(req.body)) return false;
  const signedContent = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`),
    req.body,
  ]);
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export const receiveResendWebhook = async (req, res) => {
  if (!verifyResendSignature(req)) {
    return res.status(401).json({ success: false, message: "Invalid webhook signature" });
  }

  let event;
  try { event = JSON.parse(req.body.toString("utf8")); } catch {
    return res.status(400).json({ success: false, message: "Invalid webhook JSON" });
  }
  const eventId = event?.id || req.get("svix-id");
  if (!eventId || !DELIVERY_EVENTS.has(event.type)) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const data = event.data || {};
  const emailId = data.email_id || data.id;
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const guardianTag = tags.find((tag) => tag?.name === "guardian_id")?.value;
  if (!emailId) return res.status(200).json({ success: true, ignored: true });

  const occurredAt = event.created_at ? new Date(event.created_at) : new Date();
  const filter = guardianTag
    ? { _id: guardianTag }
    : { emailDeliveryEmailId: emailId };

  const guardian = await Guardian.findOne(filter);
  if (!guardian) return res.status(200).json({ success: true, ignored: true });

  // Reject events for an older OTP email; tags allow the initial event to race
  // safely with the post-send save that records emailDeliveryEmailId.
  if (guardian.emailDeliveryEmailId && guardian.emailDeliveryEmailId !== emailId) {
    return res.status(200).json({ success: true, ignored: true });
  }
  if (guardian.emailDeliveryEvents?.some((item) => item.eventId === eventId)) {
    return res.status(200).json({ success: true, duplicate: true });
  }

  guardian.emailDeliveryEmailId = emailId;
  guardian.emailDeliveryStatus = event.type;
  guardian.emailDeliveryUpdatedAt = occurredAt;
  guardian.emailDeliveryEvents = [
    ...(guardian.emailDeliveryEvents || []).slice(-19),
    { eventId, type: event.type, occurredAt },
  ];
  await guardian.save();

  return res.status(200).json({ success: true });
};
