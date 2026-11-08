import mongoose from "mongoose";
import Examination from "../models/Examination.js";
import ExamSubject from "../models/ExamSubject.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import Subject from "../models/Subject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import ClassSubject from "../models/ClassSubject.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const populatedExam = (query) => query
  .populate("academicYearId", "name startDate endDate")
  .populate("classId", "name")
  .populate("sectionId", "name");

const teacherScope = async (req) => {
  if (req.auth.role !== "teacher") return null;
  const assignments = await TeacherAssignment.find({
    tenantId: req.tenantId, teacherId: req.auth.userId, status: "active",
  }).select("academicYearId classId sectionId subjectId").lean();
  return assignments;
};

const canReadExam = async (req, exam) => {
  if (req.auth.role !== "teacher") return true;
  const assignments = await teacherScope(req);
  if (!assignments?.length) return false;
  const subjectIds = await ExamSubject.distinct("subjectId", {
    tenantId: req.tenantId, examinationId: exam._id,
  });
  return assignments.some((item) =>
    String(item.academicYearId) === String(exam.academicYearId) &&
    String(item.classId) === String(exam.classId) &&
    (!item.sectionId || !exam.sectionId || String(item.sectionId) === String(exam.sectionId)) &&
    subjectIds.some((id) => String(id) === String(item.subjectId))
  );
};

export const listExaminations = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    for (const field of ["academicYearId", "classId"]) {
      if (req.query[field] !== undefined) {
        if (!validId(req.query[field])) return invalid(res, `Invalid ${field}`);
        filter[field] = req.query[field];
      }
    }
    if (req.query.sectionId !== undefined) {
      if (req.query.sectionId === "none") filter.sectionId = null;
      else if (!validId(req.query.sectionId)) return invalid(res, "Invalid sectionId");
      else filter.sectionId = req.query.sectionId;
    }
    if (req.query.status !== undefined) {
      if (!["draft", "scheduled", "in_progress", "completed", "published"].includes(req.query.status)) return invalid(res, "Invalid examination status");
      filter.status = req.query.status;
    }
    if (req.auth.role === "teacher") {
      const assignments = await teacherScope(req);
      if (!assignments.length) return res.status(200).json({ success: true, data: [] });
      filter.$or = assignments.map((item) => ({
        academicYearId: item.academicYearId, classId: item.classId,
        ...(item.sectionId ? { $or: [{ sectionId: item.sectionId }, { sectionId: null }] } : {}),
      }));
    }
    const exams = await populatedExam(Examination.find(filter).sort({ startDate: -1, createdAt: -1 })).lean();
    const data = [];
    for (const exam of exams) if (await canReadExam(req, exam)) data.push(exam);
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getExamination = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    const exam = await populatedExam(Examination.findOne({ _id: req.params.examinationId, tenantId: req.tenantId })).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    if (!await canReadExam(req, exam)) return res.status(403).json({ success: false, message: "You are not assigned to this examination" });
    const subjects = await ExamSubject.find({ tenantId: req.tenantId, examinationId: exam._id })
      .populate("subjectId", "name code category").sort({ examDate: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data: { ...exam, subjects } });
  } catch (error) { return next(error); }
};

export const createExamination = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide examination details");
    if (["tenantId", "createdBy", "status"].some((key) => Object.hasOwn(body, key))) return invalid(res, "School, creator and initial status are determined by the server");
    const { academicYearId, classId, sectionId = null, name, startDate, endDate } = body;
    if (!validId(academicYearId) || !validId(classId)) return invalid(res, "A valid academic year and class are required");
    if (sectionId !== null && sectionId !== "" && !validId(sectionId)) return invalid(res, "Invalid section ID");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return invalid(res, "Examination name is required and must be 100 characters or fewer");
    const start = new Date(startDate), end = new Date(endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return invalid(res, "Provide valid examination dates with the end date on or after the start date");
    const [year, schoolClass] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } }).select("_id startDate endDate").lean(),
      SchoolClass.findOne({ _id: classId, tenantId: req.tenantId, status: "active" }).select("_id academicYearId").lean(),
    ]);
    if (!year) return invalid(res, "Select an open academic year from this school");
    if (!schoolClass || String(schoolClass.academicYearId) !== String(academicYearId)) return invalid(res, "The selected class does not belong to this academic year and school");
    if (start < new Date(year.startDate) || end > new Date(year.endDate)) return invalid(res, "Examination dates must fall within the selected academic year");
    const selectedSection = sectionId || null;
    if (selectedSection && !await Section.exists({ _id: selectedSection, tenantId: req.tenantId, classId, status: "active" })) return invalid(res, "The selected section is not active in this class");
    const curriculum = await ClassSubject.find({ tenantId: req.tenantId, academicYearId, classId, status: "active" })
      .populate("subjectId", "name code category").sort({ sortOrder: 1, _id: 1 }).lean();
    const exam = await Examination.create({
      tenantId: req.tenantId, academicYearId, classId, sectionId: selectedSection,
      name: name.trim(), startDate: start, endDate: end, createdBy: req.auth.userId,
      curriculumSnapshot: curriculum.map((item) => ({
        subjectId: item.subjectId._id, subjectName: item.subjectId.name,
        subjectCode: item.subjectId.code || "", category: item.category,
        weeklyPeriods: item.weeklyPeriods, sortOrder: item.sortOrder,
      })),
    });
    const data = await populatedExam(Examination.findOne({ _id: exam._id, tenantId: req.tenantId })).lean();
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "An examination with this name already exists for this class and academic year scope" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more examination fields are invalid");
    return next(error);
  }
};

