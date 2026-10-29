import mongoose from "mongoose";
import AuditLog, { AUDIT_ACTIONS } from "../models/AuditLog.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const validId = (id) => mongoose.isObjectIdOrHexString(id);

function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const listAuditLogs = async (req, res, next) => {
  try {
    const query = req.query ?? {};
    const page = Number.parseInt(query.page ?? "1", 10);
    const limit = Number.parseInt(query.limit ?? "20", 10);

    if (!Number.isInteger(page) || page < 1 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return sendError(res, 400, "Page must be positive and limit must be between 1 and 100");
    }

    const filter = {};
    const platformAdmin = req.auth?.role === "platform_admin";

    if (platformAdmin) {
      if (query.tenantId !== undefined) {
        if (typeof query.tenantId !== "string" || !validId(query.tenantId)) {
          return sendError(res, 400, "Invalid school filter");
        }
        filter.targetTenantId = new mongoose.Types.ObjectId(query.tenantId);
      }
    } else {
      if (!validId(req.auth?.tenantId)) {
        return sendError(res, 403, "A valid school context is required");
      }
      // School administrators can only inspect events affecting their own school.
      filter.targetTenantId = new mongoose.Types.ObjectId(req.auth.tenantId);
    }

    if (query.action !== undefined) {
      if (typeof query.action !== "string" || !AUDIT_ACTIONS.includes(query.action)) {
        return sendError(res, 400, "Invalid audit action filter");
      }
      filter.action = query.action;
    }

    for (const [queryKey, filterKey] of [
      ["actorUserId", "actorUserId"],
      ["targetUserId", "targetUserId"],
    ]) {
      if (query[queryKey] !== undefined) {
        if (typeof query[queryKey] !== "string" || !validId(query[queryKey])) {
          return sendError(res, 400, `Invalid ${queryKey} filter`);
        }
        filter[filterKey] = new mongoose.Types.ObjectId(query[queryKey]);
      }
    }

    if (query.from !== undefined) {
      const from = parseDate(query.from);
      if (!from) return sendError(res, 400, "Invalid from date");
      filter.createdAt = { ...(filter.createdAt ?? {}), $gte: from };
    }
    if (query.to !== undefined) {
      const to = parseDate(query.to);
      if (!to) return sendError(res, 400, "Invalid to date");
      filter.createdAt = { ...(filter.createdAt ?? {}), $lte: to };
    }
    if (filter.createdAt?.$gte && filter.createdAt?.$lte &&
        filter.createdAt.$gte > filter.createdAt.$lte) {
      return sendError(res, 400, "The from date must not be after the to date");
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .select("_id actorUserId actorRole tenantId targetUserId targetTenantId action changedFields previousValue newValue createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: logs.map((log) => ({
        id: String(log._id),
        actorUserId: String(log.actorUserId),
        actorRole: log.actorRole,
        tenantId: log.tenantId ? String(log.tenantId) : null,
        targetUserId: String(log.targetUserId),
        targetTenantId: log.targetTenantId ? String(log.targetTenantId) : null,
        action: log.action,
        changedFields: log.changedFields ?? [],
        previousValue: log.previousValue ?? null,
        newValue: log.newValue ?? null,
        createdAt: log.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};
