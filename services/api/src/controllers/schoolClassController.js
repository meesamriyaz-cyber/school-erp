import mongoose from "mongoose";
import SchoolClass from "../models/SchoolClass.js";
import AcademicYear from "../models/AcademicYear.js";
import Section from "../models/Section.js";
import Enrollment from "../models/Enrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

const CREATE_FIELDS = ["academicYearId", "name", "sortOrder", "status"];
const UPDATE_FIELDS = ["name", "sortOrder", "status"];
const STATUSES = ["active", "inactive"];

const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);
const pick = (body, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));

const handleError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A class with this name already exists for this academic year" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more class fields are invalid");
  return next(error);
};

const validateBody = (body, res, creating = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide class details");
    return null;
  }
  if (Object.hasOwn(body, "tenantId")) {
    invalid(res, "School assignment is determined by the authenticated account");
    return null;
  }
  const fields = pick(body, creating ? CREATE_FIELDS : UPDATE_FIELDS);
  if (creating && !fields.academicYearId) {
    invalid(res, "Academic year is required");
    return null;
  }
  if (Object.hasOwn(fields, "academicYearId") && !validId(fields.academicYearId)) {
    invalid(res, "Invalid academic-year ID");
    return null;
  }
  if (Object.hasOwn(fields, "name") && (typeof fields.name !== "string" || !fields.name.trim())) {
    invalid(res, "Class name is required");
    return null;
  }
  if (Object.hasOwn(fields, "sortOrder") && (!Number.isInteger(fields.sortOrder) || fields.sortOrder < 0 || fields.sortOrder > 1000)) {
    invalid(res, "Sort order must be an integer between 0 and 1000");
    return null;
  }
  if (Object.hasOwn(fields, "status") && !STATUSES.includes(fields.status)) {
    invalid(res, "Invalid class status");
    return null;
  }
  if (!creating && !Object.keys(fields).length) {
    invalid(res, "No supported class fields provided");
    return null;
  }
  return fields;
};

const findUsableAcademicYear = async (academicYearId, tenantId) =>
  AcademicYear.findOne({ _id: academicYearId, tenantId, status: { $ne: "closed" } }).select("_id").lean();

export const listClasses = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.academicYearId !== undefined) {
      if (!validId(req.query.academicYearId)) return invalid(res, "Invalid academic-year ID");
      filter.academicYearId = req.query.academicYearId;
      const year = await AcademicYear.findOne({ _id: filter.academicYearId, tenantId: req.tenantId }).select("_id").lean();
      if (!year) return res.status(404).json({ success: false, message: "Academic year not found" });
    }
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) return invalid(res, "Invalid class status filter");
      filter.status = req.query.status;
    }
    const data = await SchoolClass.find(filter).sort({ sortOrder: 1, name: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getClass = async (req, res, next) => {
  try {
    if (!validId(req.params.classId)) return invalid(res, "Invalid class ID");
    const data = await SchoolClass.findOne({ _id: req.params.classId, tenantId: req.tenantId }).lean();
    if (!data) return res.status(404).json({ success: false, message: "Class not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createClass = async (req, res, next) => {
  const fields = validateBody(req.body, res, true);
  if (!fields) return;
  const session = await mongoose.startSession();
  let data;
  try {
    await session.withTransaction(async () => {
      const year = await AcademicYear.findOneAndUpdate(
        { _id: fields.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!year) { const error = new Error("Academic year was not found in this school or is closed"); error.code = "CLASS_YEAR_UNAVAILABLE"; throw error; }
      [data] = await SchoolClass.create([{ ...fields, tenantId: req.tenantId }], { session });
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === "CLASS_YEAR_UNAVAILABLE") return res.status(400).json({ success: false, message: "Academic year was not found in this school or is closed" });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};

export const updateClass = async (req, res, next) => {
  if (!validId(req.params.classId)) return invalid(res, "Invalid class ID");
  const fields = validateBody(req.body, res);
  if (!fields) return;
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const snapshot = await SchoolClass.findOne({ _id: req.params.classId, tenantId: req.tenantId }).select("_id academicYearId status").session(session).lean();
      if (!snapshot) { const error = new Error("Class not found"); error.code = "CLASS_NOT_FOUND"; throw error; }
      if (fields.status === "active") {
        const year = await AcademicYear.findOneAndUpdate(
          { _id: snapshot.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
          { $inc: { lifecycleRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!year) { const error = new Error("A class cannot be activated for a closed academic year"); error.code = "CLASS_YEAR_CLOSED"; throw error; }
      }
      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: req.params.classId, tenantId: req.tenantId },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      );
      if (!schoolClass) { const error = new Error("Class not found"); error.code = "CLASS_NOT_FOUND"; throw error; }
      if (fields.status === "inactive") {
        const [activeSections, activeEnrollments, activeAssignments] = await Promise.all([
          Section.exists({ tenantId: req.tenantId, classId: schoolClass._id, status: "active" }).session(session),
          Enrollment.exists({ tenantId: req.tenantId, classId: schoolClass._id, status: "active" }).session(session),
          TeacherAssignment.exists({ tenantId: req.tenantId, classId: schoolClass._id, status: "active" }).session(session),
        ]);
        if (activeSections) { const error = new Error("Deactivate this class's active sections before deactivating the class"); error.code = "CLASS_HAS_ACTIVE_SECTIONS"; throw error; }
        if (activeEnrollments) { const error = new Error("End active student enrollments before deactivating this class"); error.code = "CLASS_HAS_ACTIVE_ENROLLMENTS"; throw error; }
        if (activeAssignments) { const error = new Error("Deactivate active teacher assignments before deactivating this class"); error.code = "CLASS_HAS_ACTIVE_ASSIGNMENTS"; throw error; }
        if (activeAssignments) { const error = new Error("Deactivate active teacher assignments before deactivating this class"); error.code = "CLASS_HAS_ACTIVE_ASSIGNMENTS"; throw error; }
      }
      schoolClass.set(fields);
      await schoolClass.save({ session });
      updated = schoolClass;
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const conflicts = {
      CLASS_NOT_FOUND: [404, "Class not found"],
      CLASS_YEAR_CLOSED: [409, "A class cannot be activated for a closed academic year"],
      CLASS_HAS_ACTIVE_SECTIONS: [409, "Deactivate this class's active sections before deactivating the class"],
      CLASS_HAS_ACTIVE_ENROLLMENTS: [409, "End active student enrollments before deactivating this class"],
      CLASS_HAS_ACTIVE_ASSIGNMENTS: [409, "Deactivate active teacher assignments before deactivating this class"],
      CLASS_HAS_ACTIVE_ASSIGNMENTS: [409, "Deactivate active teacher assignments before deactivating this class"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};
