import mongoose from "mongoose";
import ClassSubject from "../models/ClassSubject.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Subject from "../models/Subject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const pick = (body, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));

export const listClassSubjects = async (req, res, next) => {
  try {
    const { academicYearId, classId } = req.query;
    if (!validId(academicYearId) || !validId(classId)) return invalid(res, "Valid academicYearId and classId are required");
    const [year, schoolClass] = await Promise.all([
      AcademicYear.exists({ _id: academicYearId, tenantId: req.tenantId }),
      SchoolClass.exists({ _id: classId, tenantId: req.tenantId, academicYearId }),
    ]);
    if (!year || !schoolClass) return res.status(404).json({ success: false, message: "Academic class scope not found" });
    const data = await ClassSubject.find({ tenantId: req.tenantId, academicYearId, classId })
      .populate("subjectId", "name code category status")
      .populate("history.changedBy", "firstName lastName")
      .sort({ sortOrder: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const saveClassSubject = async (req, res, next) => {
  if (!validId(req.params.classId)) return invalid(res, "Invalid class ID");
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || ["tenantId", "createdBy", "updatedBy", "academicYearId", "classId"].some((k) => Object.hasOwn(body, k))) return invalid(res, "Provide valid curriculum fields");
  const fields = pick(body, ["subjectId", "category", "weeklyPeriods", "sortOrder", "status"]);
  if (!validId(fields.subjectId)) return invalid(res, "A valid subject is required");
  if (fields.category !== undefined && !["compulsory", "elective"].includes(fields.category)) return invalid(res, "Category must be compulsory or elective");
  if (fields.weeklyPeriods !== undefined && (!Number.isInteger(fields.weeklyPeriods) || fields.weeklyPeriods < 0 || fields.weeklyPeriods > 60)) return invalid(res, "Weekly periods must be an integer from 0 to 60");
  if (fields.sortOrder !== undefined && (!Number.isInteger(fields.sortOrder) || fields.sortOrder < 0 || fields.sortOrder > 1000)) return invalid(res, "Sort order must be an integer from 0 to 1000");
  if (fields.status !== undefined && !["active", "inactive"].includes(fields.status)) return invalid(res, "Invalid curriculum status");

  const session = await mongoose.startSession();
  let mappingId, created = false;
  try {
    await session.withTransaction(async () => {
      const classSnapshot = await SchoolClass.findOne({ _id: req.params.classId, tenantId: req.tenantId }).select("_id academicYearId").session(session).lean();
      if (!classSnapshot) { const error = new Error("Class not found"); error.code = "CURRICULUM_CLASS_NOT_FOUND"; throw error; }

      const year = await AcademicYear.findOneAndUpdate(
        { _id: classSnapshot.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id status").lean();
      if (!year) { const error = new Error("Curriculum cannot be changed for a closed academic year"); error.code = "CURRICULUM_YEAR_CLOSED"; throw error; }

      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: req.params.classId, tenantId: req.tenantId, academicYearId: classSnapshot.academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id academicYearId").lean();
      if (!schoolClass) { const error = new Error("Curriculum cannot be changed for an inactive class"); error.code = "CURRICULUM_CLASS_INACTIVE"; throw error; }

      const subject = await Subject.findOne({ _id: fields.subjectId, tenantId: req.tenantId, status: "active" }).select("_id").session(session).lean();
      if (!subject) { const error = new Error("Select an active subject from this school"); error.code = "CURRICULUM_SUBJECT_INVALID"; throw error; }

      const existing = await ClassSubject.findOne({
        tenantId: req.tenantId, academicYearId: schoolClass.academicYearId,
        classId: schoolClass._id, subjectId: fields.subjectId,
      }).session(session);
      if (existing) {
        if (fields.status === "inactive" && existing.status === "active") {
          const assignment = await TeacherAssignment.exists({
            tenantId: req.tenantId, academicYearId: schoolClass.academicYearId,
            classId: schoolClass._id, subjectId: fields.subjectId, status: "active",
          }).session(session);
          if (assignment) { const error = new Error("Deactivate active teacher assignments before removing this subject from the active curriculum"); error.code = "CURRICULUM_HAS_ASSIGNMENTS"; throw error; }
        }
        existing.history.push({
          category: existing.category, weeklyPeriods: existing.weeklyPeriods,
          sortOrder: existing.sortOrder, status: existing.status,
          changedBy: req.auth.userId, changedAt: new Date(),
        });
        if (existing.history.length > 50) existing.history.splice(0, existing.history.length - 50);
        existing.revision += 1;
        existing.set({ ...fields, updatedBy: req.auth.userId });
        await existing.save({ session });
        mappingId = existing._id;
      } else {
        const [createdMapping] = await ClassSubject.create([{
          ...fields, tenantId: req.tenantId, academicYearId: schoolClass.academicYearId,
          classId: schoolClass._id, createdBy: req.auth.userId, updatedBy: req.auth.userId,
        }], { session });
        mappingId = createdMapping._id;
        created = true;
      }
    });
    const data = await ClassSubject.findOne({ _id: mappingId, tenantId: req.tenantId })
      .populate("subjectId", "name code category status").lean();
    return res.status(created ? 201 : 200).json({ success: true, data });
  } catch (error) {
    const conflicts = {
      CURRICULUM_CLASS_NOT_FOUND: [404, "Class not found"],
      CURRICULUM_YEAR_CLOSED: [409, "Curriculum cannot be changed for a closed academic year"],
      CURRICULUM_CLASS_INACTIVE: [409, "Curriculum cannot be changed for an inactive class"],
      CURRICULUM_SUBJECT_INVALID: [400, "Select an active subject from this school"],
      CURRICULUM_HAS_ASSIGNMENTS: [409, "Deactivate active teacher assignments before removing this subject from the active curriculum"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This subject is already mapped to the class curriculum" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more curriculum fields are invalid");
    return next(error);
  } finally { await session.endSession(); }
};

export const removeClassSubject = async (req, res, next) => {
  try {
    if (!validId(req.params.mappingId)) return invalid(res, "Invalid curriculum mapping ID");
    const mapping = await ClassSubject.findOne({ _id: req.params.mappingId, tenantId: req.tenantId });
    if (!mapping) return res.status(404).json({ success: false, message: "Curriculum mapping not found" });
    return res.status(409).json({ success: false, message: "Curriculum mappings are retained as history; change status to inactive instead of deleting" });
  } catch (error) { return next(error); }
};
