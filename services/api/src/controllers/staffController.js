import mongoose from "mongoose";
import Staff from "../models/Staff.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import TimetableEntry from "../models/TimetableEntry.js";

const CREATE_FIELDS = ["userId", "employeeCode", "firstName", "lastName", "email", "phone", "employeeType", "designation", "department", "employmentType", "joiningDate", "qualification", "experienceYears"];
const UPDATE_FIELDS = CREATE_FIELDS.filter((field) => field !== "userId");
const STATUSES = ["active", "on_leave", "suspended", "separated"];
const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isObjectIdOrHexString(value);
const serialize = (record) => ({
  id: String(record._id), userId: record.userId ? String(record.userId._id || record.userId) : null,
  linkedUser: record.userId && typeof record.userId === "object" ? { id: String(record.userId._id), firstName: record.userId.firstName, lastName: record.userId.lastName, email: record.userId.email, role: record.userId.role, status: record.userId.status } : null,
  employeeCode: record.employeeCode || null, firstName: record.firstName, lastName: record.lastName,
  email: record.email || null, phone: record.phone || null, employeeType: record.employeeType,
  designation: record.designation, department: record.department || null, employmentType: record.employmentType,
  joiningDate: record.joiningDate, qualification: record.qualification || null,
  experienceYears: record.experienceYears, employmentStatus: record.employmentStatus,
  separationDate: record.separationDate || null, createdAt: record.createdAt, updatedAt: record.updatedAt,
});

function parseFields(body, allowed, res, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide staff details"), null;
  if (Object.keys(body).some((key) => !allowed.includes(key))) return invalid(res, "One or more unsupported staff fields were provided"), null;
  if (!partial && ["firstName", "employeeType", "designation", "employmentType", "joiningDate"].some((key) => !Object.hasOwn(body, key))) return invalid(res, "Name, staff category, designation, employment type and joining date are required"), null;
  const fields = Object.fromEntries(allowed.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
  for (const key of ["firstName", "lastName", "email", "phone", "employeeCode", "employeeType", "designation", "department", "employmentType", "qualification"]) {
    if (Object.hasOwn(fields, key) && fields[key] !== null && typeof fields[key] !== "string") return invalid(res, `${key} must be a string`), null;
  }
  if (Object.hasOwn(fields, "firstName") && (!fields.firstName.trim() || fields.firstName.trim().length > 80)) return invalid(res, "First name is required and must not exceed 80 characters"), null;
  if (Object.hasOwn(fields, "lastName") && (fields.lastName || "").trim().length > 80) return invalid(res, "Last name must not exceed 80 characters"), null;
  if (Object.hasOwn(fields, "employeeCode") && fields.employeeCode != null && fields.employeeCode.trim().length > 30) return invalid(res, "Employee code must not exceed 30 characters"), null;
  if (Object.hasOwn(fields, "email") && fields.email != null && fields.email && (fields.email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(fields.email.trim()))) return invalid(res, "Provide a valid email address"), null;
  if (Object.hasOwn(fields, "phone") && fields.phone != null && fields.phone.length > 20) return invalid(res, "Phone must not exceed 20 characters"), null;
  if (Object.hasOwn(fields, "employeeType") && !["teaching", "non_teaching"].includes(fields.employeeType)) return invalid(res, "Staff category must be teaching or non-teaching"), null;
  if (Object.hasOwn(fields, "employmentType") && !["full_time", "part_time", "contractual", "temporary"].includes(fields.employmentType)) return invalid(res, "Invalid employment type"), null;
  if (Object.hasOwn(fields, "designation") && (!fields.designation.trim() || fields.designation.trim().length > 100)) return invalid(res, "Designation is required and must not exceed 100 characters"), null;
  if (Object.hasOwn(fields, "department") && fields.department != null && fields.department.trim().length > 100) return invalid(res, "Department must not exceed 100 characters"), null;
  if (Object.hasOwn(fields, "qualification") && fields.qualification != null && fields.qualification.trim().length > 500) return invalid(res, "Qualification must not exceed 500 characters"), null;
  if (Object.hasOwn(fields, "experienceYears") && (!Number.isFinite(fields.experienceYears) || fields.experienceYears < 0 || fields.experienceYears > 60)) return invalid(res, "Experience must be between 0 and 60 years"), null;
  if (Object.hasOwn(fields, "joiningDate")) {
    const date = new Date(fields.joiningDate);
    if (Number.isNaN(date.getTime())) return invalid(res, "Provide a valid joining date"), null;
    fields.joiningDate = date;
  }
  for (const key of ["firstName", "lastName", "employeeCode", "email", "phone", "designation", "department", "qualification"]) {
    if (typeof fields[key] === "string") fields[key] = fields[key].trim() || (["lastName", "employeeCode", "email", "phone", "department", "qualification"].includes(key) ? null : fields[key]);
  }
  if (fields.email) fields.email = fields.email.toLowerCase();
  if (fields.employeeCode) fields.employeeCode = fields.employeeCode.toUpperCase();
  return fields;
}

async function validateUserLink(userId, tenantId, employeeType, session = null, requireActive = true) {
  if (!userId) {
    if (employeeType === "teaching") { const error = new Error("Teaching staff must be linked to an active teacher account"); error.code = "STAFF_TEACHER_LINK_REQUIRED"; throw error; }
    return null;
  }
  if (!validId(userId)) { const error = new Error("Invalid linked user ID"); error.code = "STAFF_USER_INVALID"; throw error; }
  let query = User.findOne({ _id: userId, tenantId, ...(requireActive ? { status: "active" } : {}) }).select("_id role");
  if (session) query = query.session(session);
  const user = await query.lean();
  if (!user) { const error = new Error("Select an active user from this school"); error.code = "STAFF_USER_INVALID"; throw error; }
  const invalidRole = employeeType === "teaching"
    ? user.role !== "teacher"
    : !["principal", "accountant", "librarian", "transport_manager"].includes(user.role);
  if (invalidRole) { const error = new Error(employeeType === "teaching" ? "Teaching staff must link to a teacher account" : "Non-teaching staff may only link to a principal, accountant, librarian or transport manager account"); error.code = "STAFF_USER_ROLE_INVALID"; throw error; }
  return user;
}

function handleError(error, res, next) {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "Employee code or linked user is already used by another staff record in this school" });
  if (["STAFF_TEACHER_LINK_REQUIRED", "STAFF_USER_INVALID", "STAFF_USER_ROLE_INVALID"].includes(error.code)) return res.status(400).json({ success: false, message: error.message });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more staff fields are invalid");
  return next(error);
}

