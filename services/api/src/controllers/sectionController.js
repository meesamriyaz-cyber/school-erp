import mongoose from "mongoose";
import Section from "../models/Section.js";
import SchoolClass from "../models/SchoolClass.js";
import AcademicYear from "../models/AcademicYear.js";
import Enrollment from "../models/Enrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

const CREATE_FIELDS = ["classId", "name", "capacity", "status"];
const UPDATE_FIELDS = ["name", "capacity", "status"];
const STATUSES = ["active", "inactive"];
const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);
const pick = (body, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));

const handleError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A section with this name already exists in this class" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more section fields are invalid");
  return next(error);
};

const validateBody = (body, res, creating = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide section details");
    return null;
  }
  if (Object.hasOwn(body, "tenantId")) {
    invalid(res, "School assignment is determined by the authenticated account");
    return null;
  }
  const fields = pick(body, creating ? CREATE_FIELDS : UPDATE_FIELDS);
  if (creating && !fields.classId) {
    invalid(res, "Class is required");
    return null;
  }
  if (Object.hasOwn(fields, "classId") && !validId(fields.classId)) {
    invalid(res, "Invalid class ID");
    return null;
  }
  if (Object.hasOwn(fields, "name") && (typeof fields.name !== "string" || !fields.name.trim())) {
    invalid(res, "Section name is required");
    return null;
  }
  if (Object.hasOwn(fields, "capacity") && fields.capacity !== null && (!Number.isInteger(fields.capacity) || fields.capacity < 1 || fields.capacity > 500)) {
    invalid(res, "Capacity must be null or an integer between 1 and 500");
    return null;
  }
  if (Object.hasOwn(fields, "status") && !STATUSES.includes(fields.status)) {
    invalid(res, "Invalid section status");
    return null;
  }
  if (!creating && !Object.keys(fields).length) {
    invalid(res, "No supported section fields provided");
    return null;
  }
  return fields;
};

