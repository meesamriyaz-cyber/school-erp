import mongoose from "mongoose";

const channelSchema = new mongoose.Schema({
  channel: { type: String, enum: ["sms", "whatsapp", "email"], required: true },
  recipient: { type: String, required: true, maxlength: 254 },
  // status is the normalized application outcome; providerStatus preserves the provider lifecycle.\n  status: { type: String, enum: ["accepted", "failed", "skipped"], required: true },\n  providerStatus: { type: String, default: null, maxlength: 40 },
  providerMessageId: { type: String, default: null, maxlength: 160 },\n  providerErrorCode: { type: String, default: null, maxlength: 40 },\n  providerErrorMessage: { type: String, default: null, maxlength: 240 },\n  deliveredAt: { type: Date, default: null },\n  statusUpdatedAt: { type: Date, default: null },
  error: { type: String, default: null, maxlength: 240 },
  attemptedAt: { type: Date, required: true },
}, { _id: false });

const guardianCommunicationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", required: true, immutable: true },
  relationshipId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentGuardian", required: true, immutable: true },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  subject: { type: String, default: "", maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  channels: { type: [channelSchema], default: [] },
}, { timestamps: true, versionKey: false });

guardianCommunicationSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });
guardianCommunicationSchema.index({ tenantId: 1, guardianId: 1, createdAt: -1 });\nguardianCommunicationSchema.index({ "channels.providerMessageId": 1 }, { sparse: true });

const GuardianCommunication = mongoose.models.GuardianCommunication
  || mongoose.model("GuardianCommunication", guardianCommunicationSchema);
export default GuardianCommunication;
