import mongoose from "mongoose";
import Homework from "../models/Homework.js";
import HomeworkSubmission from "../models/HomeworkSubmission.js";
import Enrollment from "../models/Enrollment.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });

const getStudentForUser = async (req) => {
  const student = await Student.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" }).select("_id").lean();
  return student;
};

const getHomeworkForTeacher = async (req, homeworkId) => {
  const filter = { _id: homeworkId, tenantId: req.tenantId };
  if (req.auth.role === "teacher") filter.teacherId = req.auth.userId;
  const homework = await Homework.findOne(filter).lean();
  if (!homework) return null;
  if (req.auth.role === "teacher" && !await TeacherAssignment.exists({
    tenantId: req.tenantId, teacherId: req.auth.userId, academicYearId: homework.academicYearId,
    classId: homework.classId, subjectId: homework.subjectId, status: "active",
    ...(homework.sectionId ? { $or: [{ sectionId: homework.sectionId }, { sectionId: null }] } : { sectionId: null }),
  })) return null;
  return homework;
};

export const listHomeworkSubmissions = async (req, res, next) => {
  try {
    if (!validId(req.params.homeworkId)) return invalid(res, "Invalid homework ID");
    const homework = await getHomeworkForTeacher(req, req.params.homeworkId);
    if (!homework) return res.status(404).json({ success: false, message: "Homework not found or access denied" });
    const enrollments = await Enrollment.find({
      tenantId: req.tenantId, academicYearId: homework.academicYearId, classId: homework.classId,
      status: { $in: ["active", "completed", "transferred"] },
      ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
    }).select("_id studentId").lean();
    const data = await HomeworkSubmission.find({
      tenantId: req.tenantId, homeworkId: homework._id, enrollmentId: { $in: enrollments.map((item) => item._id) },
    }).populate("studentId", "admissionNumber firstName lastName")
      .populate("reviewedBy", "firstName lastName").sort({ submittedAt: -1 }).lean();
    return res.status(200).json({ success: true, data, summary: { assigned: enrollments.length, submitted: data.length, reviewed: data.filter((item) => item.status === "reviewed").length } });
  } catch (error) { return next(error); }
};

export const submitHomework = async (req, res, next) => {
  try {
    if (!validId(req.params.homeworkId)) return invalid(res, "Invalid homework ID");
    if (!req.body || Object.keys(req.body).some((key) => key !== "answer") || typeof req.body.answer !== "string" || !req.body.answer.trim() || req.body.answer.trim().length > 10000) {
      return invalid(res, "Provide a written answer of up to 10,000 characters");
    }
    const student = await getStudentForUser(req);
    if (!student) return res.status(409).json({ success: false, message: "Your student account has not been linked by the school" });
    const homework = await Homework.findOne({ _id: req.params.homeworkId, tenantId: req.tenantId, status: "published", assignedDate: { $lte: new Date() } }).lean();
    if (!homework) return res.status(404).json({ success: false, message: "Published homework not found" });
    const enrollment = await Enrollment.findOne({
      tenantId: req.tenantId, studentId: student._id, academicYearId: homework.academicYearId,
      classId: homework.classId, status: { $in: ["active", "completed", "transferred"] },
      ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
    }).select("_id").lean();
    if (!enrollment) return res.status(403).json({ success: false, message: "This homework is not assigned to your current or historical class enrollment" });
    const existing = await HomeworkSubmission.findOne({ tenantId: req.tenantId, homeworkId: homework._id, enrollmentId: enrollment._id });
    if (existing?.status === "reviewed") return res.status(409).json({ success: false, message: "This submission has already been reviewed and is locked" });
    const submission = await HomeworkSubmission.findOneAndUpdate(
      { tenantId: req.tenantId, homeworkId: homework._id, enrollmentId: enrollment._id },
      { $set: { answer: req.body.answer.trim(), submittedAt: new Date(), status: "submitted", marksObtained: null, maxMarks: null, feedback: "", reviewedBy: null, reviewedAt: null },
        $setOnInsert: { tenantId: req.tenantId, homeworkId: homework._id, enrollmentId: enrollment._id, studentId: student._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json({ success: true, data: submission });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A submission already exists; refresh and try again" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "Submission details are invalid");
    return next(error);
  }
};

export const reviewHomeworkSubmission = async (req, res, next) => {
  try {
    if (!validId(req.params.homeworkId) || !validId(req.params.submissionId)) return invalid(res, "Invalid homework or submission ID");
    const { marksObtained = null, maxMarks = null, feedback = "" } = req.body || {};
    if (!req.body || Object.keys(req.body).some((key) => !["marksObtained", "maxMarks", "feedback"].includes(key))) return invalid(res, "Only marks and feedback may be supplied");
    if (typeof feedback !== "string" || feedback.trim().length > 3000) return invalid(res, "Feedback must be 3,000 characters or fewer");
    const hasMarks = marksObtained !== null && marksObtained !== "";
    const hasMaximum = maxMarks !== null && maxMarks !== "";
    if (hasMarks !== hasMaximum) return invalid(res, "Provide both marks obtained and maximum marks, or leave both blank");
    let score = null, maximum = null;
    if (hasMarks) {
      score = Number(marksObtained); maximum = Number(maxMarks);
      if (!Number.isFinite(score) || !Number.isFinite(maximum) || maximum <= 0 || score < 0 || score > maximum) return invalid(res, "Marks must be valid and marks obtained cannot exceed maximum marks");
    }
    const homework = await getHomeworkForTeacher(req, req.params.homeworkId);
    if (!homework) return res.status(404).json({ success: false, message: "Homework not found or access denied" });
    const submission = await HomeworkSubmission.findOne({
      _id: req.params.submissionId, tenantId: req.tenantId, homeworkId: homework._id, status: "submitted",
    });
    if (!submission) return res.status(404).json({ success: false, message: "Pending submission not found" });
    submission.status = "reviewed";
    submission.marksObtained = score;
    submission.maxMarks = maximum;
    submission.feedback = feedback.trim();
    submission.reviewedBy = req.auth.userId;
    submission.reviewedAt = new Date();
    await submission.save();
    return res.status(200).json({ success: true, data: submission });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "Review details are invalid");
    return next(error);
  }
};

export const getMyHomeworkSubmissions = async (req, res, next) => {
  try {
    let studentIds = [];
    if (req.auth.role === "student") {
      const student = await getStudentForUser(req);
      if (!student) return res.status(409).json({ success: false, message: "Your student account has not been linked by the school" });
      studentIds = [student._id];
    } else {
      const guardian = await Guardian.findOne({ tenantId: req.tenantId, userId: req.auth.userId, status: "active" }).select("_id").lean();
      if (!guardian) return res.status(409).json({ success: false, message: "Your parent account has not been linked by the school" });
      const links = await StudentGuardian.find({ tenantId: req.tenantId, guardianId: guardian._id, status: "active" }).select("studentId").lean();
      studentIds = links.map((item) => item.studentId);
    }
    const data = await HomeworkSubmission.find({ tenantId: req.tenantId, studentId: { $in: studentIds } })
      .populate("homeworkId", "title dueDate subjectId").populate("reviewedBy", "firstName lastName")
      .populate("studentId", "firstName lastName").sort({ submittedAt: -1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};
