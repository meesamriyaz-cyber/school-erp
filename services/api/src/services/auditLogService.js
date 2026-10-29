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
      previousValue: previousValue == null ? null : String(previousValue),
      newValue: newValue == null ? null : String(newValue),
    });
    return true;
  } catch (error) {
    console.error("Failed to persist user-management audit event", {
      action,
      actorUserId: String(actorUserId),
      targetUserId: String(targetUserId),
      error,
    });
    return false;
  }
}
