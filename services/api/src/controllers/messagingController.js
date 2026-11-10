import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Enrollment from "../models/Enrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { guardianPortalAccessFilter } from "../utils/guardianPortalAccess.js";

const validId = mongoose.isValidObjectId;
const invalid = (res, message) => res.status(400).json({ success: false, message });
const forbidden = (res) => res.status(404).json({ success: false, message: "Conversation not found" });

async function parentContext(req, studentId = null) {
  const guardian = await Guardian.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" }).select("_id").lean();
  if (!guardian) return { error: [409, "Your parent account is not linked to an active guardian record"] };
  const links = await StudentGuardian.find({
    tenantId: req.tenantId, guardianId: guardian._id, status: "active",
    receivesCommunication: true, ...guardianPortalAccessFilter(),
    ...(studentId ? { studentId } : {}),
  }).select("studentId").lean();
  const ids = [...new Set(links.map((link) => String(link.studentId)))];
  if (!ids.length) return { guardian, studentIds: [], error: studentId ? [404, "Student is not available for communication"] : null };
  const students = await Student.find({ tenantId: req.tenantId, _id: { $in: ids }, status: "active" }).select("_id").lean();
  const activeIds = students.map((student) => String(student._id));
  return { guardian, studentIds: activeIds, error: studentId && !activeIds.includes(String(studentId)) ? [404, "Student is not available for communication"] : null };
}

async function teacherCanAccessConversation(req, conversation) {
  const [enrollment, assignment] = await Promise.all([
    Enrollment.findOne({
      _id: conversation.enrollmentId, tenantId: req.tenantId, studentId: conversation.studentId,
      status: "active",
    }).select("_id classId sectionId academicYearId").lean(),
    TeacherAssignment.findOne({
      _id: conversation.teacherAssignmentId, tenantId: req.tenantId,
      teacherId: req.auth.userId, status: "active",
    }).select("_id classId sectionId academicYearId").lean(),
  ]);
  if (!enrollment || !assignment) return false;
  return String(enrollment.classId) === String(assignment.classId)
    && String(enrollment.academicYearId) === String(assignment.academicYearId)
    && (!assignment.sectionId || String(assignment.sectionId) === String(enrollment.sectionId));
}

async function authorizeConversation(req, conversation) {
  if (!conversation || String(conversation.tenantId) !== String(req.tenantId)) return false;
  if (req.auth.role === "parent") {
    if (String(conversation.parentUserId) !== String(req.auth.userId)) return false;
    const context = await parentContext(req, conversation.studentId);
    return !context.error && String(context.guardian._id) === String(conversation.guardianId);
  }
  if (req.auth.role === "teacher") {
    return String(conversation.teacherUserId) === String(req.auth.userId)
      && teacherCanAccessConversation(req, conversation);
  }
  return false;
}

const conversationPopulate = [
  { path: "studentId", select: "firstName lastName admissionNumber" },
  { path: "teacherUserId", select: "firstName lastName" },
  { path: "parentUserId", select: "firstName lastName" },
];

