import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { acquireExaminationResultLock, releaseExaminationResultLock } from "../utils/examinationResultLock.js";
import Examination from "../models/Examination.js";
import ExamSubject from "../models/ExamSubject.js";
import ExamMark from "../models/ExamMark.js";
import Enrollment from "../models/Enrollment.js";
import GradingScale from "../models/GradingScale.js";
import { getGradeForPercentage } from "../utils/grading.js";
import { buildExaminationAnalytics } from "../utils/examinationAnalytics.js";

const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);

export const loadResultContext = async (tenantId, exam, { includeHistoricalEnrollments = false, gradingScale = null, includeAnalytics = false } = {}) => {
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

  const gradingBands = exam.gradingScaleSnapshot?.bands || gradingScale?.bands || [];
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
      const subjectPercentage = mark.absent
        ? null
        : Number(((score / subject.maxMarks) * 100).toFixed(2));

      return {
        examSubjectId: subject._id,
        subject: subject.subjectId,
        maxMarks: subject.maxMarks,
        passMarks: subject.passMarks,
        marksObtained: mark.absent ? null : score,
        percentage: subjectPercentage,
        grade: subjectPercentage === null ? null : getGradeForPercentage(subjectPercentage, gradingBands),
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
      grade: complete ? getGradeForPercentage(percentage, gradingBands) : null,
      status: !complete ? "incomplete" : passed ? "passed" : "failed",
      completedSubjects,
      totalSubjects: subjects.length,
    };
  });

  const incompleteCount = results.filter((result) => result.status === "incomplete").length;
  const completeResults = results.filter((result) => result.status !== "incomplete");
  const passedCount = completeResults.filter((result) => result.status === "passed").length;
  const failedCount = completeResults.filter((result) => result.status === "failed").length;
  const percentages = completeResults.map((result) => result.percentage);
  const averagePercentage = percentages.length
    ? Number((percentages.reduce((total, value) => total + value, 0) / percentages.length).toFixed(2))
    : null;
  const analytics = includeAnalytics ? buildExaminationAnalytics({
    subjects,
    enrollments,
    marks,
    results,
    gradingBands,
  }) : {};

  return {
    subjects,
    enrollments,
    results,
    incompleteCount,
    passedCount,
    failedCount,
    averagePercentage,
    highestPercentage: percentages.length ? Math.max(...percentages) : null,
    lowestPercentage: percentages.length ? Math.min(...percentages) : null,
    ...analytics,
  };
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

    const gradingScale = exam.status === "completed"
      ? await GradingScale.findOne({ tenantId: req.tenantId, status: "active" }).lean()
      : null;
    const context = await loadResultContext(req.tenantId, exam, { gradingScale, includeAnalytics: true });
    return res.status(200).json({
      success: true,
      data: context.results,
      summary: {
        examinationId: exam._id,
        status: exam.status,
        gradingScaleName: exam.gradingScaleSnapshot?.name || gradingScale?.name || null,
        studentCount: context.enrollments.length,
        subjectCount: context.subjects.length,
        incompleteCount: context.incompleteCount,
        passedCount: context.passedCount,
        failedCount: context.failedCount,
        averagePercentage: context.averagePercentage,
        highestPercentage: context.highestPercentage,
        lowestPercentage: context.lowestPercentage,
        classPassRate: context.classPassRate,
        gradeDistribution: context.gradeDistribution,
        subjectAnalytics: context.subjectAnalytics,
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
  let lockToken = null;
  let examinationId = null;
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

    examinationId = exam._id;
    lockToken = randomUUID();
    const lockedExam = await acquireExaminationResultLock({
      tenantId: req.tenantId,
      examinationId,
      statuses: ["completed"],
      token: lockToken,
    });
    if (!lockedExam) {
      return res.status(409).json({
        success: false,
        message: "Marks are being saved or another publication is in progress. Refresh and try again.",
      });
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

    const gradingScale = await GradingScale.findOne({
      tenantId: req.tenantId,
      status: "active",
    }).lean();
    const gradingScaleSnapshot = gradingScale ? {
      gradingScaleId: gradingScale._id,
      name: gradingScale.name,
      bands: gradingScale.bands.map(({ grade, minPercentage, maxPercentage, description }) => ({
        grade, minPercentage, maxPercentage, description: description || "",
      })),
    } : null;

    const published = await Examination.findOneAndUpdate(
      {
        _id: exam._id,
        tenantId: req.tenantId,
        status: "completed",
        resultLockToken: lockToken,
      },
      {
        $set: { status: "published", gradingScaleSnapshot },
        $unset: { resultLockToken: 1, resultLockExpiresAt: 1 },
      },
      { new: true, runValidators: true }
    );

    if (!published) {
      return res.status(409).json({ success: false, message: "The examination changed during publication; refresh and try again" });
    }

    return res.status(200).json({
      success: true,
      message: "Examination results published",
      data: { examinationId: published._id, status: published.status, studentCount: context.results.length },
    });
  } catch (error) {
    return next(error);
  } finally {
    if (lockToken && examinationId) {
      await releaseExaminationResultLock(req.tenantId, examinationId, lockToken);
    }
  }
};
