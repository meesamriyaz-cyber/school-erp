import mongoose from "mongoose";

import Student from "../models/Student.js";
import Enrollment from "../models/Enrollment.js";
import { getTeacherEnrollmentScope, teacherCanAccessEnrollment } from "../utils/teacherAssignmentScope.js";
import { syncLegacyStudentGuardian } from "../services/syncLegacyStudentGuardian.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";

const CREATE_FIELDS = [
  "admissionNumber", "firstName", "lastName", "dateOfBirth", "photoUrl", "address",
  "gender", "admissionDate", "guardianName", "guardianRelationship", "guardianPhone", "guardianEmail",
];
const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];
const LEGACY_GUARDIAN_FIELDS = ["guardianName", "guardianRelationship", "guardianPhone", "guardianEmail"];
const PARENT_ROLES = ["father", "mother"];
const emailPattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const validateParent = (parent, relationship) => {
  if (parent == null) return null;
  if (typeof parent !== "object" || Array.isArray(parent)) return `${relationship} details must be an object`;
  const allowed = ["firstName", "lastName", "phone", "email", "photoUrl"];
  if (Object.keys(parent).some((key) => !allowed.includes(key))) return `${relationship} contains unsupported fields`;
  const supplied = allowed.some((key) => parent[key] !== undefined && parent[key] !== null && parent[key] !== "");
  if (!supplied) return null;
  if (typeof parent.firstName !== "string" || !parent.firstName.trim()) return `${relationship} first name is required when parent details are provided`;
  if (parent.phone != null && parent.phone !== "" && (typeof parent.phone !== "string" || !/^[0-9]{10}$/.test(parent.phone))) return `${relationship} phone number must contain exactly 10 digits`;
  if (parent.email != null && parent.email !== "" && (typeof parent.email !== "string" || !emailPattern.test(parent.email.trim()) || parent.email.trim().length > 254)) return `${relationship} email address is invalid`;
  if (parent.photoUrl != null && parent.photoUrl !== "" && (typeof parent.photoUrl !== "string" || !isHttpsUrl(parent.photoUrl.trim()))) return `${relationship} photo URL must be a valid HTTPS URL`;
  for (const key of ["lastName"]) if (parent[key] != null && typeof parent[key] !== "string") return `${relationship} ${key} must be a string`;
  return null;
};
const createParentRelationship = async ({ student, parent, relationship, session }) => {
  if (!parent || !parent.firstName?.trim()) return null;
  const guardian = await Guardian.create([{
    tenantId: student.tenantId,
    firstName: parent.firstName.trim(),
    lastName: parent.lastName?.trim() || "",
    phone: parent.phone || null,
    photoUrl: parent.photoUrl || null,
    ...(parent.email ? { pendingEmail: parent.email.trim().toLowerCase() } : {}),
  }], { session });
  const [link] = await StudentGuardian.create([{
    tenantId: student.tenantId,
    studentId: student._id,
    guardianId: guardian[0]._id,
    relationship,
    source: "manual",
    isPrimary: false,
    canAccessPortal: false,
    isEmergencyContact: false,
    canPickup: false,
    receivesCommunication: true,
  }], { session });
  return { guardianId: guardian[0]._id, relationship: link.relationship, emailVerificationRequired: Boolean(parent.email) };
};

const pickFields = (source, allowedFields) => Object.fromEntries(
  allowedFields.filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]),
);
const invalidRequest = (res, message) => res.status(400).json({ success: false, message });
const isHttpsUrl = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
const handleStudentError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "This admission number already exists in this school" });
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ success: false, message: "One or more student fields are invalid" });
  }
  if (["GUARDIAN_IDENTITY_CONFLICT", "PRIMARY_GUARDIAN_REQUIRED", "PRIMARY_GUARDIAN_INACTIVE"].includes(error.code)) {
    return res.status(409).json({ success: false, message: error.message, code: error.code });
  }
  return next(error);
};

