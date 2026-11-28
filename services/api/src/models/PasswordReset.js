import mongoose from "mongoose";

const passwordResetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, immutable: true },
  codeHash: { type: String, required: true, select: false },
  codeSalt: { type: String, required: true, select: false },
  destination: { type: String, required: true, maxlength: 254 },
  recoveryGuardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", default: null, immutable: true },
  expiresAt: { type: Date, required: true, index: true },
  sentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

passwordResetSchema.index({ userId: 1, consumedAt: 1, expiresAt: -1 });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

const PasswordReset = mongoose.models.PasswordReset || mongoose.model("PasswordReset", passwordResetSchema);
export default PasswordReset;