export const listLinkableStaffUsers = async (req, res, next) => {
  try {
    const rolesByType = { teaching: ["teacher"], non_teaching: ["principal", "accountant", "librarian", "transport_manager"] };
    const roles = rolesByType[req.query.employeeType];
    if (!roles) return invalid(res, "Staff category must be teaching or non-teaching");
    const users = await User.find({ tenantId: req.tenantId, status: "active", role: { $in: roles } })
      .select("_id firstName lastName email role")
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .limit(100)
      .lean();
    return res.status(200).json({ success: true, data: users.map((user) => ({
      id: String(user._id), firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role,
    })) });
  } catch (error) { return next(error); }
};

export const listStaff = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page ?? "1", 10), limit = Number.parseInt(req.query.limit ?? "20", 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return invalid(res, "Page must be positive and limit must be between 1 and 100");
    const filter = { tenantId: req.tenantId };
    if (req.query.employeeType !== undefined) {
      if (!["teaching", "non_teaching"].includes(req.query.employeeType)) return invalid(res, "Invalid staff category");
      filter.employeeType = req.query.employeeType;
    }
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) return invalid(res, "Invalid employment status");
      filter.employmentStatus = req.query.status;
    }
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== "string" || req.query.search.trim().length > 100) return invalid(res, "Search must not exceed 100 characters");
      const term = req.query.search.trim().replaceAll("\\", "\\\\").replaceAll(".", "\\.").replaceAll("*", "\\*").replaceAll("+", "\\+").replaceAll("?", "\\?").replaceAll("^", "\\^").replaceAll("$", "\\$").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("|", "\\|").replaceAll("[", "\\[").replaceAll("]", "\\]");
      if (term) filter.$or = [{ firstName: new RegExp(term, "i") }, { lastName: new RegExp(term, "i") }, { employeeCode: new RegExp(term, "i") }, { designation: new RegExp(term, "i") }];
    }
    const [records, total] = await Promise.all([
      Staff.find(filter).populate("userId", "firstName lastName email role status").sort({ firstName: 1, lastName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Staff.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, data: records.map(serialize), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { return next(error); }
};

export const createStaff = async (req, res, next) => {
  const fields = parseFields(req.body, CREATE_FIELDS, res);
  if (!fields) return;
  try {
    await validateUserLink(fields.userId, req.tenantId, fields.employeeType);
    const record = await Staff.create({ ...fields, tenantId: req.tenantId, auditTrail: [{ action: "created", actorUserId: req.auth.userId, changedFields: Object.keys(fields) }] });
    const populated = await Staff.findOne({ _id: record._id, tenantId: req.tenantId }).populate("userId", "firstName lastName email role status").lean();
    return res.status(201).json({ success: true, data: serialize(populated) });
  } catch (error) { return handleError(error, res, next); }
};

export const getStaff = async (req, res, next) => {
  try {
    if (!validId(req.params.staffId)) return invalid(res, "Invalid staff ID");
    const record = await Staff.findOne({ _id: req.params.staffId, tenantId: req.tenantId }).populate("userId", "firstName lastName email role status").lean();
    if (!record) return res.status(404).json({ success: false, message: "Staff record not found" });
    return res.status(200).json({ success: true, data: serialize(record) });
  } catch (error) { return next(error); }
};

export const updateStaff = async (req, res, next) => {
  const fields = parseFields(req.body, UPDATE_FIELDS, res, true);
  if (!fields) return;
  if (!Object.keys(fields).length) return invalid(res, "Provide at least one staff field to update");
  try {
    const current = await Staff.findOne({ _id: req.params.staffId, tenantId: req.tenantId }).select("employeeType userId employmentStatus").lean();
    if (!current || current.employmentStatus === "separated") return res.status(404).json({ success: false, message: "Staff record not found or already separated" });
    const employeeType = fields.employeeType || current.employeeType;
    await validateUserLink(current.userId, req.tenantId, employeeType, null, false);
    const record = await Staff.findOneAndUpdate(
      { _id: req.params.staffId, tenantId: req.tenantId, employmentStatus: { $ne: "separated" } },
      { $set: fields, $push: { auditTrail: { $each: [{ action: "profile_updated", actorUserId: req.auth.userId, changedFields: Object.keys(fields) }], $slice: -50 } } },
      { new: true, runValidators: true },
    ).populate("userId", "firstName lastName email role status").lean();
    if (!record) return res.status(404).json({ success: false, message: "Staff record not found or already separated" });
    return res.status(200).json({ success: true, data: serialize(record) });
  } catch (error) { return handleError(error, res, next); }
};

export const updateStaffStatus = async (req, res, next) => {
  const { status, separationDate } = req.body ?? {};
  if (!STATUSES.includes(status)) return invalid(res, "Invalid employment status");
  if (Object.keys(req.body ?? {}).some((key) => !["status", "separationDate"].includes(key))) return invalid(res, "Only status and separationDate may be changed");
  if (status === "separated" && separationDate !== undefined && Number.isNaN(new Date(separationDate).getTime())) return invalid(res, "Provide a valid separation date");
  if (status !== "separated" && separationDate !== undefined) return invalid(res, "Separation date is only valid when separating an employee");
  const session = await mongoose.startSession();
  let updatedId = null;
  try {
    await session.withTransaction(async () => {
      const record = await Staff.findOne({ _id: req.params.staffId, tenantId: req.tenantId }).select("+auditTrail").session(session);
      if (!record) { const error = new Error("Staff record not found"); error.code = "STAFF_NOT_FOUND"; throw error; }
      if (record.employmentStatus === "separated") { const error = new Error("Separated staff records are terminal and cannot be reactivated"); error.code = "STAFF_TERMINAL"; throw error; }
      const transitions = { active: ["on_leave", "suspended", "separated"], on_leave: ["active", "suspended", "separated"], suspended: ["active", "on_leave", "separated"] };
      if (record.employmentStatus === status) { updatedId = record._id; return; }
      if (!transitions[record.employmentStatus]?.includes(status)) { const error = new Error("Invalid employment status transition"); error.code = "STAFF_TRANSITION_INVALID"; throw error; }
      if (status === "separated" && record.employeeType === "teaching") {
        const assignments = await TeacherAssignment.find({ tenantId: req.tenantId, teacherId: record.userId, status: "active" }).select("_id").session(session).lean();
        const activePeriods = assignments.length ? await TimetableEntry.exists({ tenantId: req.tenantId, assignmentId: { $in: assignments.map((item) => item._id) }, status: "active" }).session(session) : false;
        if (assignments.length || activePeriods) { const error = new Error("Deactivate this teacher's active assignments and timetable periods before separation"); error.code = "STAFF_TEACHING_DUTIES_ACTIVE"; throw error; }
      }
      const previousStatus = record.employmentStatus;
      record.employmentStatus = status;
      record.separationDate = status === "separated" ? (separationDate ? new Date(separationDate) : new Date()) : null;
      record.auditTrail.push({ action: "status_changed", actorUserId: req.auth.userId, changedFields: ["employmentStatus", ...(status === "separated" ? ["separationDate"] : [])], previousStatus, newStatus: status });
      if (record.auditTrail.length > 50) record.auditTrail.splice(0, record.auditTrail.length - 50);
      await record.save({ session });
      if (record.userId && ["suspended", "separated"].includes(status)) {
        await User.updateOne({ _id: record.userId, tenantId: req.tenantId }, { $set: { status: "suspended" }, $inc: { authVersion: 1 } }, { session });
        await Session.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
      }
      updatedId = record._id;
    });
    const updated = await Staff.findOne({ _id: updatedId, tenantId: req.tenantId }).populate("userId", "firstName lastName email role status").lean();
    if (!updated) return res.status(404).json({ success: false, message: "Staff record not found" });
    return res.status(200).json({ success: true, data: serialize(updated) });
  } catch (error) {
    if (error.code === "STAFF_NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    if (["STAFF_TERMINAL", "STAFF_TRANSITION_INVALID", "STAFF_TEACHING_DUTIES_ACTIVE"].includes(error.code)) return res.status(409).json({ success: false, message: error.message });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};

export const listStaffHistory = async (req, res, next) => {
  try {
    if (!validId(req.params.staffId)) return invalid(res, "Invalid staff ID");
    const record = await Staff.findOne({ _id: req.params.staffId, tenantId: req.tenantId }).select("+auditTrail").lean();
    if (!record) return res.status(404).json({ success: false, message: "Staff record not found" });
    return res.status(200).json({ success: true, data: record.auditTrail || [] });
  } catch (error) { return next(error); }
};