export const listMessagingContacts = async (req, res, next) => {
  try {
    if (req.auth.role === "parent") {
      const context = await parentContext(req);
      if (context.error) return res.status(context.error[0]).json({ success: true, data: [] });
      const enrollments = await Enrollment.find({
        tenantId: req.tenantId, studentId: { $in: context.studentIds }, status: "active",
      }).select("studentId classId sectionId academicYearId").lean();
      const assignments = enrollments.length ? await TeacherAssignment.find({
        tenantId: req.tenantId, status: "active",
        $or: enrollments.map((item) => ({
          classId: item.classId, academicYearId: item.academicYearId,
          $or: [{ sectionId: null }, ...(item.sectionId ? [{ sectionId: item.sectionId }] : [])],
        })),
      }).select("teacherId subjectId classId sectionId academicYearId").populate("teacherId", "firstName lastName status").populate("subjectId", "name").lean() : [];
      const activeStudents = await Student.find({ tenantId: req.tenantId, _id: { $in: enrollments.map((item) => item.studentId) }, status: "active" })
        .select("_id firstName lastName admissionNumber").lean();
      const data = assignments.filter((item) => item.teacherId?.status === "active").map((item) => {
        const matchedIds = enrollments.filter((enrollment) => String(enrollment.classId) === String(item.classId)
          && String(enrollment.academicYearId) === String(item.academicYearId)
          && (!item.sectionId || String(enrollment.sectionId) === String(item.sectionId))).map((enrollment) => String(enrollment.studentId));
        return {
          teacher: item.teacherId, subject: item.subjectId, classId: item.classId, sectionId: item.sectionId,
          students: activeStudents.filter((student) => matchedIds.includes(String(student._id))),
        };
      }).filter((item) => item.students.length);
      return res.status(200).json({ success: true, data });
    }
    if (req.auth.role === "teacher") {
      const assignments = await TeacherAssignment.find({ tenantId: req.tenantId, teacherId: req.auth.userId, status: "active" })
        .select("classId sectionId academicYearId").lean();
      const enrollments = assignments.length ? await Enrollment.find({
        tenantId: req.tenantId, status: "active",
        $or: assignments.map((item) => ({
          classId: item.classId, academicYearId: item.academicYearId,
          ...(item.sectionId ? { sectionId: item.sectionId } : {}),
        })),
      }).select("studentId").lean() : [];
      const students = enrollments.length ? await Student.find({
        tenantId: req.tenantId, _id: { $in: enrollments.map((item) => item.studentId) }, status: "active",
      }).select("_id firstName lastName admissionNumber").lean() : [];
      return res.status(200).json({ success: true, data: students });
    }
    return res.status(403).json({ success: false, message: "Messaging contacts are not available for this role" });
  } catch (error) { return next(error); }
};

