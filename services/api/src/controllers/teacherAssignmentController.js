import mongoose from "mongoose";
import TeacherAssignment from "../models/TeacherAssignment.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import TimetableEntry from "../models/TimetableEntry.js";
import ClassSubject from "../models/ClassSubject.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });

const handleError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "This teacher is already assigned to this subject and class scope" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more assignment fields are invalid");
  return next(error);
};

const validateCreate = (body, res) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide teacher assignment details");
    return null;
  }
  if (["tenantId", "assignedBy", "status"].some((key) => Object.hasOwn(body, key))) {
    invalid(res, "School, assigning user and initial status are determined by the server");
    return null;
  }
  const fields = ["teacherId", "subjectId", "academicYearId", "classId", "sectionId"];
  for (const field of fields) {
    if (field === "sectionId" && (body.sectionId === undefined || body.sectionId === null || body.sectionId === "")) continue;
    if (!validId(body[field])) {
      invalid(res, `A valid ${field} is required`);
      return null;
    }
  }
  return {
    teacherId: body.teacherId,
    subjectId: body.subjectId,
    academicYearId: body.academicYearId,
    classId: body.classId,
    sectionId: body.sectionId || null,
  };
};

export const listTeacherAssignments = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    // Teachers may only inspect their own assignments; never trust a teacherId query override.
    if (req.auth.role === "teacher") filter.teacherId = req.auth.userId;
    for (const field of ["teacherId", "subjectId", "academicYearId", "classId", "sectionId"]) {
      if (field === "teacherId" && req.auth.role === "teacher") {
        if (req.query.teacherId !== undefined && String(req.query.teacherId) !== String(req.auth.userId)) {
          return res.status(403).json({ success: false, message: "You may only view your own assignments" });
        }
        continue;
      }
      if (req.query[field] !== undefined) {
        if (field === "sectionId" && req.query[field] === "none") filter.sectionId = null;
        else if (!validId(req.query[field])) return invalid(res, `Invalid ${field}`);
        else filter[field] = req.query[field];
      }
    }
    if (req.query.status !== undefined) {
      if (!["active", "inactive"].includes(req.query.status)) return invalid(res, "Invalid assignment status");
      filter.status = req.query.status;
    }
    const data = await TeacherAssignment.find(filter)
      .populate("teacherId", "firstName lastName email")
      .populate("subjectId", "name code category")
      .populate("academicYearId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .sort({ createdAt: -1, _id: -1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createTeacherAssignment = async (req, res, next) => {
  const fields = validateCreate(req.body, res);
  if (!fields) return;
  await ClassSubject.init();
  const session = await mongoose.startSession();
  let assignmentId;
  try {
    await session.withTransaction(async () => {
      const [teacher, subject] = await Promise.all([
        User.findOne({ _id: fields.teacherId, tenantId: req.tenantId, role: "teacher", status: "active" }).select("_id").session(session).lean(),
        Subject.findOne({ _id: fields.subjectId, tenantId: req.tenantId, status: "active" }).select("_id").session(session).lean(),
      ]);
      if (!teacher) { const error = new Error("Select an active teacher account from this school"); error.code = "ASSIGNMENT_TEACHER_INVALID"; throw error; }
      if (!subject) { const error = new Error("Select an active subject from this school"); error.code = "ASSIGNMENT_SUBJECT_INVALID"; throw error; }
      const year = await AcademicYear.findOneAndUpdate(
        { _id: fields.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!year) { const error = new Error("Select an open academic year from this school"); error.code = "ASSIGNMENT_YEAR_INVALID"; throw error; }
      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: fields.classId, tenantId: req.tenantId, academicYearId: fields.academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id academicYearId").lean();
      if (!schoolClass) { const error = new Error("The selected class does not belong to this academic year and school or is inactive"); error.code = "ASSIGNMENT_CLASS_INVALID"; throw error; }

      const curriculumConfigured = await ClassSubject.exists({
        tenantId: req.tenantId, academicYearId: fields.academicYearId,
        classId: schoolClass._id, status: "active",
      }).session(session);
      if (curriculumConfigured && !await ClassSubject.exists({
        tenantId: req.tenantId, academicYearId: fields.academicYearId,
        classId: schoolClass._id, subjectId: fields.subjectId, status: "active",
      }).session(session)) {
        const error = new Error("Map this subject to the class curriculum before assigning a teacher"); error.code = "ASSIGNMENT_CURRICULUM_MISSING"; throw error;
      }
      if (fields.sectionId) {
        const section = await Section.findOneAndUpdate(
          { _id: fields.sectionId, tenantId: req.tenantId, classId: schoolClass._id, status: "active" },
          { $inc: { capacityRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!section) { const error = new Error("The selected section is not active in this class"); error.code = "ASSIGNMENT_SECTION_INVALID"; throw error; }
      }
      const [created] = await TeacherAssignment.create([{
        ...fields, tenantId: req.tenantId, assignedBy: req.auth.userId,
      }], { session });
      assignmentId = created._id;
    });
    const populated = await TeacherAssignment.findOne({ _id: assignmentId, tenantId: req.tenantId })
      .populate("teacherId", "firstName lastName email")
      .populate("subjectId", "name code category")
      .populate("academicYearId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name").lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    const conflicts = {
      ASSIGNMENT_TEACHER_INVALID: [400, "Select an active teacher account from this school"],
      ASSIGNMENT_SUBJECT_INVALID: [400, "Select an active subject from this school"],
      ASSIGNMENT_YEAR_INVALID: [400, "Select an open academic year from this school"],
      ASSIGNMENT_CLASS_INVALID: [400, "The selected class does not belong to this academic year and school or is inactive"],
      ASSIGNMENT_CURRICULUM_MISSING: [409, "Map this subject to the class curriculum before assigning a teacher"],
      ASSIGNMENT_SECTION_INVALID: [400, "The selected section is not active in this class"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};

export const updateTeacherAssignment = async (req, res, next) => {
  if (!validId(req.params.assignmentId)) return invalid(res, "Invalid assignment ID");
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
    Object.keys(req.body).length !== 1 || !["active", "inactive"].includes(req.body.status)) {
    return invalid(res, "Only active or inactive status can be changed");
  }
  await ClassSubject.init();
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const assignment = await TeacherAssignment.findOne({ _id: req.params.assignmentId, tenantId: req.tenantId }).session(session);
      if (!assignment) { const error = new Error("Teacher assignment not found"); error.code = "ASSIGNMENT_NOT_FOUND"; throw error; }
      const year = await AcademicYear.findOneAndUpdate(
        { _id: assignment.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: assignment.classId, tenantId: req.tenantId, academicYearId: assignment.academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!year || !schoolClass) { const error = new Error("Assignment cannot be changed for a closed academic year or inactive class"); error.code = "ASSIGNMENT_DEPENDENCY_INACTIVE"; throw error; }

      if (req.body.status === "inactive") {
        const hasActivePeriods = await TimetableEntry.exists({ tenantId: req.tenantId, assignmentId: assignment._id, status: "active" }).session(session);
        if (hasActivePeriods) { const error = new Error("Deactivate linked timetable periods before deactivating this teacher assignment"); error.code = "ASSIGNMENT_HAS_PERIODS"; throw error; }
      } else {
        const [teacher, subject] = await Promise.all([
          User.exists({ _id: assignment.teacherId, tenantId: req.tenantId, role: "teacher", status: "active" }).session(session),
          Subject.exists({ _id: assignment.subjectId, tenantId: req.tenantId, status: "active" }).session(session),
        ]);
        if (!teacher || !subject) { const error = new Error("Assignment cannot be activated while its teacher or subject is inactive"); error.code = "ASSIGNMENT_DEPENDENCY_INACTIVE"; throw error; }
        const curriculumConfigured = await ClassSubject.exists({ tenantId: req.tenantId, academicYearId: assignment.academicYearId, classId: assignment.classId, status: "active" }).session(session);
        const curriculumAllows = !curriculumConfigured || await ClassSubject.exists({ tenantId: req.tenantId, academicYearId: assignment.academicYearId, classId: assignment.classId, subjectId: assignment.subjectId, status: "active" }).session(session);
        if (!curriculumAllows) { const error = new Error("Assignment cannot be activated because its subject is not in the active class curriculum"); error.code = "ASSIGNMENT_CURRICULUM_MISSING"; throw error; }
        if (assignment.sectionId) {
          const section = await Section.findOneAndUpdate(
            { _id: assignment.sectionId, tenantId: req.tenantId, classId: assignment.classId, status: "active" },
            { $inc: { capacityRevision: 1 } }, { new: true, session }
          ).select("_id").lean();
          if (!section) { const error = new Error("Assignment cannot be activated while its section is inactive"); error.code = "ASSIGNMENT_SECTION_INVALID"; throw error; }
        }
      }
      assignment.status = req.body.status;
      await assignment.save({ session });
      updated = assignment;
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const conflicts = {
      ASSIGNMENT_NOT_FOUND: [404, "Teacher assignment not found"],
      ASSIGNMENT_HAS_PERIODS: [409, "Deactivate linked timetable periods before deactivating this teacher assignment"],
      ASSIGNMENT_DEPENDENCY_INACTIVE: [409, "Assignment cannot be changed for a closed academic year or inactive class or teacher or subject"],
      ASSIGNMENT_CURRICULUM_MISSING: [409, "Assignment cannot be activated because its subject is not in the active class curriculum"],
      ASSIGNMENT_SECTION_INVALID: [409, "Assignment cannot be activated while its section is inactive"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};
