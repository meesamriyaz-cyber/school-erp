import mongoose from "mongoose";
import TeacherAssignment from "../models/TeacherAssignment.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";

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
    for (const field of ["teacherId", "subjectId", "academicYearId", "classId", "sectionId"]) {
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
  try {
    const fields = validateCreate(req.body, res);
    if (!fields) return;
    const [teacher, subject, year, schoolClass] = await Promise.all([
      User.findOne({ _id: fields.teacherId, tenantId: req.tenantId, role: "teacher", status: "active" }).select("_id").lean(),
      Subject.findOne({ _id: fields.subjectId, tenantId: req.tenantId, status: "active" }).select("_id").lean(),
      AcademicYear.findOne({ _id: fields.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } }).select("_id").lean(),
      SchoolClass.findOne({ _id: fields.classId, tenantId: req.tenantId, status: "active" }).select("_id academicYearId").lean(),
    ]);
    if (!teacher) return res.status(400).json({ success: false, message: "Select an active teacher account from this school" });
    if (!subject) return res.status(400).json({ success: false, message: "Select an active subject from this school" });
    if (!year) return res.status(400).json({ success: false, message: "Select an open academic year from this school" });
    if (!schoolClass || String(schoolClass.academicYearId) !== String(fields.academicYearId)) {
      return res.status(400).json({ success: false, message: "The selected class does not belong to this academic year and school" });
    }
    if (fields.sectionId) {
      const section = await Section.findOne({
        _id: fields.sectionId, tenantId: req.tenantId, classId: schoolClass._id, status: "active",
      }).select("_id").lean();
      if (!section) return res.status(400).json({ success: false, message: "The selected section is not active in this class" });
    }
    const data = await TeacherAssignment.create({
      ...fields, tenantId: req.tenantId, assignedBy: req.auth.userId,
    });
    const populated = await TeacherAssignment.findOne({ _id: data._id, tenantId: req.tenantId })
      .populate("teacherId", "firstName lastName email")
      .populate("subjectId", "name code category")
      .populate("academicYearId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name").lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error) { return handleError(error, res, next); }
};

export const updateTeacherAssignment = async (req, res, next) => {
  try {
    if (!validId(req.params.assignmentId)) return invalid(res, "Invalid assignment ID");
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !["active", "inactive"].includes(req.body.status)) {
      return invalid(res, "Only active or inactive status can be changed");
    }
    const assignment = await TeacherAssignment.findOne({ _id: req.params.assignmentId, tenantId: req.tenantId });
    if (!assignment) return res.status(404).json({ success: false, message: "Teacher assignment not found" });
    if (req.body.status === "active") {
      const [teacher, subject, year, schoolClass] = await Promise.all([
        User.exists({ _id: assignment.teacherId, tenantId: req.tenantId, role: "teacher", status: "active" }),
        Subject.exists({ _id: assignment.subjectId, tenantId: req.tenantId, status: "active" }),
        AcademicYear.exists({ _id: assignment.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } }),
        SchoolClass.exists({ _id: assignment.classId, tenantId: req.tenantId, status: "active" }),
      ]);
      if (!teacher || !subject || !year || !schoolClass) return res.status(409).json({ success: false, message: "Assignment cannot be activated while its teacher, subject, academic year or class is inactive" });
      if (assignment.sectionId && !await Section.exists({ _id: assignment.sectionId, tenantId: req.tenantId, status: "active" })) {
        return res.status(409).json({ success: false, message: "Assignment cannot be activated while its section is inactive" });
      }
    }
    assignment.status = req.body.status;
    await assignment.save();
    return res.status(200).json({ success: true, data: assignment });
  } catch (error) { return handleError(error, res, next); }
};
