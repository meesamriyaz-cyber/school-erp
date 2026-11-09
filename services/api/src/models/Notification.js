import mongoose from "mongoose";

export const NOTIFICATION_EVENTS = [
  "announcement_published",
  "homework_published",
  "attendance_absence",
  "examination_scheduled",
  "examination_results_published",
  "fee_invoice_created",
  "fee_payment_received",
  "fee_payment_reversed",
];
export const NOTIFICATION_SOURCE_TYPES = [
  "Announcement", "Homework", "Attendance", "Examination", "FeeInvoice", "FeePayment",
];
export const NOTIFICATION_RECIPIENT_ROLES = ["student", "parent"];
export const NOTIFICATION_DELIVERY_STATUSES = ["pending", "processing", "delivered", "failed", "cancelled"];

const deliveryHistorySchema = new mongoose.Schema({
  attempt: { type: Number, required: true, min: 1 },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  outcome: { type: String, enum: ["delivered", "retry_scheduled", "failed", "cancelled"], default: "retry_scheduled" },
  error: { type: String, default: null, maxlength: 200 },
}, { _id: false });

const notificationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  recipientRole: { type: String, enum: NOTIFICATION_RECIPIENT_ROLES, required: true, immutable: true },
  eventType: { type: String, enum: NOTIFICATION_EVENTS, required: true, immutable: true },
  sourceType: { type: String, enum: NOTIFICATION_SOURCE_TYPES, required: true, immutable: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  eventKey: { type: String, required: true, immutable: true, maxlength: 200 },
  title: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  body: { type: String, required: true, trim: true, maxlength: 10000, immutable: true },
  link: { type: String, required: true, maxlength: 240, immutable: true },
  relatedStudentIds: { type: [mongoose.Schema.Types.ObjectId], default: [], immutable: true },
  deliveryStatus: { type: String, enum: NOTIFICATION_DELIVERY_STATUSES, default: "pending", required: true },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  processingStartedAt: { type: Date, default: null },
  processingToken: { type: String, default: null, select: false },
  deliveredAt: { type: Date, default: null },
  lastError: { type: String, default: null, maxlength: 200 },
  deliveryHistory: { type: [deliveryHistorySchema], default: [] },
  readAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false, strict: "throw" });

notificationSchema.index(
  { tenantId: 1, recipientUserId: 1, eventKey: 1 },
  { unique: true, name: "unique_recipient_notification_event" },
);
notificationSchema.index({ tenantId: 1, recipientUserId: 1, deliveryStatus: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, recipientUserId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ deliveryStatus: 1, nextAttemptAt: 1, createdAt: 1 });
notificationSchema.index({ deliveryStatus: 1, processingStartedAt: 1, createdAt: 1 });

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