export const listConversations = async (req, res, next) => {
  try {
    if (!["parent", "teacher"].includes(req.auth.role)) return res.status(403).json({ success: false, message: "Messaging is not available for this role" });
    let filter = { tenantId: req.tenantId, status: "open" };
    if (req.auth.role === "parent") {
      const context = await parentContext(req);
      if (context.error) return res.status(200).json({ success: true, data: [] });
      filter.parentUserId = req.auth.userId;
      filter.studentId = { $in: context.studentIds };
    } else {
      filter.teacherUserId = req.auth.userId;
      const assignments = await TeacherAssignment.find({ tenantId: req.tenantId, teacherId: req.auth.userId, status: "active" }).select("classId sectionId academicYearId").lean();
      const enrollments = assignments.length ? await Enrollment.find({
        tenantId: req.tenantId, status: "active",
        $or: assignments.map((item) => ({ classId: item.classId, academicYearId: item.academicYearId, ...(item.sectionId ? { sectionId: item.sectionId } : {}) })),
      }).select("_id studentId").lean() : [];
      filter.enrollmentId = { $in: enrollments.map((item) => item._id) };
    }
    const data = await Conversation.find(filter).populate(conversationPopulate)
      .sort({ lastMessageAt: -1, updatedAt: -1, _id: -1 }).limit(200).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createConversation = async (req, res, next) => {
  try {
    if (req.auth.role !== "parent") return res.status(403).json({ success: false, message: "Only an authorized parent can initiate a conversation" });
    const { studentId, teacherId, message } = req.body || {};
    if (!validId(studentId) || !validId(teacherId)) return invalid(res, "Select a valid student and teacher");
    if (typeof message !== "string" || !message.trim() || message.trim().length > 5000) return invalid(res, "The first message is required and must not exceed 5,000 characters");
    const context = await parentContext(req, studentId);
    if (context.error) return res.status(context.error[0]).json({ success: false, message: context.error[1] });
    const [enrollment, teacher] = await Promise.all([
      Enrollment.findOne({ tenantId: req.tenantId, studentId, status: "active" }).select("_id classId sectionId academicYearId").lean(),
      User.findOne({ _id: teacherId, tenantId: req.tenantId, role: "teacher", status: "active" }).select("_id").lean(),
    ]);
    if (!enrollment || !teacher) return res.status(404).json({ success: false, message: "Student or teacher is not available" });
    const assignment = await TeacherAssignment.findOne({
      tenantId: req.tenantId, teacherId, classId: enrollment.classId,
      academicYearId: enrollment.academicYearId, status: "active",
      ...(enrollment.sectionId ? { $or: [{ sectionId: null }, { sectionId: enrollment.sectionId }] } : { sectionId: null }),
    }).select("_id").lean();
    if (!assignment) return res.status(403).json({ success: false, message: "This teacher is not assigned to the selected student" });
    const session = await mongoose.startSession();
    let conversation;
    try {
      await session.withTransaction(async () => {
        conversation = await Conversation.findOneAndUpdate({
          tenantId: req.tenantId, studentId, guardianId: context.guardian._id,
          parentUserId: req.auth.userId, teacherUserId: teacherId,
        }, {
          $setOnInsert: {
            tenantId: req.tenantId, studentId, enrollmentId: enrollment._id,
            guardianId: context.guardian._id, parentUserId: req.auth.userId,
            teacherUserId: teacherId, teacherAssignmentId: assignment._id,
            createdBy: req.auth.userId, status: "open",
          },
        }, { new: true, upsert: true, session, setDefaultsOnInsert: true });
        if (conversation.status !== "open") throw Object.assign(new Error("This conversation is closed"), { code: "CONVERSATION_CLOSED" });
        const created = await Message.create([{
          tenantId: req.tenantId, conversationId: conversation._id,
          senderUserId: req.auth.userId, senderRole: "parent", body: message.trim(),
        }], { session });
        const now = created[0].createdAt || new Date();
        await Conversation.updateOne({ _id: conversation._id, tenantId: req.tenantId }, {
          $set: { lastMessageAt: now, lastMessagePreview: message.trim().slice(0, 180) },
          $inc: { teacherUnreadCount: 1 },
        }, { session });
        await Notification.updateOne({
          tenantId: req.tenantId, recipientUserId: teacherId,
          eventKey: `message:${created[0]._id}`,
        }, { $setOnInsert: {
          tenantId: req.tenantId, recipientUserId: teacherId, recipientRole: "teacher",
          eventType: "message_received", sourceType: "Conversation", sourceId: conversation._id,
          eventKey: `message:${created[0]._id}`, title: "New parent message",
          body: message.trim().slice(0, 500), link: "/teacher?tab=messaging",
          relatedStudentIds: [studentId], deliveryStatus: "pending", attempts: 0,
          nextAttemptAt: new Date(), readAt: null,
        } }, { upsert: true, session });
      });
    } finally { await session.endSession(); }
    return res.status(201).json({ success: true, data: await Conversation.findById(conversation._id).populate(conversationPopulate).lean() });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A matching conversation already exists; refresh your inbox" });
    if (error.code === "CONVERSATION_CLOSED") return res.status(409).json({ success: false, message: error.message });
    return next(error);
  }
};

export const listConversationMessages = async (req, res, next) => {
  try {
    if (!validId(req.params.conversationId)) return invalid(res, "Invalid conversation ID");
    const conversation = await Conversation.findOne({ _id: req.params.conversationId, tenantId: req.tenantId }).lean();
    if (!await authorizeConversation(req, conversation)) return forbidden(res);
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && Number.isNaN(before.getTime())) return invalid(res, "Invalid message cursor");
    const data = await Message.find({
      tenantId: req.tenantId, conversationId: conversation._id,
      ...(before ? { createdAt: { $lt: before } } : {}),
    }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.status(200).json({ success: true, data: data.reverse(), conversation });
  } catch (error) { return next(error); }
};

export const sendConversationMessage = async (req, res, next) => {
  try {
    if (!validId(req.params.conversationId)) return invalid(res, "Invalid conversation ID");
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim() || body.trim().length > 5000) return invalid(res, "Message must contain 1 to 5,000 characters");
    const conversation = await Conversation.findOne({ _id: req.params.conversationId, tenantId: req.tenantId });
    if (!await authorizeConversation(req, conversation?.toObject())) return forbidden(res);
    if (conversation.status !== "open") return res.status(409).json({ success: false, message: "This conversation is closed" });
    const senderIsParent = req.auth.role === "parent";
    const recipientUserId = senderIsParent ? conversation.teacherUserId : conversation.parentUserId;
    const recipientRole = senderIsParent ? "teacher" : "parent";
    const session = await mongoose.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        [created] = await Message.create([{
          tenantId: req.tenantId, conversationId: conversation._id,
          senderUserId: req.auth.userId, senderRole: req.auth.role, body: body.trim(),
        }], { session });
        const updated = await Conversation.updateOne({ _id: conversation._id, tenantId: req.tenantId, status: "open" }, {
          $set: { lastMessageAt: created.createdAt || new Date(), lastMessagePreview: body.trim().slice(0, 180) },
          $inc: senderIsParent ? { teacherUnreadCount: 1 } : { parentUnreadCount: 1 },
        }, { session });
        if (!updated.matchedCount) throw Object.assign(new Error("This conversation is closed"), { code: "CONVERSATION_CLOSED" });
        await Notification.updateOne({
          tenantId: req.tenantId, recipientUserId, eventKey: `message:${created._id}`,
        }, { $setOnInsert: {
          tenantId: req.tenantId, recipientUserId, recipientRole,
          eventType: "message_received", sourceType: "Conversation", sourceId: conversation._id,
          eventKey: `message:${created._id}`, title: senderIsParent ? "New parent message" : "New teacher reply",
          body: body.trim().slice(0, 500), link: senderIsParent ? "/teacher?tab=messaging" : "/portal?tab=messaging",
          relatedStudentIds: [conversation.studentId], deliveryStatus: "pending", attempts: 0,
          nextAttemptAt: new Date(), readAt: null,
        } }, { upsert: true, session });
      });
    } finally { await session.endSession(); }
    return res.status(201).json({ success: true, data: created });
  } catch (error) { return next(error); }
};

