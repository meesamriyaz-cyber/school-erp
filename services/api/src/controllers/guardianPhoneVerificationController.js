import mongoose from "mongoose";
import Guardian from "../models/Guardian.js";

const e164 = /^\+[1-9]\d{7,14}$/;
const invalid = (res, message) => res.status(400).json({ success: false, message });
const config = () => ({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
});
const twilioRequest = async (path, params) => {
  const { accountSid, authToken, serviceSid } = config();
  if (!accountSid || !authToken || !serviceSid) {
    const error = new Error("Phone verification is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Twilio could not process the phone verification request.");
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }
  return payload;
};

export const sendGuardianPhoneCode = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.guardianId)) return invalid(res, "Invalid guardian ID");
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    if (!e164.test(phone)) return invalid(res, "Enter the phone number in international E.164 format, for example +14155552671");
    const guardian = await Guardian.findOne({ _id: req.params.guardianId, tenantId: req.tenantId, status: "active" });
    if (!guardian) return res.status(404).json({ success: false, message: "Guardian not found" });
    await twilioRequest("Verifications", { To: phone, Channel: "sms" });
    guardian.pendingPhone = phone;
    await guardian.save();
    return res.status(200).json({ success: true, message: "Verification code sent. The saved contact number will not change until the code is approved." });
  } catch (error) { return next(error); }
};

export const verifyGuardianPhoneCode = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.guardianId)) return invalid(res, "Invalid guardian ID");
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{4,10}$/.test(code)) return invalid(res, "Enter the verification code");
    const guardian = await Guardian.findOne({ _id: req.params.guardianId, tenantId: req.tenantId, status: "active" });
    if (!guardian) return res.status(404).json({ success: false, message: "Guardian not found" });
    if (!guardian.pendingPhone || !e164.test(guardian.pendingPhone)) return res.status(409).json({ success: false, message: "Send a verification code to the new number first" });
    const result = await twilioRequest("VerificationCheck", { To: guardian.pendingPhone, Code: code });
    if (result.status !== "approved") return res.status(400).json({ success: false, message: "The code is invalid or has expired." });
    guardian.phone = guardian.pendingPhone;
    guardian.verifiedPhone = guardian.pendingPhone;
    guardian.phoneVerifiedAt = new Date();
    guardian.pendingPhone = null;
    await guardian.save();
    return res.status(200).json({ success: true, data: { phone: guardian.phone, phoneVerified: true, phoneVerifiedAt: guardian.phoneVerifiedAt } });
  } catch (error) { return next(error); }
};
