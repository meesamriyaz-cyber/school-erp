import mongoose from "mongoose";
import Examination from "../models/Examination.js";
import ExamSubject from "../models/ExamSubject.js";
import ExamMark from "../models/ExamMark.js";
import Enrollment from "../models/Enrollment.js";

const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);

export const loadResultContext = async (tenantId, exam, { includeHistoricalEnrollments = false } = {}) => {
  const [subjects, enrollments] = await Promise.all([
    ExamSubject.find({ tenantId, examinationId: exam._id })
      .populate("subjectId", "name code")
      .sort({ examDate: 1, _id: 1 })
      .lean(),
    Enrollment.find({
      tenantId,
      academicYearId: exam.academicYearId,
      classId: exam.classId,
      ...(includeHistoricalEnrollments ? { status: { $in: ["active", "completed", "transferred", "withdrawn"] } } : { status: "active" }),
      ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
    })
      .populate("studentId", "admissionNumber firstName lastName")
      .sort({ _id: 1 })
      .lean(),
  ]);

  const marks = subjects.length && enrollments.length
    ? await ExamMark.find({
      tenantId,
      examinationId: exam._id,
      examSubjectId: { $in: subjects.map((subject) => subject._id) },
      enrollmentId: { $in: enrollments.map((enrollment) => enrollment._id) },
    }).lean()
    : [];

  const markMap = new Map(
    marks.map((mark) => [`${mark.enrollmentId}:${mark.examSubjectId}`, mark])
  );

  const results = enrollments.map((enrollment) => {
    let totalObtained = 0;
    let totalMaximum = 0;
    let passed = true;
    let completedSubjects = 0;

    const subjectResults = subjects.map((subject) => {
      const mark = markMap.get(`${enrollment._id}:${subject._id}`);
      totalMaximum += subject.maxMarks;

      if (!mark) {
        passed = false;
        return {
          examSubjectId: subject._id,
          subject: subject.subjectId,
          maxMarks: subject.maxMarks,
          passMarks: subject.passMarks,
          marksObtained: null,
          absent: false,
          status: "pending",
        };
      }

      completedSubjects += 1;
      const score = mark.absent ? 0 : Number(mark.marksObtained);
      totalObtained += score;
      const subjectPassed = !mark.absent && score >= subject.passMarks;
      if (!subjectPassed) passed = false;

      return {
        examSubjectId: subject._id,
        subject: subject.subjectId,
        maxMarks: subject.maxMarks,
        passMarks: subject.passMarks,
        marksObtained: mark.absent ? null : score,
        absent: mark.absent,
        status: mark.absent ? "absent" : subjectPassed ? "passed" : "failed",
        remarks: mark.remarks,
      };
    });

    const complete = subjects.length > 0 && completedSubjects === subjects.length;
    const percentage = totalMaximum > 0
      ? Number(((totalObtained / totalMaximum) * 100).toFixed(2))
      : 0;

    return {
      enrollmentId: enrollment._id,
      student: enrollment.studentId,
      subjects: subjectResults,
      totalObtained,
      totalMaximum,
      percentage,
      status: !complete ? "incomplete" : passed ? "passed" : "failed",
      completedSubjects,
      totalSubjects: subjects.length,
    };
  });

  const incompleteCount = results.filter((result) => result.status === "incomplete").length;
  return { subjects, enrollments, results, incompleteCount };
};

export const getExaminationResults = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");

    const exam = await Examination.findOne({
      _id: req.params.examinationId,
      tenantId: req.tenantId,
    }).lean();

    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    if (!["completed", "published"].includes(exam.status)) {
      return res.status(409).json({ success: false, message: "Results are available after the examination is completed" });
    }

    const context = await loadResultContext(req.tenantId, exam);
    return res.status(200).json({
      success: true,
      data: context.results,
      summary: {
        examinationId: exam._id,
        status: exam.status,
        studentCount: context.enrollments.length,
        subjectCount: context.subjects.length,
        incompleteCount: context.incompleteCount,
        publishable: context.enrollments.length > 0 &&
          context.subjects.length > 0 &&
          context.incompleteCount === 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const publishExaminationResults = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");

    const exam = await Examination.findOne({
      _id: req.params.examinationId,
      tenantId: req.tenantId,
    });

    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    if (exam.status !== "completed") {
      return res.status(409).json({ success: false, message: "Only completed examinations can be published" });
    }

    const context = await loadResultContext(req.tenantId, exam);
    if (!context.subjects.length || !context.enrollments.length) {
      return res.status(409).json({
        success: false,
        message: "Results require at least one configured subject and one active enrollment",
      });
    }

    if (context.incompleteCount > 0) {
      return res.status(409).json({
        success: false,
        message: "Every active student must have marks or an absence record for every examination subject",
        incompleteCount: context.incompleteCount,
      });
    }

    const published = await Examination.findOneAndUpdate(
      { _id: exam._id, tenantId: req.tenantId, status: "completed" },
      { $set: { status: "published" } },
      { new: true, runValidators: true }
    );

    if (!published) {
      return res.status(409).json({ success: false, message: "The examination status changed; refresh and try again" });
    }

    return res.status(200).json({
      success: true,
      message: "Examination results published",
      data: { examinationId: published._id, status: published.status, studentCount: context.results.length },
    });
  } catch (error) {
    return next(error);
  }
};
