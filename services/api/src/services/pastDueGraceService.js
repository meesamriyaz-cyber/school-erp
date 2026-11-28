import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import SchoolSubscription from "../models/SchoolSubscription.js";
import PlatformCommercialEvent from "../models/PlatformCommercialEvent.js";

const POLL_INTERVAL_MS = 60 * 1000;
const GRACE_EXPIRED_REASON = "Subscription payment grace period expired";
const addCalendarDays = (value, days) => {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};
let workerTimer = null;
let workerRunning = false;

export async function processDuePastDueSubscriptions({ now = new Date() } = {}) {
  if (workerRunning) return { expired: 0, skipped: true };
  workerRunning = true;
  let expired = 0;

  try {
    const dueSubscriptions = await SchoolSubscription.find({
      status: "past_due",
      $or: [{ graceEndsAt: { $lte: now } }, { graceEndsAt: null }],
    }).select("_id tenantId pastDueSince graceEndsAt").lean();

    for (const candidate of dueSubscriptions) {
      const session = await mongoose.startSession();
      let didExpire = false;
      try {
        await session.withTransaction(async () => {
          didExpire = false;
          // Backfill subscriptions that were already past due before the grace
          // fields were introduced. Their seven-day clock starts at rollout,
          // unless a recorded pastDueSince timestamp is available.
          if (!candidate.graceEndsAt) {
            const pastDueSince = candidate.pastDueSince || now;
            await SchoolSubscription.updateOne(
              { _id: candidate._id, tenantId: candidate.tenantId, status: "past_due", graceEndsAt: null },
              { $set: { pastDueSince, graceEndsAt: addCalendarDays(pastDueSince, 7) } },
              { session },
            );
            return;
          }

          // This conditional write is the concurrency boundary: a payment that
          // clears grace first makes this transition a no-op.
          const transition = await SchoolSubscription.updateOne(
            {
              _id: candidate._id,
              tenantId: candidate.tenantId,
              status: "past_due",
              graceEndsAt: { $lte: now },
            },
            { $set: { status: "expired", graceExpiredAt: now } },
            { session },
          );
          if (!transition.modifiedCount) return;

          const suspension = await Tenant.updateOne(
            { _id: candidate.tenantId, status: "active" },
            {
              $set: {
                status: "suspended",
                suspensionReason: GRACE_EXPIRED_REASON,
                subscriptionSuspendedAt: now,
              },
              $push: {
                suspensionHistory: {
                  reason: GRACE_EXPIRED_REASON,
                  suspendedAt: now,
                  suspendedBy: null,
                },
              },
            },
            { session },
          );
          const schoolAccessSuspended = Boolean(suspension.modifiedCount);

          if (schoolAccessSuspended) {
            await User.updateMany(
              { tenantId: candidate.tenantId },
              { $inc: { authVersion: 1 } },
              { session },
            );
            await Session.updateMany(
              { tenantId: candidate.tenantId, revokedAt: null },
              { $set: { revokedAt: now } },
              { session },
            );
          }

          await PlatformCommercialEvent.create([{
            actorUserId: null,
            tenantId: candidate.tenantId,
            subscriptionId: candidate._id,
            action: "SUBSCRIPTION_GRACE_EXPIRED",
            details: {
              graceExpiredAt: now,
              graceDays: 7,
              schoolAccessSuspended,
              reason: GRACE_EXPIRED_REASON,
            },
          }], { session });
          didExpire = true;
        });
        if (didExpire) expired += 1;
      } finally {
        await session.endSession();
      }
    }

    return { expired, skipped: false };
  } catch (error) {
    console.error("Past-due grace worker failed", {
      errorName: error?.name || "Error",
      errorMessage: typeof error?.message === "string" ? error.message.slice(0, 200) : "Unknown error",
    });
    return { expired, skipped: false, failed: true };
  } finally {
    workerRunning = false;
  }
}

export function startPastDueGraceWorker() {
  if (workerTimer) return;
  void processDuePastDueSubscriptions();
  workerTimer = setInterval(() => { void processDuePastDueSubscriptions(); }, POLL_INTERVAL_MS);
  workerTimer.unref?.();
}

export async function stopPastDueGraceWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  while (workerRunning) await new Promise((resolve) => setTimeout(resolve, 25));
}
