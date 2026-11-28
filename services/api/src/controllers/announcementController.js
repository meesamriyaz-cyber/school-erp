import mongoose from "mongoose";
import Announcement from "../models/Announcement.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Enrollment from "../models/Enrollment.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import { guardianPortalAccessFilter } from "../utils/guardianPortalAccess.js";
import { publishAnnouncementWithNotifications } from "../services/announcementPublicationService.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const staffRoles = ["school_admin", "principal", "teacher"];
const editableFields = ["title", "body", "category", "expiresAt"];

const teacherCanTarget = async (req, { academicYearId, classId, sectionId }) => {
  if (req.auth.role !== "teacher") return true;
  return Boolean(await TeacherAssignment.exists({
    tenantId: req.tenantId,
    teacherId: req.auth.userId,
    academicYearId,
    classId,
    status: "active",
    ...(sectionId
      ? { $or: [{ sectionId }, { sectionId: null }] }
      : { sectionId: null }),
  }));
};

const auditEntry = (req, action, changedFields = []) => ({
  action,
  actorUserId: req.auth.userId,
  actorRole: req.auth.role,
  changedFields,
  changedAt: new Date(),
});

const parseExpiry = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const listAnnouncements = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status !== undefined) {
      if (!["draft", "published", "archived"].includes(req.query.status)) return invalid(res, "Invalid announcement status");
      filter.status = req.query.status;
    }
    if (req.query.academicYearId !== undefined) {
      if (!validId(req.query.academicYearId)) return invalid(res, "Invalid academic year");
      filter.academicYearId = req.query.academicYearId;
    }
    if (req.auth.role === "teacher") {
      const assignments = await TeacherAssignment.find({
        tenantId: req.tenantId, teacherId: req.auth.userId, status: "active",
      }).select("academicYearId classId sectionId").lean();
      const scopes = assignments.flatMap((item) => [
        { academicYearId: item.academicYearId, audienceType: "CLASS", classId: item.classId },
        ...(item.sectionId
          ? [{ academicYearId: item.academicYearId, audienceType: "SECTION", classId: item.classId, sectionId: item.sectionId }]
          : []),
      ]);
      filter.$or = [
        { audienceType: "SCHOOL", status: "published" },
        ...scopes,
        { createdBy: req.auth.userId, status: "draft" },
      ];
      filter.$and = [{ $or: [{ status: "published" }, { createdBy: req.auth.userId }] }];
    }
    const data = await Announcement.find(filter)
      .populate("academicYearId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("createdBy", "firstName lastName")
      .sort({ updatedAt: -1, _id: -1 }).limit(300).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const body = req.body;
    const allowed = ["title", "body", "category", "audienceType", "academicYearId", "classId", "sectionId", "expiresAt"];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) {
      return invalid(res, "Provide only supported announcement fields");
    }
    const {
      title, body: content, category = "general", audienceType,
      academicYearId, classId = null, sectionId = null,
    } = body;
    if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 160) return invalid(res, "Title must be between 3 and 160 characters");
    if (typeof content !== "string" || !content.trim() || content.trim().length > 10000) return invalid(res, "Notice content is required and must not exceed 10,000 characters");
    if (!["general", "academic", "examination", "event", "holiday", "urgent"].includes(category)) return invalid(res, "Invalid announcement category");
    if (!["SCHOOL", "CLASS", "SECTION"].includes(audienceType)) return invalid(res, "Invalid announcement audience");
    if (!validId(academicYearId)) return invalid(res, "Select a valid academic year");
    if (audienceType === "SCHOOL" && (classId !== null || sectionId !== null)) return invalid(res, "School-wide notices cannot include a class or section");
    if (audienceType === "CLASS" && (!validId(classId) || sectionId !== null)) return invalid(res, "Class notices require a class and no section");
    if (audienceType === "SECTION" && (!validId(classId) || !validId(sectionId))) return invalid(res, "Section notices require a class and section");

    const [year, schoolClass, section] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId, status: "active" }).select("_id").lean(),
      classId ? SchoolClass.findOne({ _id: classId, tenantId: req.tenantId, academicYearId, status: "active" }).select("_id").lean() : null,
      sectionId ? Section.findOne({ _id: sectionId, tenantId: req.tenantId, classId, status: "active" }).select("_id").lean() : null,
    ]);
    if (!year || (classId && !schoolClass) || (sectionId && !section)) return invalid(res, "The selected academic year, class or section is not active in this school");
    if (!await teacherCanTarget(req, { academicYearId, classId, sectionId })) {
      return res.status(403).json({ success: false, message: "You are not assigned to this class or section" });
    }
    const expiresAt = parseExpiry(body.expiresAt);
    if (expiresAt === undefined) return invalid(res, "Provide a valid expiry date");
    const data = await Announcement.create({
      tenantId: req.tenantId, title: title.trim(), body: content.trim(), category,
      audienceType, academicYearId, classId, sectionId, expiresAt,
      createdBy: req.auth.userId, updatedBy: req.auth.userId,
      auditTrail: [auditEntry(req, "created", allowed.filter((key) => body[key] !== undefined))],
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more announcement fields are invalid");
    return next(error);
  }
};

