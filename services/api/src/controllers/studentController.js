import mongoose from "mongoose";

import Student from "../models/Student.js";
import { syncLegacyStudentGuardian } from "../services/syncLegacyStudentGuardian.js";

const CREATE_FIELDS = [
  "admissionNumber", "firstName", "lastName", "dateOfBirth", "photoUrl", "address",
  "gender", "admissionDate", "guardianName", "guardianRelationship", "guardianPhone", "guardianEmail",
];
const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];
const LEGACY_GUARDIAN_FIELDS = ["guardianName", "guardianRelationship", "guardianPhone", "guardianEmail"];

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
    const [students, total] = await Promise.all([
      Student.find(filter).sort({ admissionNumber: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
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
  if (Object.hasOwn(fields, "address") && (!fields.address || typeof fields.address !== "object" || Array.isArray(fields.address))) return invalidRequest(res, "Address must be an object");
  if (Object.hasOwn(fields, "photoUrl") && fields.photoUrl !== null && fields.photoUrl !== "" && (typeof fields.photoUrl !== "string" || !isHttpsUrl(fields.photoUrl.trim()))) return invalidRequest(res, "Student photo URL must be a valid HTTPS URL");
  if (typeof fields.admissionNumber !== "string" || !fields.admissionNumber.trim() || typeof fields.firstName !== "string" || !fields.firstName.trim()) {
    return invalidRequest(res, "Admission number and first name are required");
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
    });
    return res.status(201).json({ success: true, data: student });
  } catch (error) { return handleStudentError(error, res, next); }
  finally { if (session) await session.endSession(); }
};

export const getStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) return invalidRequest(res, "Invalid student ID");
    const student = await Student.findOne({ _id: studentId, tenantId: req.tenantId }).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
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
