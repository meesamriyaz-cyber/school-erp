import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";

const AUDITABLE_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "role",
  "status",
]);
const AUDITABLE_ROLES = new Set([
  "platform_admin", "school_admin", "principal", "teacher", "accountant",
  "librarian", "transport_manager", "student", "parent",
]);
const AUDITABLE_STATUSES = new Set(["pending", "active", "suspended"]);

function safeAuditValue(action, value, isNewValue) {
  if (value == null) return null;
  const normalized = String(value);
  if (action === "USER_STATUS_CHANGED") {
    return AUDITABLE_STATUSES.has(normalized) ? normalized : null;
  }
  if (action === "USER_ROLE_CHANGED") {
    return AUDITABLE_ROLES.has(normalized) ? normalized : null;
  }
  if (action === "USER_CREATED" && isNewValue && normalized === "pending") {
    return normalized;
  }
  return null;
}

/**
 * Writes a minimal audit record. Never pass request bodies, credentials, tokens,
 * hashes, or arbitrary metadata into this function.
 *
 * Audit persistence is best-effort for these user-management handlers: a failure
 * is logged without making a completed user mutation appear to have failed.
 */
export async function writeUserAudit({
  actorUserId,
  actorRole,
  tenantId = null,
  targetUserId,
  targetTenantId = null,
  action,
  changedFields = [],
  previousValue = null,
  newValue = null,
}) {
  try {
    const safeFields = [...new Set(changedFields)].filter((field) =>
      AUDITABLE_FIELDS.has(field)
    );

    await AuditLog.create({
      actorUserId: new mongoose.Types.ObjectId(String(actorUserId)),
      actorRole,
      tenantId: tenantId ? new mongoose.Types.ObjectId(String(tenantId)) : null,
      targetUserId: new mongoose.Types.ObjectId(String(targetUserId)),
      targetTenantId: targetTenantId
        ? new mongoose.Types.ObjectId(String(targetTenantId))
        : null,
      action,
      changedFields: safeFields,
      previousValue: safeAuditValue(action, previousValue, false),
      newValue: safeAuditValue(action, newValue, true),
    });
    return true;
  } catch (error) {
    console.error("Failed to persist user-management audit event", {
      action,
      actorUserId: String(actorUserId),
      targetUserId: String(targetUserId),
      errorName: error?.name ?? "Error",
      errorMessage: typeof error?.message === "string" ? error.message.slice(0, 200) : "Unknown audit persistence error",
    });
    return false;
  }
}
