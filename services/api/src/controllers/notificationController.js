import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import { guardianPortalAccessFilter } from "../utils/guardianPortalAccess.js";

const validId = mongoose.isValidObjectId;
const invalid = (res, message) => res.status(400).json({ success: false, message });
const PAGE_SIZE = 100;

const getAuthorizedStudentIds = async (req) => {
  if (req.auth.role === "student") {
    const student = await Student.findOne({
      tenantId: req.tenantId, userId: req.auth.userId, status: "active",
    }).select("_id").lean();
    if (!student) return { error: [409, "Your student account has not been linked by the school"] };
    return { ids: [student._id] };
  }
  const guardian = await Guardian.findOne({
    tenantId: req.tenantId, userId: req.auth.userId, status: "active",
  }).select("_id").lean();
  if (!guardian) return { error: [409, "Your parent account has not been linked by the school"] };
  const links = await StudentGuardian.find({
    tenantId: req.tenantId,
    guardianId: guardian._id,
    status: "active",
    receivesCommunication: true,
    ...guardianPortalAccessFilter(),
  }).select("studentId").lean();
  return { ids: [...new Set(links.map((link) => String(link.studentId)))] };
};

export const listMyNotifications = async (req, res, next) => {
  try {
    const limitValue = req.query.limit === undefined ? 30 : Number(req.query.limit);
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > PAGE_SIZE) {
      return invalid(res, "Notification limit must be between 1 and 100");
    }
    const authorization = await getAuthorizedStudentIds(req);
    if (authorization.error) return res.status(authorization.error[0]).json({ success: false, message: authorization.error[1] });
    if (!authorization.ids.length) return res.status(200).json({ success: true, data: [], unreadCount: 0, nextCursor: null });
    const filter = {
      tenantId: req.tenantId,
      recipientUserId: req.auth.userId,
      deliveryStatus: "delivered",
      relatedStudentIds: { $in: authorization.ids },
    };
    if (req.query.unread !== undefined) {
      if (!["true", "false"].includes(req.query.unread)) return invalid(res, "Invalid unread filter");
      filter.readAt = req.query.unread === "true" ? null : { $ne: null };
    }
    if (req.query.before !== undefined) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) return invalid(res, "Invalid notification cursor");
      filter.createdAt = { $lt: before };
    }
    const [data, unreadCount] = await Promise.all([
      Notification.find(filter)
        .select("eventType sourceType sourceId title body link deliveryStatus deliveredAt readAt createdAt relatedStudentIds")
        .sort({ createdAt: -1, _id: -1 }).limit(limitValue).lean(),
      Notification.countDocuments({
        tenantId: req.tenantId,
        recipientUserId: req.auth.userId,
        deliveryStatus: "delivered",
        relatedStudentIds: { $in: authorization.ids },
        readAt: null,
      }),
    ]);
    const authorizedStudentIds = new Set(authorization.ids.map((id) => String(id)));
    const visibleData = data.map((item) => ({
      ...item,
      relatedStudentIds: (item.relatedStudentIds || []).filter((id) => authorizedStudentIds.has(String(id))),
    }));
    return res.status(200).json({
      success: true,
      data: visibleData,
      unreadCount,
      nextCursor: data.length === limitValue ? data[data.length - 1].createdAt : null,
    });
  } catch (error) { return next(error); }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    if (!validId(req.params.notificationId)) return invalid(res, "Invalid notification ID");
    const authorization = await getAuthorizedStudentIds(req);
    if (authorization.error) return res.status(authorization.error[0]).json({ success: false, message: authorization.error[1] });
    if (!authorization.ids.length) return res.status(404).json({ success: false, message: "Notification not found" });
    const data = await Notification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        tenantId: req.tenantId,
        recipientUserId: req.auth.userId,
        deliveryStatus: "delivered",
        relatedStudentIds: { $in: authorization.ids },
      },
      { $set: { readAt: new Date() } },
      { new: true },
    ).select("_id readAt");
    if (!data) return res.status(404).json({ success: false, message: "Notification not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    if (req.body && Object.keys(req.body).length) return invalid(res, "Marking notifications read does not accept a request body");
    const authorization = await getAuthorizedStudentIds(req);
    if (authorization.error) return res.status(authorization.error[0]).json({ success: false, message: authorization.error[1] });
    if (!authorization.ids.length) return res.status(200).json({ success: true, data: { modifiedCount: 0 } });
    const result = await Notification.updateMany(
      {
        tenantId: req.tenantId,
        recipientUserId: req.auth.userId,
        deliveryStatus: "delivered",
        relatedStudentIds: { $in: authorization.ids },
        readAt: null,
      },
      { $set: { readAt: new Date() } },
    );
    return res.status(200).json({ success: true, data: { modifiedCount: result.modifiedCount } });
  } catch (error) { return next(error); }
};

export const listNotificationDelivery = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status !== undefined) {
      if (!["pending", "processing", "delivered", "failed", "cancelled"].includes(req.query.status)) return invalid(res, "Invalid delivery status");
      filter.deliveryStatus = req.query.status;
    }
    if (req.query.eventType !== undefined) {
      if (req.query.eventType !== "announcement_published") return invalid(res, "Invalid notification event type");
      filter.eventType = req.query.eventType;
    }
    if (req.query.recipientUserId !== undefined) {
      if (!validId(req.query.recipientUserId)) return invalid(res, "Invalid recipient user ID");
      filter.recipientUserId = req.query.recipientUserId;
    }
    const data = await Notification.find(filter)
      .populate("recipientUserId", "firstName lastName role")
      .select("recipientUserId recipientRole eventType sourceType sourceId title deliveryStatus attempts nextAttemptAt deliveredAt lastError deliveryHistory createdAt")
      .sort({ createdAt: -1, _id: -1 }).limit(200).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};
