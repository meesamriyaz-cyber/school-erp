import mongoose from "mongoose";
import { AUDIT_ACTIONS } from "./AuditLog.js";

const auditOutboxSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "delivered", "failed"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingToken: {
      type: String,
      default: null,
      select: false,
    },
    lastError: {
      type: String,
      default: null,
      maxlength: 200,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    manualRetryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastManualRetryAt: {
      type: Date,
      default: null,
    },
    lastManualRetryBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

auditOutboxSchema.path("event").validate((event) =>
  Boolean(event && event.action && AUDIT_ACTIONS.includes(event.action) &&
    event.actorUserId && event.targetUserId && event.actorRole),
  "Audit outbox event is missing required audit fields",
);

auditOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
auditOutboxSchema.index({ status: 1, processingStartedAt: 1, createdAt: 1 });

const AuditOutbox = mongoose.model("AuditOutbox", auditOutboxSchema);

export default AuditOutbox;
