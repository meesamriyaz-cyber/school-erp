import mongoose from "mongoose";
import AuditOutbox from "../models/AuditOutbox.js";
import { processPendingAuditEvents } from "../services/auditLogService.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const validId = (id) => mongoose.isObjectIdOrHexString(id);
const STALE_AFTER_MS = 5 * 60_000;

export const getAuditOutboxStatus = async (_req, res, next) => {
  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
    const [pending, processing, staleProcessing, delivered, failed, recentFailures] = await Promise.all([
      AuditOutbox.countDocuments({ status: "pending" }),
      AuditOutbox.countDocuments({ status: "processing" }),
      AuditOutbox.countDocuments({ status: "processing", processingStartedAt: { $lte: staleBefore } }),
      AuditOutbox.countDocuments({ status: "delivered" }),
      AuditOutbox.countDocuments({ status: "failed" }),
      AuditOutbox.find({ status: "failed" })
        .select("_id status attempts manualRetryCount lastError createdAt updatedAt lastManualRetryAt")
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        counts: { pending, processing, staleProcessing, delivered, failed },
        failedEvents: recentFailures.map((item) => ({
          id: String(item._id),
          status: item.status,
          attempts: item.attempts,
          manualRetryCount: item.manualRetryCount ?? 0,
          lastError: item.lastError ?? null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          lastManualRetryAt: item.lastManualRetryAt ?? null,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const retryFailedAuditEvent = async (req, res, next) => {
  try {
    const { outboxId } = req.params;
    if (!validId(outboxId)) return sendError(res, 400, "Invalid audit outbox ID");

    const retried = await AuditOutbox.findOneAndUpdate(
      { _id: outboxId, status: "failed" },
      {
        $set: {
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          lastManualRetryAt: new Date(),
          lastManualRetryBy: new mongoose.Types.ObjectId(String(req.auth.userId)),
        },
        $inc: { manualRetryCount: 1 },
        $unset: { processingStartedAt: 1 },
      },
      { new: true },
    ).select("_id status attempts manualRetryCount");

    if (!retried) return sendError(res, 409, "Audit event is not failed or has already been retried");

    await processPendingAuditEvents({ batchSize: 1 });
    const current = await AuditOutbox.findById(retried._id)
      .select("_id status attempts manualRetryCount lastError")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Audit event retry submitted",
      data: current ? {
        id: String(current._id),
        status: current.status,
        attempts: current.attempts,
        manualRetryCount: current.manualRetryCount ?? 0,
        lastError: current.lastError ?? null,
      } : null,
    });
  } catch (error) {
    return next(error);
  }
};
