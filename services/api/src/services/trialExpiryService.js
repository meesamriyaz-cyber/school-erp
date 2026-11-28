import Tenant from "../models/Tenant.js";
import SchoolSubscription from "../models/SchoolSubscription.js";
import { markWorkerStarted, markWorkerHeartbeat, markWorkerCycleStarted, markWorkerCycleSucceeded, markWorkerCycleFailed, markWorkerStopped } from "./workerHealth.js";

const POLL_INTERVAL_MS = 60 * 1000;
let workerTimer = null;
let workerRunning = false;

export async function processDueTrials({ now = new Date() } = {}) {
  if (workerRunning) return { expired: 0, skipped: true };
  workerRunning = true;
  markWorkerCycleStarted("trialExpiry");
  let expired = 0;
  try {
    const dueSchools = await Tenant.find({
      status: { $in: ["active", "trial_expired"] },
      trialEndsAt: { $lte: now },
    }).select("_id status").lean();

    for (const school of dueSchools) {
      markWorkerHeartbeat("trialExpiry");
      // The guarded transition prevents a concurrent paid conversion or suspension
      // from being overwritten by a stale trial-expiry candidate.
      if (school.status === "active") {
        const transition = await Tenant.updateOne(
          { _id: school._id, status: "active", trialEndsAt: { $lte: now } },
          { $set: { status: "trial_expired", trialExpiredAt: now } },
        );
        if (!transition.modifiedCount) continue;
      }

      // Retry the subscription transition for already-expired tenants so a
      // transient failure cannot leave an active trial subscription indefinitely.
      await SchoolSubscription.updateMany(
        { tenantId: school._id, isTrial: true, status: "active" },
        { $set: { status: "expired" } },
      );
      expired += 1;
    }
    markWorkerCycleSucceeded("trialExpiry", expired);
    return { expired, skipped: false };
  } catch (error) {
    markWorkerCycleFailed("trialExpiry", error);
    console.error("Trial expiry worker failed", {
      errorName: error?.name || "Error",
      errorMessage: typeof error?.message === "string" ? error.message.slice(0, 200) : "Unknown error",
    });
    return { expired, skipped: false, failed: true };
  } finally {
    workerRunning = false;
  }
}

export function startTrialExpiryWorker() {
  if (workerTimer) return;
  markWorkerStarted("trialExpiry");
  void processDueTrials();
  workerTimer = setInterval(() => { void processDueTrials(); }, POLL_INTERVAL_MS);
  workerTimer.unref?.();
}

export async function stopTrialExpiryWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  while (workerRunning) await new Promise((resolve) => setTimeout(resolve, 25));
  markWorkerStopped("trialExpiry");
}