export const updateExaminationStatus = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !["draft", "scheduled", "in_progress", "completed"].includes(req.body.status)) {
      return invalid(res, "Provide one valid examination lifecycle status");
    }
    const exam = await Examination.findOne({ _id: req.params.examinationId, tenantId: req.tenantId });
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    const allowed = {
      draft: ["scheduled"], scheduled: ["in_progress", "completed"],
      in_progress: ["completed"], completed: [], published: [],
    };
    if (!allowed[exam.status]?.includes(req.body.status)) return res.status(409).json({ success: false, message: `Cannot change examination from ${exam.status} to ${req.body.status}` });
    if (req.body.status === "scheduled" && !await ExamSubject.exists({ tenantId: req.tenantId, examinationId: exam._id })) {
      return res.status(409).json({ success: false, message: "Configure at least one subject before scheduling this examination" });
    }
    exam.status = req.body.status;
    await exam.save();
    return res.status(200).json({ success: true, data: exam });
  } catch (error) {
    if (error.name === "ValidationError") return invalid(res, "Invalid examination status");
    return next(error);
  }
};

export const addExaminationSubject = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide examination subject details");
    if (["tenantId", "examinationId"].some((key) => Object.hasOwn(body, key))) return invalid(res, "School and examination are determined by the route and authenticated account");
    const { subjectId, examDate, startTime = "", endTime = "", maxMarks, passMarks, durationMinutes = null } = body;
    if (!validId(subjectId)) return invalid(res, "A valid subject is required");
    if (!Number.isFinite(new Date(examDate).getTime())) return invalid(res, "A valid examination subject date is required");
    const maximum = Number(maxMarks), passing = Number(passMarks);
    if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(passing) || passing < 0 || passing > maximum) return invalid(res, "Passing marks must be between zero and maximum marks");
    if (typeof startTime !== "string" || typeof endTime !== "string") return invalid(res, "Exam times must use 24-hour HH:mm format");
    const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    if ((startTime && !timePattern.test(startTime)) || (endTime && !timePattern.test(endTime))) return invalid(res, "Exam times must use 24-hour HH:mm format");
    if (Boolean(startTime) !== Boolean(endTime)) return invalid(res, "Provide both exam start and end times, or leave both blank");
    if (startTime && endTime <= startTime) return invalid(res, "Exam end time must be later than start time");
    if (durationMinutes !== null && (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 1)) return invalid(res, "Duration must be a positive whole number of minutes");
    const exam = await Examination.findOne({ _id: req.params.examinationId, tenantId: req.tenantId });
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    if (exam.status !== "draft") return res.status(409).json({ success: false, message: "Subjects can only be configured while the examination is in draft; configuration is locked once scheduled" });
    const date = new Date(examDate);
    if (date < new Date(exam.startDate) || date > new Date(exam.endDate)) return invalid(res, "Subject examination date must fall within the examination date range");
    const subject = await Subject.findOne({ _id: subjectId, tenantId: req.tenantId, status: "active" }).select("_id").lean();
    if (!subject) return invalid(res, "Select an active subject from this school");
    const curriculumConfigured = exam.curriculumSnapshot?.length
      ? true
      : await ClassSubject.exists({ tenantId: req.tenantId, academicYearId: exam.academicYearId, classId: exam.classId, status: "active" });
    const curriculumAllowsSubject = exam.curriculumSnapshot?.length
      ? exam.curriculumSnapshot.some((item) => String(item.subjectId) === String(subjectId))
      : !curriculumConfigured || await ClassSubject.exists({ tenantId: req.tenantId, academicYearId: exam.academicYearId, classId: exam.classId, subjectId, status: "active" });
    if (!curriculumAllowsSubject) return res.status(409).json({ success: false, message: "This subject is not included in the class curriculum snapshot for this examination" });
    if (req.auth.role === "teacher" && !await TeacherAssignment.exists({
      tenantId: req.tenantId, teacherId: req.auth.userId, subjectId,
      academicYearId: exam.academicYearId, classId: exam.classId, status: "active",
      ...(exam.sectionId ? { $or: [{ sectionId: exam.sectionId }, { sectionId: null }] } : { sectionId: null }),
    })) return res.status(403).json({ success: false, message: "You are not assigned to this subject and class" });

    if (startTime && endTime) {
      const sameDaySubjects = await ExamSubject.find({ tenantId: req.tenantId, examinationId: exam._id, examDate: { $gte: new Date(date.toISOString().slice(0, 10)), $lt: new Date(new Date(date.toISOString().slice(0, 10)).getTime() + 86400000) } }).select("subjectId startTime endTime").lean();
      const overlaps = sameDaySubjects.some((item) => item.startTime && item.endTime && startTime < item.endTime && endTime > item.startTime);
      if (overlaps) return res.status(409).json({ success: false, message: "This subject exam time overlaps another subject scheduled on the same date" });
    }
    const data = await ExamSubject.create({
      tenantId: req.tenantId, examinationId: exam._id, subjectId, examDate: date,
      startTime, endTime, maxMarks: maximum, passMarks: passing,
      durationMinutes: durationMinutes === null ? null : Number(durationMinutes),
    });
    const populated = await ExamSubject.findOne({ _id: data._id, tenantId: req.tenantId }).populate("subjectId", "name code category").lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This subject is already configured for the examination" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more examination subject fields are invalid");
    return next(error);
  }
};
