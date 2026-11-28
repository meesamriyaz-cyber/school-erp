import { randomUUID } from "node:crypto";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import { sendGuardianChannel } from "./guardianCommunicationService.js";
import { markWorkerStarted, markWorkerHeartbeat, markWorkerCycleStarted, markWorkerCycleSucceeded, markWorkerCycleFailed, markWorkerStopped } from "./workerHealth.js";

const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
let workerTimer = null;
let workerRunning = false;

const safeError = (error) => typeof error?.message === "string"
  ? error.message.replace(/[\r\n\t]/g, " ").slice(0, 200)
  : "Unknown notification delivery error";

export async function processPendingNotifications({ batchSize = 50, notificationId = null } = {}) {
  if (workerRunning) return { processed: 0, skipped: true };
  workerRunning = true;
  markWorkerCycleStarted("notificationDelivery");
  let processed = 0;
  try {
    for (let index = 0; index < Math.min(Math.max(batchSize, 1), 100); index += 1) {
      markWorkerHeartbeat("notificationDelivery");
      const now = new Date();
      const processingToken = randomUUID();
      const notification = await Notification.findOneAndUpdate(
        {
          ...(notificationId ? { _id: notificationId } : {}),
          $or: [
            { deliveryStatus: "pending", attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
            { deliveryStatus: "processing", attempts: { $lte: MAX_ATTEMPTS }, processingStartedAt: { $lte: new Date(now.getTime() - PROCESSING_LEASE_MS) } },
          ],
        },
        {
          $set: { deliveryStatus: "processing", processingStartedAt: now, processingToken },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
      ).select("+processingToken").lean();
      if (!notification) break;

      const attempt = {
        attempt: notification.attempts,
        startedAt: now,
      };
      if (notification.attempts > MAX_ATTEMPTS) {
        await Notification.updateOne(
          { _id: notification._id, deliveryStatus: "processing", processingToken },
          {
            $set: { deliveryStatus: "failed", lastError: "Delivery lease expired after the final attempt" },
            $unset: { processingStartedAt: 1, processingToken: 1 },
            $push: { deliveryHistory: { ...attempt, finishedAt: new Date(), outcome: "failed", error: "Delivery lease expired after the final attempt" } },
          },
        );
        processed += 1;
        continue;
      }
      try {
        const recipient = await User.findOne({
          _id: notification.recipientUserId,
          tenantId: notification.tenantId,
          role: notification.recipientRole,
          status: "active",
        }).select("_id email firstName").lean();

        if (!recipient) {
          await Notification.updateOne(
            { _id: notification._id, deliveryStatus: "processing", processingToken },
            {
              $set: { deliveryStatus: "cancelled", lastError: "Recipient account is no longer active" },
              $unset: { processingStartedAt: 1, processingToken: 1 },
              $push: { deliveryHistory: { ...attempt, finishedAt: new Date(), outcome: "cancelled", error: "Recipient account is no longer active" } },
            },
          );
          processed += 1;
          continue;
        }

        // Parent email is an additional channel; the in-app notification remains
        // independently deliverable if email is unavailable or fails.
        if (notification.recipientRole === "parent" && notification.emailDeliveryStatus === "pending") {
          const guardian = await Guardian.findOne({
            tenantId: notification.tenantId, userId: recipient._id, status: "active",
            emailVerifiedAt: { $ne: null },
          }).select("_id email verifiedEmail").lean();
          const links = guardian ? await StudentGuardian.find({
            tenantId: notification.tenantId, guardianId: guardian._id,
            studentId: { $in: notification.relatedStudentIds || [] },
            status: "active", receivesCommunication: true, communicationChannels: "email",
          }).select("_id").limit(1).lean() : [];
          const email = String(guardian?.verifiedEmail || guardian?.email || "").trim().toLowerCase();
          if (!guardian || !links.length || !email) {
            await Notification.updateOne(
              { _id: notification._id, deliveryStatus: "processing", processingToken, emailDeliveryStatus: "pending" },
              { $set: { emailDeliveryStatus: "skipped", emailLastError: null } },
            );
          } else {
            await Notification.updateOne(
              { _id: notification._id, deliveryStatus: "processing", processingToken, emailDeliveryStatus: "pending" },
              { $set: { emailDeliveryStatus: "sending" } },
            );
            try {
              const emailResult = await sendGuardianChannel({
                channel: "email", recipient: email, subject: notification.title,
                message: notification.body, guardianId: guardian._id, purpose: "school_notification",
              });
              await Notification.updateOne(
                { _id: notification._id, deliveryStatus: "processing", processingToken, emailDeliveryStatus: "sending" },
                { $set: { emailDeliveryStatus: "sent", emailDeliveredAt: new Date(), emailMessageId: emailResult.messageId || null, emailLastError: null } },
              );
            } catch (emailError) {
              await Notification.updateOne(
                { _id: notification._id, deliveryStatus: "processing", processingToken, emailDeliveryStatus: "sending" },
                { $set: { emailDeliveryStatus: "failed", emailLastError: safeError(emailError) } },
              );
            }
          }
        }

        const result = await Notification.updateOne(
          { _id: notification._id, deliveryStatus: "processing", processingToken },
          {
            $set: { deliveryStatus: "delivered", deliveredAt: new Date(), lastError: null },
            $unset: { processingStartedAt: 1, processingToken: 1 },
            $push: { deliveryHistory: { ...attempt, finishedAt: new Date(), outcome: "delivered", error: null } },
          },
        );
        if (result.matchedCount) processed += 1;
      } catch (error) {
        const message = safeError(error);
        const backoff = Math.min(1000 * (2 ** Math.max(notification.attempts - 1, 0)), MAX_BACKOFF_MS);
        await Notification.updateOne(
          { _id: notification._id, deliveryStatus: "processing", processingToken },
          {
            $set: {
              deliveryStatus: notification.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
              nextAttemptAt: new Date(Date.now() + backoff),
              lastError: message,
            },
            $unset: { processingStartedAt: 1, processingToken: 1 },
            $push: { deliveryHistory: {
              ...attempt,
              finishedAt: new Date(),
              outcome: notification.attempts >= MAX_ATTEMPTS ? "failed" : "retry_scheduled",
              error: message,
            } },
          },
        );
      }
    }
    markWorkerCycleSucceeded("notificationDelivery", processed);
    return { processed, skipped: false };
  } catch (error) {
    markWorkerCycleFailed("notificationDelivery", error);
    console.error("Notification delivery worker failed", {
      errorName: error?.name || "Error",
      errorMessage: safeError(error),
    });
    return { processed, skipped: false, failed: true };
  } finally {
    workerRunning = false;
  }
}

export function startNotificationDeliveryWorker() {
  if (workerTimer) return;
  markWorkerStarted("notificationDelivery");
  void processPendingNotifications();
  workerTimer = setInterval(() => { void processPendingNotifications(); }, POLL_INTERVAL_MS);
  workerTimer.unref?.();
}

export async function stopNotificationDeliveryWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  while (workerRunning) await new Promise((resolve) => setTimeout(resolve, 25));
  markWorkerStopped("notificationDelivery");
}

export const notificationRetryPolicy = Object.freeze({
  maxAttempts: MAX_ATTEMPTS,
  maxBackoffMs: MAX_BACKOFF_MS,
  processingLeaseMs: PROCESSING_LEASE_MS,
});