export const getAnnouncement = async (req, res, next) => {
  try {
    if (!validId(req.params.announcementId)) return invalid(res, "Invalid announcement ID");
    const data = await Announcement.findOne({ _id: req.params.announcementId, tenantId: req.tenantId })
      .populate("academicYearId", "name").populate("classId", "name").populate("sectionId", "name").lean();
    if (!data) return res.status(404).json({ success: false, message: "Announcement not found" });
    if (req.auth.role === "teacher") {
      const canReadSchoolNotice = data.audienceType === "SCHOOL" && data.status === "published";
      const ownsDraft = data.status === "draft" && String(data.createdBy) === req.auth.userId;
      if (!canReadSchoolNotice && !ownsDraft && !(await teacherCanTarget(req, data))) {
        return res.status(404).json({ success: false, message: "Announcement not found" });
      }
    }
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    if (!validId(req.params.announcementId)) return invalid(res, "Invalid announcement ID");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some((key) => !editableFields.includes(key))) {
      return invalid(res, "Only title, body, category and expiresAt may be updated");
    }
    const filter = { _id: req.params.announcementId, tenantId: req.tenantId, status: "draft" };
    const existing = await Announcement.findOne(filter).lean();
    if (!existing || (req.auth.role === "teacher" && (String(existing.createdBy) !== req.auth.userId || !(await teacherCanTarget(req, existing))))) {
      return res.status(404).json({ success: false, message: "Draft announcement not found" });
    }
    const update = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.trim().length > 160) return invalid(res, "Title must be between 3 and 160 characters");
      update.title = body.title.trim();
    }
    if (body.body !== undefined) {
      if (typeof body.body !== "string" || !body.body.trim() || body.body.trim().length > 10000) return invalid(res, "Notice content is required and must not exceed 10,000 characters");
      update.body = body.body.trim();
    }
    if (body.category !== undefined) {
      if (!["general", "academic", "examination", "event", "holiday", "urgent"].includes(body.category)) return invalid(res, "Invalid announcement category");
      update.category = body.category;
    }
    if (body.expiresAt !== undefined) {
      const expiresAt = parseExpiry(body.expiresAt);
      if (expiresAt === undefined) return invalid(res, "Provide a valid expiry date");
      update.expiresAt = expiresAt;
    }
    const data = await Announcement.findOneAndUpdate(filter, {
      $set: { ...update, updatedBy: req.auth.userId },
      $push: { auditTrail: auditEntry(req, "updated", Object.keys(update)) },
    }, { new: true, runValidators: true });
    if (!data) return res.status(409).json({ success: false, message: "Announcement changed; reload and try again" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const publishAnnouncement = async (req, res, next) => {
  try {
    if (!validId(req.params.announcementId)) return invalid(res, "Invalid announcement ID");
    if (req.body && Object.keys(req.body).length) return invalid(res, "Publishing does not accept a request body");
    const filter = { _id: req.params.announcementId, tenantId: req.tenantId, status: "draft" };
    const existing = await Announcement.findOne(filter).lean();
    if (!existing || (req.auth.role === "teacher" && (String(existing.createdBy) !== req.auth.userId || !(await teacherCanTarget(req, existing))))) {
      return res.status(404).json({ success: false, message: "Draft announcement not found" });
    }
    if (existing.expiresAt && new Date(existing.expiresAt) <= new Date()) return invalid(res, "Expiry must be in the future before publication");
    const now = new Date();
    let data;
    try {
      data = await publishAnnouncementWithNotifications({
        filter,
        tenantId: req.tenantId,
        update: {
          $set: { status: "published", publishedAt: now, updatedBy: req.auth.userId },
          $push: { auditTrail: auditEntry(req, "published") },
        },
      });
    } catch (error) {
      if (error.code === "ANNOUNCEMENT_CONFLICT") {
        return res.status(409).json({ success: false, message: "Announcement changed; reload and try again" });
      }
      throw error;
    }
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const archiveAnnouncement = async (req, res, next) => {
  try {
    if (!validId(req.params.announcementId)) return invalid(res, "Invalid announcement ID");
    if (req.body && Object.keys(req.body).length) return invalid(res, "Archiving does not accept a request body");
    const filter = { _id: req.params.announcementId, tenantId: req.tenantId, status: "published" };
    const existing = await Announcement.findOne(filter).lean();
    if (!existing || (req.auth.role === "teacher" && (String(existing.createdBy) !== req.auth.userId || !(await teacherCanTarget(req, existing))))) {
      return res.status(404).json({ success: false, message: "Published announcement not found" });
    }
    const data = await Announcement.findOneAndUpdate(filter, {
      $set: { status: "archived", archivedAt: new Date(), updatedBy: req.auth.userId },
      $push: { auditTrail: auditEntry(req, "archived") },
    }, { new: true, runValidators: true });
    if (!data) return res.status(409).json({ success: false, message: "Announcement changed; reload and try again" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getPortalAnnouncements = async (req, res, next) => {
  try {
    let studentIds = [];
    if (req.auth.role === "student") {
      const student = await Student.findOne({
        tenantId: req.tenantId, userId: req.auth.userId, status: "active",
      }).select("_id").lean();
      if (!student) return res.status(409).json({ success: false, message: "Your student account has not been linked by the school" });
      studentIds = [student._id];
    } else {
      const guardian = await Guardian.findOne({
        tenantId: req.tenantId, userId: req.auth.userId, status: "active",
      }).select("_id").lean();
      if (!guardian) return res.status(409).json({ success: false, message: "Your parent account has not been linked by the school" });
      const links = await StudentGuardian.find({
        tenantId: req.tenantId, guardianId: guardian._id, status: "active",
        receivesCommunication: true,
        ...guardianPortalAccessFilter(),
      }).select("studentId").lean();
      studentIds = links.map((link) => link.studentId);
    }
    if (!studentIds.length) return res.status(200).json({ success: true, data: [] });
    const enrollments = await Enrollment.find({
      tenantId: req.tenantId, studentId: { $in: studentIds }, status: "active",
    }).select("studentId academicYearId classId sectionId").lean();
    if (!enrollments.length) return res.status(200).json({ success: true, data: [] });
    const audience = enrollments.map((enrollment) => ({
      academicYearId: enrollment.academicYearId,
      $or: [
        { audienceType: "SCHOOL" },
        { audienceType: "CLASS", classId: enrollment.classId },
        { audienceType: "SECTION", classId: enrollment.classId, sectionId: enrollment.sectionId },
      ],
    }));
    const now = new Date();
    const data = await Announcement.find({
      tenantId: req.tenantId, status: "published", publishedAt: { $lte: now },
      $and: [
        { $or: audience },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      ],
    }).select("title body category audienceType publishedAt expiresAt academicYearId classId sectionId")
      .sort({ publishedAt: -1, _id: -1 }).limit(200).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};