export const listStudents = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page ?? "1", 10);
    const limit = Number.parseInt(req.query.limit ?? "20", 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return invalidRequest(res, "Page must be positive and limit must be between 1 and 100");
    }
    const filter = { tenantId: req.tenantId };
    if (req.query.status !== undefined) {
      if (!["active", "inactive", "withdrawn"].includes(req.query.status)) return invalidRequest(res, "Invalid student status filter");
      filter.status = req.query.status;
    }
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== "string" || req.query.search.trim().length > 100) {
        return invalidRequest(res, "Search must not exceed 100 characters");
      }
      const search = req.query.search.trim();
      if (search) {
        const escapedSearch = search.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escapedSearch, "i");
        filter.$or = [{ admissionNumber: pattern }, { firstName: pattern }, { lastName: pattern }];
      }
    }
    if (req.auth?.role === "teacher") {
      const scopes = await getTeacherEnrollmentScope(req);
      if (!scopes.length) return res.status(200).json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const assignedStudentIds = await Enrollment.find({
        tenantId: req.tenantId, status: "active", $or: scopes,
      }).distinct("studentId");
      if (!assignedStudentIds.length) return res.status(200).json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      filter._id = { $in: assignedStudentIds };
    }
    let studentQuery = Student.find(filter).sort({ admissionNumber: 1, _id: 1 }).skip((page - 1) * limit).limit(limit);
    if (req.auth?.role === "teacher") {
      // Teachers need roster identity only, not guardian contacts or home addresses.
      studentQuery = studentQuery.select("admissionNumber firstName lastName status photoUrl");
    }
    const [students, total] = await Promise.all([
      studentQuery.lean(),
      Student.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, data: students, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { return next(error); }
};

export const createStudent = async (req, res, next) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest(res, "Provide student details");
  if (Object.hasOwn(body, "tenantId")) return invalidRequest(res, "School assignment is determined by the authenticated account");
  const fields = pickFields(body, CREATE_FIELDS);
  const parents = body.parents && typeof body.parents === "object" && !Array.isArray(body.parents) ? body.parents : {};
  if (body.parents !== undefined && (!body.parents || typeof body.parents !== "object" || Array.isArray(body.parents) || Object.keys(body.parents).some((key) => !PARENT_ROLES.includes(key)))) return invalidRequest(res, "Parents must contain father and/or mother details");
  for (const relationship of PARENT_ROLES) { const error = validateParent(parents[relationship], relationship); if (error) return invalidRequest(res, error); }
  if (Object.hasOwn(fields, "address") && (!fields.address || typeof fields.address !== "object" || Array.isArray(fields.address))) return invalidRequest(res, "Address must be an object");
  if (Object.hasOwn(fields, "photoUrl") && fields.photoUrl !== null && fields.photoUrl !== "" && (typeof fields.photoUrl !== "string" || !isHttpsUrl(fields.photoUrl.trim()))) return invalidRequest(res, "Student photo URL must be a valid HTTPS URL");
  if (typeof fields.admissionNumber !== "string" || !fields.admissionNumber.trim() || typeof fields.firstName !== "string" || !fields.firstName.trim()) {
    return invalidRequest(res, "Admission number and first name are required");
  }
  if (Object.hasOwn(fields, "guardianPhone") && fields.guardianPhone !== null && fields.guardianPhone !== "" && (typeof fields.guardianPhone !== "string" || !/^[0-9]{10}$/.test(fields.guardianPhone))) {
    return invalidRequest(res, "Guardian phone number must contain exactly 10 digits (0-9), without country code or symbols");
  }
  if (typeof fields.guardianName !== "string" || !fields.guardianName.trim()) {
    return invalidRequest(res, "Primary guardian name is required");
  }
  if (fields.guardianRelationship !== undefined && !["mother", "father", "uncle", "aunt", "legal_guardian", "grandparent", "step_parent", "sibling", "other"].includes(fields.guardianRelationship)) {
    return invalidRequest(res, "Invalid primary guardian relationship");
  }

  let session;
  let student;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      [student] = await Student.create([{ ...fields, tenantId: req.tenantId }], { session });
      await syncLegacyStudentGuardian(student, { session, actorUserId: req.auth.userId });
      for (const relationship of PARENT_ROLES) await createParentRelationship({ student, parent: parents[relationship], relationship, session });
    });
    const parentLinks = await StudentGuardian.find({ tenantId: req.tenantId, studentId: student._id, relationship: { $in: PARENT_ROLES } }).select("guardianId relationship").lean();
    return res.status(201).json({ success: true, data: student, parents: parentLinks.map((link) => ({ guardianId: link.guardianId, relationship: link.relationship, emailVerificationRequired: true })) });
  } catch (error) { return handleStudentError(error, res, next); }
  finally { if (session) await session.endSession(); }
};

