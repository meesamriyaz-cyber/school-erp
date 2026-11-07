import mongoose from "mongoose";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Enrollment from "../models/Enrollment.js";
import Examination from "../models/Examination.js";
import Homework from "../models/Homework.js";
import { loadResultContext } from "./examResultController.js";

const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);

const linkAccount = async ({ req, res, Model, idParam, expectedRole, label, requireEmailMatch = false }) => {
  const recordId = req.params[idParam];
  const userId = req.body?.userId;
  if (!validId(recordId) || !validId(userId)) return invalid(res, "A valid record ID and userId are required");
  const record = await Model.findOne({ _id: recordId, tenantId: req.tenantId }).lean();
  if (!record) return res.status(404).json({ success: false, message: `${label} not found` });
  const user = await User.findOne({
    _id: userId, tenantId: req.tenantId, role: expectedRole, status: "active",
  }).select("_id email").lean();
  if (!user) return res.status(404).json({ success: false, message: `Active ${expectedRole} account not found in this school` });
  if (requireEmailMatch && record.email && record.email.toLowerCase() !== user.email.toLowerCase()) {
    return res.status(409).json({ success: false, message: "Guardian email must match the selected parent account" });
  }
  if (record.userId && String(record.userId) !== String(user._id)) {
    return res.status(409).json({ success: false, message: `${label} is already linked to another account` });
  }
  const existing = await Model.findOne({ tenantId: req.tenantId, userId: user._id, _id: { $ne: record._id } }).select("_id").lean();
  if (existing) return res.status(409).json({ success: false, message: `This account is already linked to another ${label.toLowerCase()}` });
  try {
    const linked = await Model.findOneAndUpdate(
      { _id: record._id, tenantId: req.tenantId, userId: record.userId ?? null },
      { $set: { userId: user._id } },
      { new: true, runValidators: true },
    ).select("-__v").lean();
    if (!linked) return res.status(409).json({ success: false, message: "Account link changed; refresh and try again" });
    return res.status(200).json({ success: true, data: linked });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This account is already linked" });
    throw error;
  }
};

export const linkStudentAccount = async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).some((key) => key !== "userId")) return invalid(res, "Only userId may be supplied");
    return await linkAccount({ req, res, Model: Student, idParam: "studentId", expectedRole: "student", label: "Student" });
  } catch (error) { return next(error); }
};

export const linkGuardianAccount = async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).some((key) => key !== "userId")) return invalid(res, "Only userId may be supplied");
    return await linkAccount({ req, res, Model: Guardian, idParam: "guardianId", expectedRole: "parent", label: "Guardian", requireEmailMatch: true });
  } catch (error) { return next(error); }
};

