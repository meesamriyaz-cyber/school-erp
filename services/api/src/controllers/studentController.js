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
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    const parentLinks = await StudentGuardian.find({ tenantId: req.tenantId, studentId: student._id, relationship: { $in: PARENT_ROLES } }).populate({ path: "guardianId", select: "pendingEmail emailVerifiedAt" }).lean();
    return res.status(201).json({ success: true, data: student, parents: parentLinks.filter((link) => link.guardianId).map((link) => ({ guardianId: link.guardianId._id, relationship: link.relationship, emailVerificationRequired: Boolean(link.guardianId.pendingEmail) })) });
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


export const bulkUpsertMotherDetails = async (req, res, next) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return invalidRequest(res, "Provide between 1 and 500 mother records");
  }
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== "object" || Array.isArray(row)
      || Object.keys(row).some((key) => !["admissionNumber", "motherFirstName", "motherLastName", "motherPhone", "motherEmail"].includes(key))) {
      return invalidRequest(res, `Row ${index + 1} contains unsupported fields`);
    }
    if (typeof row.admissionNumber !== "string" || !row.admissionNumber.trim()) return invalidRequest(res, `Row ${index + 1}: admissionNumber is required`);
    const admissionKey = row.admissionNumber.trim().toLowerCase();
    if (seen.has(admissionKey)) return invalidRequest(res, `Duplicate admission number in row ${index + 1}`);
    seen.add(admissionKey);
    const parentError = validateParent({
      firstName: row.motherFirstName,
      lastName: row.motherLastName,
      phone: row.motherPhone,
      email: row.motherEmail,
    }, `Mother in row ${index + 1}`);
    if (parentError) return invalidRequest(res, parentError);
  }

  const results = [];
  for (const row of rows) {
    const admissionNumber = row.admissionNumber.trim().toUpperCase();
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const student = await Student.findOne({ tenantId: req.tenantId, admissionNumber }).session(session);
        if (!student) {
          result = { admissionNumber, status: "not_found", message: "Student admission number was not found" };
          return;
        }
        const supplied = [row.motherFirstName, row.motherLastName, row.motherPhone, row.motherEmail]
          .some((value) => value != null && String(value).trim() !== "");
        if (!supplied) {
          result = { admissionNumber, status: "skipped", message: "No mother details supplied" };
          return;
        }
        const existingLink = await StudentGuardian.findOne({
          tenantId: req.tenantId, studentId: student._id, relationship: "mother",
        }).sort({ status: 1, createdAt: 1 }).session(session);
        let guardian;
        if (existingLink) {
          guardian = await Guardian.findOne({ _id: existingLink.guardianId, tenantId: req.tenantId }).session(session);
          if (!guardian) throw new Error("Linked mother guardian record could not be found");
          if (row.motherFirstName?.trim()) guardian.firstName = row.motherFirstName.trim();
          if (row.motherLastName !== undefined) guardian.lastName = row.motherLastName?.trim() || "";
          if (row.motherPhone !== undefined) guardian.phone = row.motherPhone?.trim() || null;
          if (row.motherEmail !== undefined && row.motherEmail?.trim()) {
            guardian.pendingEmail = row.motherEmail.trim().toLowerCase();
            guardian.email = null;
            guardian.emailVerifiedAt = null;
            guardian.verifiedEmail = null;
          }
          await guardian.save({ session });
          existingLink.receivesCommunication = false;
          existingLink.isPrimary = existingLink.isPrimary; // Preserve the existing primary assignment; never alter Father's record.
          await existingLink.save({ session });
        } else {
          guardian = await Guardian.create([{
            tenantId: req.tenantId,
            firstName: row.motherFirstName.trim(),
            lastName: row.motherLastName?.trim() || "",
            phone: row.motherPhone?.trim() || null,
            ...(row.motherEmail?.trim() ? { pendingEmail: row.motherEmail.trim().toLowerCase() } : {}),
          }], { session }).then((created) => created[0]);
          await StudentGuardian.create([{
            tenantId: req.tenantId, studentId: student._id, guardianId: guardian._id,
            relationship: "mother", source: "manual", isPrimary: false, canAccessPortal: false,
            isEmergencyContact: false, canPickup: false, receivesCommunication: false,
          }], { session });
        }
        result = { admissionNumber, status: "updated", motherName: [guardian.firstName, guardian.lastName].filter(Boolean).join(" ") };
      });
      results.push(result || { admissionNumber, status: "error", message: "Record could not be processed" });
    } catch (error) {
      results.push({ admissionNumber, status: "error", message: error.message || "Record could not be processed" });
    } finally {
      await session.endSession();
    }
  }
  const summary = {
    total: results.length,
    updated: results.filter((item) => item.status === "updated").length,
    notFound: results.filter((item) => item.status === "not_found").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    errors: results.filter((item) => item.status === "error").length,
  };
  return res.status(200).json({ success: true, summary, data: results });
};
