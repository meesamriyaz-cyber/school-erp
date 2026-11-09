import mongoose from "mongoose";
import Homework from "../models/Homework.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import Subject from "../models/Subject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Enrollment from "../models/Enrollment.js";
import { enqueueStudentScopedNotification } from "../services/notificationEnqueueService.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const parseDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const teacherCanTeach = async (req, { academicYearId, classId, sectionId, subjectId }) => {
  if (req.auth.role !== "teacher") return true;
  return Boolean(await TeacherAssignment.exists({
    tenantId: req.tenantId, teacherId: req.auth.userId, academicYearId, classId, subjectId, status: "active",
    ...(sectionId ? { $or: [{ sectionId }, { sectionId: null }] } : { sectionId: null }),
  }));
};

export const listHomework = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    for (const key of ["academicYearId", "classId", "sectionId", "subjectId"]) {
      if (req.query[key] !== undefined) {
        if (key === "sectionId" && req.query[key] === "none") filter.sectionId = null;
        else if (!validId(req.query[key])) return invalid(res, `Invalid ${key}`);
        else filter[key] = req.query[key];
      }
    }
    if (req.auth.role === "teacher") filter.teacherId = req.auth.userId;
    const data = await Homework.find(filter)
      .populate("classId", "name").populate("sectionId", "name")
      .populate("subjectId", "name code").populate("teacherId", "firstName lastName")
      .sort({ dueDate: 1, createdAt: -1 }).limit(300).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createHomework = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide homework details");
    const allowed = ["academicYearId", "classId", "sectionId", "subjectId", "title", "instructions", "assignedDate", "dueDate", "status"];
    if (Object.keys(body).some((key) => !allowed.includes(key))) return invalid(res, "Only homework fields may be supplied");
    const { academicYearId, classId, sectionId = null, subjectId, title, instructions, assignedDate, dueDate, status = "published" } = body;
    if (![academicYearId, classId, subjectId].every(validId) || (sectionId !== null && !validId(sectionId))) return invalid(res, "Select a valid academic year, class, section and subject");
    if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 120) return invalid(res, "Title must be between 3 and 120 characters");
    if (typeof instructions !== "string" || !instructions.trim() || instructions.trim().length > 5000) return invalid(res, "Instructions are required and must not exceed 5,000 characters");
    const assigned = parseDay(assignedDate), due = parseDay(dueDate);
    if (!assigned || !due || due < assigned) return invalid(res, "Provide valid dates; due date cannot be before assigned date");
    if (!["draft", "published"].includes(status)) return invalid(res, "Status must be draft or published");
    const [year, schoolClass, section, subject] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("startDate endDate status").lean(),
      SchoolClass.findOne({ _id: classId, tenantId: req.tenantId, academicYearId }).select("_id").lean(),
      sectionId ? Section.findOne({ _id: sectionId, tenantId: req.tenantId, classId }).select("_id").lean() : Promise.resolve(null),
      Subject.findOne({ _id: subjectId, tenantId: req.tenantId, status: "active" }).select("_id").lean(),
    ]);
    if (!year || !schoolClass || !subject || (sectionId && !section)) return invalid(res, "The selected academic year, class, section or subject does not belong to this school and scope");
    if (year.status !== "active") return res.status(409).json({ success: false, message: "Homework can only be created for the active academic year" });
    if (assigned < new Date(year.startDate) || due > new Date(year.endDate)) return invalid(res, "Homework dates must fall within the academic year");
    if (!await teacherCanTeach(req, { academicYearId, classId, sectionId, subjectId })) return res.status(403).json({ success: false, message: "You are not assigned to this subject and class or section" });
    const session = await mongoose.startSession();
    let homeworkId;
    try {
      await session.withTransaction(async () => {
        const [data] = await Homework.create([{
          tenantId: req.tenantId, academicYearId, classId, sectionId, subjectId,
          teacherId: req.auth.userId, title: title.trim(), instructions: instructions.trim(),
          assignedDate: assigned, dueDate: due, status,
        }], { session });
        homeworkId = data._id;
        if (status === "published") {
          const enrollmentFilter = {
            tenantId: req.tenantId, academicYearId, classId, status: "active",
            ...(sectionId ? { sectionId } : {}),
          };
          const enrollments = await Enrollment.find(enrollmentFilter).select("_id").session(session).lean();
          await enqueueStudentScopedNotification({
            tenantId: req.tenantId, enrollmentIds: enrollments.map((item) => item._id),
            eventType: "homework_published", sourceType: "Homework", sourceId: data._id,
            eventKey: `homework:${data._id}:published`, title: `New homework: ${data.title}`,
            body: data.instructions, link: "/portal?tab=homework", session,
          });
        }
      });
    } finally { await session.endSession(); }
    const populated = await Homework.findOne({ _id: homeworkId, tenantId: req.tenantId })
      .populate("classId", "name").populate("sectionId", "name")
      .populate("subjectId", "name code").populate("teacherId", "firstName lastName").lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more homework fields are invalid");
    return next(error);
  }
};

export const updateHomeworkStatus = async (req, res, next) => {
  try {
    if (!validId(req.params.homeworkId)) return invalid(res, "Invalid homework ID");
    if (!req.body || Object.keys(req.body).length !== 1 || !["draft", "published"].includes(req.body.status)) return invalid(res, "Provide a valid draft or published status");
    const filter = { _id: req.params.homeworkId, tenantId: req.tenantId };
    if (req.auth.role === "teacher") filter.teacherId = req.auth.userId;
    const existing = await Homework.findOne(filter).lean();
    if (!existing || !(await teacherCanTeach(req, existing))) {
      return res.status(404).json({ success: false, message: "Homework not found" });
    }
    const session = await mongoose.startSession();
    let data;
    try {
      await session.withTransaction(async () => {
        data = await Homework.findOneAndUpdate(
          { ...filter, status: existing.status },
          { $set: { status: req.body.status } },
          { new: true, runValidators: true, session },
        );
        if (!data) return;
        if (existing.status === "draft" && req.body.status === "published") {
          const enrollmentFilter = {
            tenantId: req.tenantId, academicYearId: data.academicYearId,
            classId: data.classId, status: "active",
            ...(data.sectionId ? { sectionId: data.sectionId } : {}),
          };
          const enrollments = await Enrollment.find(enrollmentFilter).select("_id").session(session).lean();
          await enqueueStudentScopedNotification({
            tenantId: req.tenantId, enrollmentIds: enrollments.map((item) => item._id),
            eventType: "homework_published", sourceType: "Homework", sourceId: data._id,
            eventKey: `homework:${data._id}:published`, title: `New homework: ${data.title}`,
            body: data.instructions, link: "/portal?tab=homework", session,
          });
        }
      });
    } finally { await session.endSession(); }
    if (!data) return res.status(404).json({ success: false, message: "Homework not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};
