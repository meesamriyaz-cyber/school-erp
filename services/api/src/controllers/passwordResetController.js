import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import Student from "../models/Student.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Guardian from "../models/Guardian.js";
import PasswordReset from "../models/PasswordReset.js";
import { hashPassword } from "../utils/password.js";
import { revokeAllUserSessions } from "../services/sessionService.js";
import { sendGuardianChannel } from "../services/guardianCommunicationService.js";

const GENERIC_RESPONSE = {
  success: true,
  message: "If the account is eligible, a password reset code has been sent to its registered recovery email.",
};
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (code, salt) =>
  createHash("sha256").update(`${salt}:${code}`).digest("hex");

async function resolveAccount(email, tenantSlug) {
  let tenantId = null;
  let user = null;
  if (typeof tenantSlug === "string" && tenantSlug.trim()) {
    const tenant = await Tenant.findOne({ slug: tenantSlug.trim().toLowerCase(), status: "active" }).select("_id").lean();
    if (!tenant) return null;
    tenantId = tenant._id;
    user = await User.findOne({ tenantId, email, status: "active", role: { $ne: "platform_admin" } }).select("_id tenantId firstName role email").lean();
  } else {
    user = await User.findOne({ email, tenantId: null, role: "platform_admin", status: "active" }).select("_id tenantId firstName role email").lean();
  }
  return user;
}

async function resolveRecoveryEmail(user) {
  if (user.role !== "student") return user.email;
  const student = await Student.findOne({ tenantId: user.tenantId, userId: user._id, status: "active" }).select("_id").lean();
  if (!student) return null;
  const links = await StudentGuardian.find({
    tenantId: user.tenantId, studentId: student._id, status: "active",
    receivesCommunication: true, communicationChannels: "email",
  }).select("guardianId isPrimary").sort({ isPrimary: -1, createdAt: 1 }).lean();
  if (!links.length) return null;
  const guardians = await Guardian.find({
    tenantId: user.tenantId, _id: { $in: links.map((link) => link.guardianId) },
    status: "active", emailVerifiedAt: { $ne: null },
  }).select("_id email verifiedEmail").lean();
  const byId = new Map(guardians.map((guardian) => [String(guardian._id), guardian]));
  for (const link of links) {
    const guardian = byId.get(String(link.guardianId));
    const verifiedEmail = String(guardian?.verifiedEmail || guardian?.email || "").trim().toLowerCase();
    if (verifiedEmail) return { email: verifiedEmail, guardianId: guardian._id };
  }
  return null;
}

export const requestPasswordReset = async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const tenantSlug = typeof req.body?.tenantSlug === "string" ? req.body.tenantSlug : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(200).json(GENERIC_RESPONSE);

    const user = await resolveAccount(email, tenantSlug);
    if (!user) return res.status(200).json(GENERIC_RESPONSE);

    const destination = await resolveRecoveryEmail(user);
    if (!destination) return res.status(200).json(GENERIC_RESPONSE);
    const recoveryEmail = typeof destination === "string" ? destination : destination.email;
    const guardianId = typeof destination === "string" ? null : destination.guardianId;

    const latest = await PasswordReset.findOne({ userId: user._id, consumedAt: null }).sort({ createdAt: -1 }).select("sentAt").lean();
    if (latest && Date.now() - new Date(latest.sentAt).getTime() < RESEND_COOLDOWN_MS) return res.status(200).json(GENERIC_RESPONSE);

    const code = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString("hex");
    const sentAt = new Date();
    await PasswordReset.updateMany({ userId: user._id, consumedAt: null }, { $set: { consumedAt: sentAt } });
    await PasswordReset.create({
      userId: user._id, tenantId: user.tenantId ?? null,
      codeHash: hashCode(code, salt), codeSalt: salt,
      destination: recoveryEmail, sentAt,
      expiresAt: new Date(sentAt.getTime() + CODE_TTL_MS),
    });
    try {
      await sendGuardianChannel({
        channel: "email", recipient: recoveryEmail,
        subject: "Your School ERP password reset code",
        message: `Hello ${user.firstName || ""},\n\nYour password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
        guardianId, purpose: "password_reset",
      });
    } catch (error) {
      await PasswordReset.updateMany({ userId: user._id, sentAt, consumedAt: null }, { $set: { consumedAt: new Date() } });
      // Do not expose account existence or provider configuration to the requester.
    }
    return res.status(200).json(GENERIC_RESPONSE);
  } catch (error) { return next(error); }
};

export const completePasswordReset = async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const tenantSlug = typeof req.body?.tenantSlug === "string" ? req.body.tenantSlug : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const newPassword = req.body?.newPassword;
    if (!email || !/^\d{6}$/.test(code) || typeof newPassword !== "string" || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, six-digit code and new password are required" });
    }
    const user = await resolveAccount(email, tenantSlug);
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired password reset code" });
    const challenge = await PasswordReset.findOne({
      userId: user._id, tenantId: user.tenantId ?? null,
      consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS },
    }).sort({ createdAt: -1 }).select("+codeHash +codeSalt");
    if (!challenge) return res.status(400).json({ success: false, message: "Invalid or expired password reset code" });
    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashCode(code, challenge.codeSalt), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      challenge.attempts += 1;
      if (challenge.attempts >= MAX_ATTEMPTS) challenge.consumedAt = new Date();
      await challenge.save();
      return res.status(400).json({ success: false, message: "Invalid or expired password reset code" });
    }
    const passwordHash = await hashPassword(newPassword);
    const updated = await User.findOneAndUpdate(
      { _id: user._id, tenantId: user.tenantId ?? null, status: "active" },
      { $set: { passwordHash }, $inc: { authVersion: 1 } },
      { new: true },
    ).select("_id");
    if (!updated) return res.status(400).json({ success: false, message: "Unable to reset password for this account" });
    challenge.consumedAt = new Date();
    await challenge.save();
    await PasswordReset.updateMany({ userId: user._id, _id: { $ne: challenge._id }, consumedAt: null }, { $set: { consumedAt: new Date() } });
    await revokeAllUserSessions(String(user._id));
    return res.status(200).json({ success: true, message: "Password reset successfully. Please sign in with your new password." });
  } catch (error) {
    if (error.message?.includes("Password must")) return res.status(400).json({ success: false, message: error.message });
    return next(error);
  }
};