export const listSections = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.classId !== undefined) {
      if (!validId(req.query.classId)) return invalid(res, "Invalid class ID");
      const parent = await SchoolClass.findOne({ _id: req.query.classId, tenantId: req.tenantId }).select("_id").lean();
      if (!parent) return res.status(404).json({ success: false, message: "Class not found" });
      filter.classId = req.query.classId;
    }
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) return invalid(res, "Invalid section status filter");
      filter.status = req.query.status;
    }
    const data = await Section.find(filter).sort({ name: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getSection = async (req, res, next) => {
  try {
    if (!validId(req.params.sectionId)) return invalid(res, "Invalid section ID");
    const data = await Section.findOne({ _id: req.params.sectionId, tenantId: req.tenantId }).lean();
    if (!data) return res.status(404).json({ success: false, message: "Section not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createSection = async (req, res, next) => {
  const fields = validateBody(req.body, res, true);
  if (!fields) return;
  const session = await mongoose.startSession();
  let data;
  try {
    await session.withTransaction(async () => {
      const classSnapshot = await SchoolClass.findOne({ _id: fields.classId, tenantId: req.tenantId }).select("_id academicYearId").session(session).lean();
      if (!classSnapshot) { const error = new Error("Class not found"); error.code = "SECTION_CLASS_NOT_FOUND"; throw error; }
      const year = await AcademicYear.findOneAndUpdate(
        { _id: classSnapshot.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!year) { const error = new Error("Sections cannot be created for a closed academic year"); error.code = "SECTION_YEAR_CLOSED"; throw error; }
      const parent = await SchoolClass.findOneAndUpdate(
        { _id: fields.classId, tenantId: req.tenantId, status: "active", academicYearId: classSnapshot.academicYearId },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!parent) { const error = new Error("Class was not found in this school or is inactive"); error.code = "SECTION_CLASS_INACTIVE"; throw error; }
      [data] = await Section.create([{ ...fields, tenantId: req.tenantId }], { session });
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === "SECTION_CLASS_NOT_FOUND") return res.status(404).json({ success: false, message: "Class not found" });
    if (error.code === "SECTION_CLASS_INACTIVE") return res.status(409).json({ success: false, message: "Class was not found in this school or is inactive" });
    if (error.code === "SECTION_YEAR_CLOSED") return res.status(409).json({ success: false, message: "Sections cannot be created for a closed academic year" });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};

export const updateSection = async (req, res, next) => {
  if (!validId(req.params.sectionId)) return invalid(res, "Invalid section ID");
  const fields = validateBody(req.body, res);
  if (!fields) return;
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const snapshot = await Section.findOne({ _id: req.params.sectionId, tenantId: req.tenantId }).select("_id classId capacity").session(session).lean();
      if (!snapshot) { const error = new Error("Section not found"); error.code = "SECTION_NOT_FOUND"; throw error; }

      if (fields.status === "active") {
        const classSnapshot = await SchoolClass.findOne({ _id: snapshot.classId, tenantId: req.tenantId }).select("_id academicYearId").session(session).lean();
        if (!classSnapshot) { const error = new Error("A section cannot be activated while its class is missing"); error.code = "SECTION_PARENT_INACTIVE"; throw error; }
        const year = await AcademicYear.findOneAndUpdate(
          { _id: classSnapshot.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
          { $inc: { lifecycleRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!year) { const error = new Error("A section cannot be activated for a closed academic year"); error.code = "SECTION_YEAR_CLOSED"; throw error; }
        const parent = await SchoolClass.findOneAndUpdate(
          { _id: snapshot.classId, tenantId: req.tenantId, status: "active", academicYearId: classSnapshot.academicYearId },
          { $inc: { placementRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!parent) { const error = new Error("A section cannot be activated while its class is inactive"); error.code = "SECTION_PARENT_INACTIVE"; throw error; }
      }

      const section = await Section.findOneAndUpdate(
        { _id: req.params.sectionId, tenantId: req.tenantId },
        { $inc: { capacityRevision: 1 } }, { new: true, session }
      );
      if (!section) { const error = new Error("Section not found"); error.code = "SECTION_NOT_FOUND"; throw error; }
      if (fields.status === "inactive") {
        const activeEnrollments = await Enrollment.exists({ tenantId: req.tenantId, sectionId: section._id, status: "active" }).session(session);
        const activeAssignments = await TeacherAssignment.exists({ tenantId: req.tenantId, sectionId: section._id, status: "active" }).session(session);
        if (activeEnrollments) { const error = new Error("End active student enrollments before deactivating this section"); error.code = "SECTION_HAS_ACTIVE_ENROLLMENTS"; throw error; }
        if (activeAssignments) { const error = new Error("Deactivate active teacher assignments before deactivating this section"); error.code = "SECTION_HAS_ACTIVE_ASSIGNMENTS"; throw error; }
      }
      if (Object.hasOwn(fields, "capacity") && fields.capacity !== null) {
        const activeCount = await Enrollment.countDocuments({ tenantId: req.tenantId, sectionId: section._id, status: "active" }).session(session);
        if (activeCount > fields.capacity) { const error = new Error("Section capacity cannot be lower than its active enrollment count"); error.code = "SECTION_CAPACITY_BELOW_ENROLLMENTS"; throw error; }
      }
      section.set(fields);
      await section.save({ session });
      updated = section;
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const conflicts = {
      SECTION_NOT_FOUND: [404, "Section not found"],
      SECTION_PARENT_INACTIVE: [409, "A section cannot be activated while its class is inactive"],
      SECTION_YEAR_CLOSED: [409, "A section cannot be activated for a closed academic year"],
      SECTION_HAS_ACTIVE_ENROLLMENTS: [409, "End active student enrollments before deactivating this section"],
      SECTION_HAS_ACTIVE_ASSIGNMENTS: [409, "Deactivate active teacher assignments before deactivating this section"],
      SECTION_HAS_ACTIVE_ASSIGNMENTS: [409, "Deactivate active teacher assignments before deactivating this section"],
      SECTION_CAPACITY_BELOW_ENROLLMENTS: [409, "Section capacity cannot be lower than its active enrollment count"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};
