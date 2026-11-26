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
    const delivery = await sendGuardianChannel({
      channel: "email",
      guardianId: guardian._id,
      recipient: email,
      subject: "Verify your email address",
      message: `Your Payam Education verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
    });

    // Update only verification fields. Legacy guardian records may contain
    // phone values in older formats; document.save() would revalidate those
    // unrelated fields and could fail after Resend has already sent the email.
    const update = await Guardian.updateOne(
      { _id: guardian._id, tenantId: req.tenantId, status: "active" },
      {
        $set: {
          pendingEmail: email,
          emailDeliveryEmailId: delivery.messageId,
          emailDeliveryStatus: delivery.providerStatus || "accepted",
          emailDeliveryUpdatedAt: new Date(),
          emailDeliveryEvents: [],
          emailOtpSalt: salt,
          emailOtpHash: otpDigest(salt, code),
          emailOtpExpiresAt: new Date(Date.now() + 10 * 60_000),
          emailOtpSentAt: new Date(),
          emailOtpAttempts: 0,
        },
      },
    );
    if (!update.matchedCount) {
      return res.status(404).json({ success: false, message: "Guardian not found" });
    }
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
      await Guardian.updateOne(
        { _id: guardian._id, tenantId: req.tenantId, status: "active" },
        { $inc: { emailOtpAttempts: 1 } },
      );
      return res.status(400).json({ success: false, message: "The code is incorrect" });
    }

    const verifiedEmail = guardian.pendingEmail;
    const emailVerifiedAt = new Date();
    const update = await Guardian.updateOne(
      {
        _id: guardian._id,
        tenantId: req.tenantId,
        status: "active",
        pendingEmail: verifiedEmail,
        emailOtpHash: guardian.emailOtpHash,
      },
      {
        $set: {
          email: verifiedEmail,
          verifiedEmail,
          emailVerifiedAt,
          emailOtpAttempts: 0,
        },
        $unset: {
          pendingEmail: 1,
          emailOtpHash: 1,
          emailOtpSalt: 1,
          emailOtpExpiresAt: 1,
          emailOtpSentAt: 1,
        },
      },
    );
    if (!update.modifiedCount) {
      return res.status(409).json({ success: false, message: "Verification code is no longer active. Request a new code." });
    }
    return res.status(200).json({ success: true, data: { email: verifiedEmail, emailVerified: true, emailVerifiedAt } });
  } catch (error) { return next(error); }
};