export const getStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) return invalidRequest(res, "Invalid student ID");
    let studentQuery = Student.findOne({ _id: studentId, tenantId: req.tenantId });
    if (req.auth?.role === "teacher") {
      studentQuery = studentQuery.select("admissionNumber firstName lastName status photoUrl");
    }
    const student = await studentQuery.lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    if (req.auth?.role === "teacher") {
      const enrollment = await Enrollment.findOne({
        tenantId: req.tenantId, studentId: student._id, status: "active",
      }).select("academicYearId classId sectionId").lean();
      if (!enrollment || !(await teacherCanAccessEnrollment(req, enrollment))) {
        return res.status(404).json({ success: false, message: "Student not found" });
      }
    }
    return res.status(200).json({ success: true, data: student });
  } catch (error) { return next(error); }
};

export const updateStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const body = req.body;
    if (!mongoose.isValidObjectId(studentId)) return invalidRequest(res, "Invalid student ID");
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest(res, "Provide student fields to update");
    if (Object.hasOwn(body, "tenantId")) return invalidRequest(res, "School assignment cannot be changed");
    const updates = pickFields(body, UPDATE_FIELDS);
    if (Object.hasOwn(updates, "address") && (!updates.address || typeof updates.address !== "object" || Array.isArray(updates.address))) return invalidRequest(res, "Address must be an object");
    if (Object.hasOwn(updates, "guardianPhone") && updates.guardianPhone !== null && updates.guardianPhone !== "" && (typeof updates.guardianPhone !== "string" || !/^[0-9]{10}$/.test(updates.guardianPhone))) return invalidRequest(res, "Guardian phone number must contain exactly 10 digits (0-9), without country code or symbols");
    if (Object.hasOwn(updates, "guardianName") && (typeof updates.guardianName !== "string" || !updates.guardianName.trim())) return invalidRequest(res, "Primary guardian name cannot be empty");
    if (Object.hasOwn(updates, "guardianRelationship") && !["mother", "father", "uncle", "aunt", "legal_guardian", "grandparent", "step_parent", "sibling", "other"].includes(updates.guardianRelationship)) return invalidRequest(res, "Invalid primary guardian relationship");
    if (Object.hasOwn(updates, "photoUrl") && updates.photoUrl !== null && updates.photoUrl !== "" && (typeof updates.photoUrl !== "string" || !isHttpsUrl(updates.photoUrl.trim()))) return invalidRequest(res, "Student photo URL must be a valid HTTPS URL");
    if (Object.keys(updates).length === 0) return invalidRequest(res, "No supported student fields provided");

    const session = await mongoose.startSession();
    let student;
    try {
      await session.withTransaction(async () => {
        student = await Student.findOneAndUpdate(
          { _id: studentId, tenantId: req.tenantId },
          { $set: updates },
          { returnDocument: "after", runValidators: true, session },
        );
        const guardianFieldsChanged = LEGACY_GUARDIAN_FIELDS.some((field) => Object.hasOwn(updates, field));
        if (student && guardianFieldsChanged) await syncLegacyStudentGuardian(student, { session, actorUserId: req.auth.userId });
      });
    } finally { await session.endSession(); }

    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    return res.status(200).json({ success: true, data: student.toObject ? student.toObject() : student });
  } catch (error) { return handleStudentError(error, res, next); }
};
