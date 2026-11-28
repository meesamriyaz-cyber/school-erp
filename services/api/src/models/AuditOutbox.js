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

const USER_AUDIT_ACTIONS = new Set([
  "USER_CREATED", "USER_PROFILE_UPDATED", "USER_STATUS_CHANGED", "USER_ROLE_CHANGED",
]);
const SCHOOL_AUDIT_ACTIONS = new Set(["SCHOOL_CREATED", "SCHOOL_STATUS_CHANGED"]);
const AUDITABLE_ROLES = new Set([
  "platform_admin", "school_admin", "principal", "teacher", "accountant",
  "librarian", "transport_manager", "student", "parent",
]);
const AUDITABLE_STATUSES = new Set(["pending", "active", "suspended"]);
const AUDITABLE_USER_FIELDS = new Set([
  "firstName", "lastName", "email", "phone", "role", "status",
]);
const AUDITABLE_SCHOOL_FIELDS = new Set([
  "name", "slug", "contactEmail", "timezone", "suspensionReason", "status",
]);
const EVENT_KEYS = new Set([
  "eventId", "actorUserId", "actorRole", "tenantId", "targetUserId",
  "targetTenantId", "action", "changedFields", "previousValue", "newValue",
]);

const isObjectIdOrNull = (value) =>
  value == null || mongoose.isObjectIdOrHexString(value);

function isSafeAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  if (Object.keys(event).some((key) => !EVENT_KEYS.has(key))) return false;
  if (!mongoose.isObjectIdOrHexString(event.eventId) ||
      !mongoose.isObjectIdOrHexString(event.actorUserId) ||
      !AUDITABLE_ROLES.has(event.actorRole) ||
      !isObjectIdOrNull(event.tenantId) ||
      !isObjectIdOrNull(event.targetUserId) ||
      !isObjectIdOrNull(event.targetTenantId)) return false;

  const isUserEvent = USER_AUDIT_ACTIONS.has(event.action);
  const isSchoolEvent = SCHOOL_AUDIT_ACTIONS.has(event.action);
  if ((!isUserEvent && !isSchoolEvent) ||
      (isUserEvent && (!event.targetUserId || !event.targetTenantId)) ||
      (isSchoolEvent && (!event.targetTenantId || event.targetUserId))) return false;

  const allowedFields = isSchoolEvent ? AUDITABLE_SCHOOL_FIELDS : AUDITABLE_USER_FIELDS;
  if (!Array.isArray(event.changedFields) ||
      event.changedFields.some((field) => typeof field !== "string" || !allowedFields.has(field))) return false;

  const validValue = (value) => value == null || (
    typeof value === "string" && (
      (event.action === "USER_ROLE_CHANGED" && AUDITABLE_ROLES.has(value)) ||
      ((event.action === "USER_STATUS_CHANGED" || event.action === "SCHOOL_STATUS_CHANGED") && AUDITABLE_STATUSES.has(value)) ||
      ((event.action === "USER_CREATED" || event.action === "SCHOOL_CREATED") && value === "pending")
    )
  );
  return validValue(event.previousValue) && validValue(event.newValue);
}

auditOutboxSchema.path("event").validate(
  isSafeAuditEvent,
  "Audit outbox event contains unsupported, unsafe, or incomplete audit data",
);

auditOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
auditOutboxSchema.index({ status: 1, processingStartedAt: 1, createdAt: 1 });

const AuditOutbox = mongoose.model("AuditOutbox", auditOutboxSchema);

export default AuditOutbox;
