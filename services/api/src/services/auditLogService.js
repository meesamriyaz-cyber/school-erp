import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import AuditOutbox from "../models/AuditOutbox.js";

const AUDITABLE_FIELDS = new Set([
  "firstName", "lastName", "email", "phone", "role", "status",
]);
const AUDITABLE_ROLES = new Set([
  "platform_admin", "school_admin", "principal", "teacher", "accountant",
  "librarian", "transport_manager", "student", "parent",
]);
const AUDITABLE_STATUSES = new Set(["pending", "active", "suspended"]);
const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
let workerTimer = null;
let workerRunning = false;

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

function buildSafeEvent({
  actorUserId, actorRole, tenantId = null, targetUserId, targetTenantId = null,
  action, changedFields = [], previousValue = null, newValue = null,
}) {
  const safeFields = [...new Set(changedFields)].filter((field) =>
    AUDITABLE_FIELDS.has(field)
  );
  return {
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
  };
}

function safeErrorMessage(error) {
  return typeof error?.message === "string"
    ? error.message.replace(/[\r\n\t]/g, " ").slice(0, 200)
    : "Unknown audit delivery error";
}

export async function processPendingAuditEvents({ batchSize = 25 } = {}) {
  if (workerRunning) return { processed: 0, skipped: true };
  workerRunning = true;
  let processed = 0;
  try {
    for (let i = 0; i < Math.min(Math.max(batchSize, 1), 100); i += 1) {
      const outbox = await AuditOutbox.findOneAndUpdate(
        {
          attempts: { $lt: MAX_ATTEMPTS },
          $or: [
            { status: "pending", nextAttemptAt: { $lte: new Date() } },
            { status: "processing", processingStartedAt: { $lte: new Date(Date.now() - 60_000) } },
          ],
        },
        { $set: { status: "processing", processingStartedAt: new Date() }, $inc: { attempts: 1 } },
        { new: true, sort: { createdAt: 1 } },
      ).lean();
      if (!outbox) break;

      try {
        // The event payload is constructed from allowlisted fields before it enters the outbox.
        try {
          await AuditLog.create(outbox.event);
        } catch (error) {
          // A prior worker may have inserted the same immutable event and crashed before acking it.
          if (error?.code !== 11000) throw error;
        }
        await AuditOutbox.updateOne(
          { _id: outbox._id, status: "processing" },
          { $set: { status: "delivered", deliveredAt: new Date(), lastError: null }, $unset: { processingStartedAt: 1 } },
        );
        processed += 1;
      } catch (error) {
        const attempts = outbox.attempts;
        const backoff = Math.min(1000 * (2 ** Math.max(attempts - 1, 0)), MAX_BACKOFF_MS);
        await AuditOutbox.updateOne(
          { _id: outbox._id, status: "processing" },
          {
            $set: {
              status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
              nextAttemptAt: new Date(Date.now() + backoff),
              lastError: safeErrorMessage(error),
            },
            $unset: { processingStartedAt: 1 },
          },
        );
        console.error("Audit outbox delivery failed", {
          outboxId: String(outbox._id),
          action: outbox.event?.action,
          attempts,
          errorName: error?.name ?? "Error",
          errorMessage: safeErrorMessage(error),
        });
      }
    }
    return { processed, skipped: false };
  } catch (error) {
    console.error("Audit outbox polling failed", {
      errorName: error?.name ?? "Error",
      errorMessage: safeErrorMessage(error),
    });
    return { processed, skipped: false, failed: true };
  } finally {
    workerRunning = false;
  }
}

export function startAuditOutboxWorker() {
  if (workerTimer) return;
  void processPendingAuditEvents();
  workerTimer = setInterval(() => {
    void processPendingAuditEvents();
  }, POLL_INTERVAL_MS);
  workerTimer.unref?.();
}

export async function stopAuditOutboxWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  // Give an active delivery cycle a chance to finish before DB shutdown.
  while (workerRunning) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Persist the sanitized event to a MongoDB outbox, then attempt immediate delivery.
 * The outbox makes failures after successful enqueue retryable across process restarts.
 * Callers should not pass request bodies, credentials, tokens, or hashes.
 */
export async function withAuditTransaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }
  // The running worker delivers committed outbox rows; polling recovers after restarts.
  return result;
}

export async function writeUserAudit(input, { session = null } = {}) {
  let event;
  try {
    event = { eventId: new mongoose.Types.ObjectId(), ...buildSafeEvent(input) };
    const queued = session
      ? (await AuditOutbox.create([{ event }], { session }))[0]
      : await AuditOutbox.create({ event });
    if (session) return true;
    await processPendingAuditEvents();
    const current = await AuditOutbox.findById(queued._id).select("status").lean();
    return current?.status === "delivered";
  } catch (error) {
    console.error("Failed to enqueue user-management audit event", {
      action: input?.action,
      actorUserId: input?.actorUserId == null ? null : String(input.actorUserId),
      targetUserId: input?.targetUserId == null ? null : String(input.targetUserId),
      errorName: error?.name ?? "Error",
      errorMessage: safeErrorMessage(error),
    });
    // A failed enqueue inside a transaction must abort the user mutation too.
    if (session) throw error;
    return false;
  }
}
