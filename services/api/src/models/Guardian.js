import mongoose from "mongoose";

const guardianSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    // Explicitly linked by a school administrator to a parent login account.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, default: "", trim: true, maxlength: 80 },
    phone: { type: String, default: null, trim: true, match: [/^[0-9]{10}$/, "Phone number must contain exactly 10 digits"] },
    photoUrl: { type: String, default: null, trim: true, maxlength: 2048, validate: { validator(value) { if (!value) return true; try { return new URL(value).protocol === "https:"; } catch { return false; } }, message: "Guardian photo URL must be HTTPS" } },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    emailVerifiedAt: { type: Date, default: null },
    verifiedEmail: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    pendingEmail: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    emailDeliveryEmailId: { type: String, default: null, maxlength: 128 },
    emailDeliveryStatus: { type: String, default: null, maxlength: 40 },
    emailDeliveryUpdatedAt: { type: Date, default: null },
    emailDeliveryEvents: { type: [{ eventId: String, type: String, occurredAt: Date }], default: [] },
    emailOtpHash: { type: String, default: null, select: false },
    emailOtpSalt: { type: String, default: null, select: false },
    emailOtpExpiresAt: { type: Date, default: null, select: false },
    emailOtpSentAt: { type: Date, default: null, select: false },
    emailOtpAttempts: { type: Number, default: 0, select: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

guardianSchema.index({ tenantId: 1, phone: 1 });
guardianSchema.index({ tenantId: 1, email: 1 });
guardianSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);

const Guardian =
  mongoose.models.Guardian || mongoose.model("Guardian", guardianSchema);

export default Guardian;