export const markConversationRead = async (req, res, next) => {
  try {
    if (!validId(req.params.conversationId)) return invalid(res, "Invalid conversation ID");
    const conversation = await Conversation.findOne({ _id: req.params.conversationId, tenantId: req.tenantId });
    if (!await authorizeConversation(req, conversation?.toObject())) return forbidden(res);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Message.updateMany({
          tenantId: req.tenantId, conversationId: conversation._id,
          senderUserId: { $ne: req.auth.userId }, readAt: null,
        }, { $set: { readAt: new Date() } }, { session });
        await Conversation.updateOne({ _id: conversation._id, tenantId: req.tenantId }, {
          $set: req.auth.role === "parent" ? { parentUnreadCount: 0 } : { teacherUnreadCount: 0 },
        }, { session });
        await Notification.updateMany({
          tenantId: req.tenantId, recipientUserId: req.auth.userId,
          sourceId: conversation._id, eventType: "message_received", readAt: null,
        }, { $set: { readAt: new Date() } }, { session });
      });
    } finally { await session.endSession(); }
    return res.status(200).json({ success: true, data: { read: true } });
  } catch (error) { return next(error); }
};

export const closeConversation = async (req, res, next) => {
  try {
    if (!validId(req.params.conversationId)) return invalid(res, "Invalid conversation ID");
    if (req.body && Object.keys(req.body).length) return invalid(res, "Closing does not accept a request body");
    const conversation = await Conversation.findOne({ _id: req.params.conversationId, tenantId: req.tenantId });
    if (!await authorizeConversation(req, conversation?.toObject())) return forbidden(res);
    if (conversation.status === "closed") return res.status(200).json({ success: true, data: conversation });
    conversation.status = "closed";
    conversation.closedAt = new Date();
    conversation.closedBy = req.auth.userId;
    await conversation.save();
    return res.status(200).json({ success: true, data: conversation });
  } catch (error) { return next(error); }
};

export const listMessagingOversight = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status !== undefined) {
      if (!["open", "closed"].includes(req.query.status)) return invalid(res, "Invalid conversation status");
      filter.status = req.query.status;
    }
    const data = await Conversation.find(filter)
      .select("studentId parentUserId teacherUserId status createdAt updatedAt lastMessageAt parentUnreadCount teacherUnreadCount")
      .populate("studentId", "firstName lastName admissionNumber")
      .populate("parentUserId", "firstName lastName")
      .populate("teacherUserId", "firstName lastName")
      .sort({ updatedAt: -1, _id: -1 }).limit(200).lean();
    return res.status(200).json({ success: true, data, contentAccess: false });
  } catch (error) { return next(error); }
};