export const getMyPublishedResults = async (req, res, next) => {
  try {
    let students = [];
    if (req.auth.role === "student") {
      const student = await Student.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" })
        .select("_id admissionNumber firstName lastName").lean();
      if (!student) return res.status(409).json({ success: false, message: "Your student account has not been linked by the school" });
      if (req.query.studentId && String(req.query.studentId) !== String(student._id)) {
        return res.status(403).json({ success: false, message: "You may only access your own results" });
      }
      students = [student];
    } else {
      const guardian = await Guardian.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" }).select("_id").lean();
      if (!guardian) return res.status(409).json({ success: false, message: "Your parent account has not been linked by the school" });
      const links = await StudentGuardian.find({
        tenantId: req.tenantId, guardianId: guardian._id, status: "active",
      }).select("studentId").lean();
      const studentIds = links.map((link) => link.studentId);
      if (req.query.studentId && !validId(req.query.studentId)) return invalid(res, "Invalid studentId");
      if (req.query.studentId && !studentIds.some((id) => String(id) === String(req.query.studentId))) {
        return res.status(403).json({ success: false, message: "This student is not linked to your parent account" });
      }
      const filter = { tenantId: req.tenantId, _id: { $in: studentIds }, status: "active" };
      if (req.query.studentId) filter._id = req.query.studentId;
      students = await Student.find(filter).select("_id admissionNumber firstName lastName").sort({ firstName: 1, lastName: 1 }).lean();
    }

    if (!students.length) return res.status(200).json({ success: true, data: [] });
    const enrollments = await Enrollment.find({
      tenantId: req.tenantId,
      studentId: { $in: students.map((student) => student._id) },
      status: { $in: ["active", "completed", "transferred"] },
    }).select("_id studentId academicYearId classId sectionId").lean();
    if (!enrollments.length) return res.status(200).json({ success: true, data: [] });

    const exams = await Examination.find({
      tenantId: req.tenantId,
      status: "published",
      $or: enrollments.map((enrollment) => ({
        academicYearId: enrollment.academicYearId,
        classId: enrollment.classId,
        $or: [{ sectionId: null }, { sectionId: enrollment.sectionId }],
      })),
    }).sort({ endDate: -1, _id: -1 }).lean();

    const data = [];
    for (const exam of exams) {
      const context = await loadResultContext(req.tenantId, exam, { includeHistoricalEnrollments: true });
      for (const enrollment of enrollments) {
        if (String(enrollment.academicYearId) !== String(exam.academicYearId) ||
            String(enrollment.classId) !== String(exam.classId) ||
            (exam.sectionId && String(enrollment.sectionId) !== String(exam.sectionId))) continue;
        const result = context.results.find((item) => String(item.enrollmentId) === String(enrollment._id));
        if (!result) continue;
        const student = students.find((item) => String(item._id) === String(enrollment.studentId));
        data.push({
          examination: { _id: exam._id, name: exam.name, startDate: exam.startDate, endDate: exam.endDate },
          student,
          result,
        });
      }
    }
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};


export const getMyHomework = async (req, res, next) => {
  try {
    let students = [];
    if (req.auth.role === "student") {
      const student = await Student.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" })
        .select("_id admissionNumber firstName lastName").lean();
      if (!student) return res.status(409).json({ success: false, message: "Your student account has not been linked by the school" });
      if (req.query.studentId && String(req.query.studentId) !== String(student._id)) {
        return res.status(403).json({ success: false, message: "You may only access your own homework" });
      }
      students = [student];
    } else {
      const guardian = await Guardian.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" }).select("_id").lean();
      if (!guardian) return res.status(409).json({ success: false, message: "Your parent account has not been linked by the school" });
      const links = await StudentGuardian.find({ tenantId: req.tenantId, guardianId: guardian._id, status: "active" }).select("studentId").lean();
      const linkedStudentIds = links.map((item) => item.studentId);
      if (req.query.studentId && !validId(req.query.studentId)) return invalid(res, "Invalid studentId");
      if (req.query.studentId && !linkedStudentIds.some((id) => String(id) === String(req.query.studentId))) {
        return res.status(403).json({ success: false, message: "This student is not linked to your parent account" });
      }
      const filter = { tenantId: req.tenantId, _id: { $in: linkedStudentIds }, status: "active" };
      if (req.query.studentId) filter._id = req.query.studentId;
      students = await Student.find(filter)
        .select("_id admissionNumber firstName lastName").sort({ firstName: 1, lastName: 1 }).lean();
    }
    if (!students.length) return res.status(200).json({ success: true, data: [] });
    const enrollments = await Enrollment.find({
      tenantId: req.tenantId, studentId: { $in: students.map((item) => item._id) },
      status: { $in: ["active", "completed", "transferred"] },
    }).select("_id studentId academicYearId classId sectionId").lean();
    if (!enrollments.length) return res.status(200).json({ success: true, data: [] });
    const now = new Date();
    const clauses = enrollments.map((item) => ({
      academicYearId: item.academicYearId, classId: item.classId,
      $or: [{ sectionId: null }, ...(item.sectionId ? [{ sectionId: item.sectionId }] : [])],
    }));
    const tasks = await Homework.find({
      tenantId: req.tenantId, status: "published", assignedDate: { $lte: now }, $or: clauses,
    }).populate("subjectId", "name code").populate("teacherId", "firstName lastName")
      .populate("classId", "name").populate("sectionId", "name")
      .sort({ dueDate: 1, assignedDate: -1 }).limit(500).lean();
    const data = [];
    for (const enrollment of enrollments) {
      const student = students.find((item) => String(item._id) === String(enrollment.studentId));
      for (const task of tasks) {
        if (String(task.academicYearId) !== String(enrollment.academicYearId) ||
            String(task.classId?._id || task.classId) !== String(enrollment.classId) ||
            (task.sectionId && String(task.sectionId._id || task.sectionId) !== String(enrollment.sectionId))) continue;
        data.push({ homework: task, student, enrollmentId: enrollment._id });
      }
    }
    data.sort((a, b) => new Date(a.homework.dueDate) - new Date(b.homework.dueDate));
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

