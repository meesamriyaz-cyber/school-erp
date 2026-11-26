import crypto from "node:crypto";
import mongoose from "mongoose";
import Guardian from "../models/Guardian.js";
import { sendGuardianChannel } from "../services/guardianCommunicationService.js";

const invalid = (res, message) => res.status(400).json({ success: false, message });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const otpDigest = (salt, code) => crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");

export const sendGuardianEmailCode = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.guardianId)) return invalid(res, "Invalid guardian ID");
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!emailPattern.test(email) || email.length > 254) return invalid(res, "Enter a valid email address");
    const guardian = await Guardian.findOne({ _id: req.params.guardianId, tenantId: req.tenantId, status: "active" })
      .select("+emailOtpSentAt +emailOtpAttempts");
    if (!guardian) return res.status(404).json({ success: false, message: "Guardian not found" });
    if (guardian.emailOtpSentAt && Date.now() - guardian.emailOtpSentAt.getTime() < 60_000) {
      return res.status(429).json({ success: false, message: "Wait 60 seconds before requesting another code" });
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const salt = crypto.randomBytes(16).toString("hex");
    await sendGuardianChannel({
      channel: "email",
      recipient: email,
      subject: "Verify your email address",
      message: `Your Payam Education verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
    });

    guardian.pendingEmail = email;
    guardian.emailOtpSalt = salt;
    guardian.emailOtpHash = otpDigest(salt, code);
    guardian.emailOtpExpiresAt = new Date(Date.now() + 10 * 60_000);
    guardian.emailOtpSentAt = new Date();
    guardian.emailOtpAttempts = 0;
    await guardian.save();
    return res.status(200).json({ success: true, message: "Email verification code sent" });
  } catch (error) { return next(error); }
};

export const verifyGuardianEmailCode = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.guardianId)) return invalid(res, "Invalid guardian ID");
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return invalid(res, "Enter the six-digit verification code");
    const guardian = await Guardian.findOne({ _id: req.params.guardianId, tenantId: req.tenantId, status: "active" })
      .select("+emailOtpHash +emailOtpSalt +emailOtpExpiresAt +emailOtpAttempts");
    if (!guardian) return res.status(404).json({ success: false, message: "Guardian not found" });
    if (!guardian.pendingEmail || !guardian.emailOtpHash || !guardian.emailOtpSalt) {
      return res.status(409).json({ success: false, message: "Request a new email verification code first" });
    }
    if (!guardian.emailOtpExpiresAt || guardian.emailOtpExpiresAt.getTime() <= Date.now()) {
      return res.status(410).json({ success: false, message: "The verification code has expired. Request a new one." });
    }
    if ((guardian.emailOtpAttempts || 0) >= 5) {
      return res.status(429).json({ success: false, message: "Too many incorrect codes. Request a new code." });
    }

    const expected = Buffer.from(guardian.emailOtpHash, "hex");
    const actual = Buffer.from(otpDigest(guardian.emailOtpSalt, code), "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      guardian.emailOtpAttempts = (guardian.emailOtpAttempts || 0) + 1;
      await guardian.save();
      return res.status(400).json({ success: false, message: "The code is incorrect" });
    }

    guardian.email = guardian.pendingEmail;
    guardian.verifiedEmail = guardian.pendingEmail;
    guardian.emailVerifiedAt = new Date();
    guardian.pendingEmail = null;
    guardian.emailOtpHash = null;
    guardian.emailOtpSalt = null;
    guardian.emailOtpExpiresAt = null;
    guardian.emailOtpSentAt = null;
    guardian.emailOtpAttempts = 0;
    await guardian.save();
    return res.status(200).json({ success: true, data: { email: guardian.email, emailVerified: true, emailVerifiedAt: guardian.emailVerifiedAt } });
  } catch (error) { return next(error); }
};
