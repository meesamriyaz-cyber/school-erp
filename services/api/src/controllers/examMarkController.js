import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { acquireExaminationResultLock, releaseExaminationResultLock } from "../utils/examinationResultLock.js";
import Examination from "../models/Examination.js";
import ExamSubject from "../models/ExamSubject.js";
import ExamMark from "../models/ExamMark.js";
import ExamMarkAudit from "../models/ExamMarkAudit.js";
import Enrollment from "../models/Enrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);

const teacherAssignmentFilter = (req, exam, examSubject, enrollment = null) => {
  const filter = {
    tenantId: req.tenantId,
    teacherId: req.auth.userId,
    subjectId: examSubject.subjectId,
    academicYearId: exam.academicYearId,
    classId: exam.classId,
    status: "active",
  };
  if (exam.sectionId) {
    filter.$or = [{ sectionId: null }, { sectionId: exam.sectionId }];
  } else if (enrollment) {
    filter.$or = [{ sectionId: null }, { sectionId: enrollment.sectionId || null }];
  }
  return filter;
};

const assertTeacherAssignment = async (req, exam, examSubject, enrollment) => {
  if (req.auth.role !== "teacher") return true;
  return Boolean(await TeacherAssignment.exists(
    teacherAssignmentFilter(req, exam, examSubject, enrollment)
  ));
};

export const listExaminationMarks = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    const exam = await Examination.findOne({ _id: req.params.examinationId, tenantId: req.tenantId }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    const filter = { tenantId: req.tenantId, examinationId: exam._id };
    let teacherAssignments = null;
    let examSubjectMap = null;
    if (req.query.examSubjectId !== undefined) {
      if (!validId(req.query.examSubjectId)) return invalid(res, "Invalid examination subject ID");
      filter.examSubjectId = req.query.examSubjectId;
    }
    if (req.query.enrollmentId !== undefined) {
      if (!validId(req.query.enrollmentId)) return invalid(res, "Invalid enrollment ID");
      filter.enrollmentId = req.query.enrollmentId;
    }
    if (req.auth.role === "teacher") {
      const subjectConfigs = await ExamSubject.find({ tenantId: req.tenantId, examinationId: exam._id }).lean();
      const assigned = await TeacherAssignment.find({
        tenantId: req.tenantId, teacherId: req.auth.userId, status: "active",
        academicYearId: exam.academicYearId, classId: exam.classId,
        subjectId: { $in: subjectConfigs.map((item) => item.subjectId) },
        ...(exam.sectionId ? { $or: [{ sectionId: exam.sectionId }, { sectionId: null }] } : {}),
      }).lean();
      teacherAssignments = assigned;
      examSubjectMap = new Map(subjectConfigs.map((item) => [String(item._id), String(item.subjectId)]));
      const allowedSubjectIds = [...new Set(assigned.map((item) => String(item.subjectId)))];
      const allowedConfigs = subjectConfigs
        .filter((item) => allowedSubjectIds.includes(String(item.subjectId)))
        .map((item) => item._id);
      if (!allowedConfigs.length) return res.status(403).json({ success: false, message: "You are not assigned to this examination" });
      filter.examSubjectId = { $in: allowedConfigs };
      if (!exam.sectionId && !assigned.some((item) => !item.sectionId)) {
        const sectionIds = [...new Set(assigned.map((item) => String(item.sectionId)))];
        const scopedEnrollments = await Enrollment.find({
          tenantId: req.tenantId, academicYearId: exam.academicYearId,
          classId: exam.classId, status: "active", sectionId: { $in: sectionIds },
        }).distinct("_id");
        filter.enrollmentId = { $in: scopedEnrollments };
      }
    }
    const data = await ExamMark.find(filter)
      .populate("studentId", "admissionNumber firstName lastName")
      .populate("examSubjectId", "subjectId maxMarks passMarks")
      .sort({ createdAt: 1, _id: 1 }).lean();
    if (teacherAssignments) {
      const enrollmentIds = [...new Set(data.map((item) => String(item.enrollmentId)))];
      const enrollments = await Enrollment.find({
        tenantId: req.tenantId, _id: { $in: enrollmentIds },
        academicYearId: exam.academicYearId, classId: exam.classId,
      }).select("_id sectionId").lean();
      const enrollmentSections = new Map(enrollments.map((item) => [String(item._id), String(item.sectionId || "")]));
      const scoped = data.filter((item) => teacherAssignments.some((assignment) =>
        String(assignment.subjectId) === examSubjectMap.get(String(item.examSubjectId?._id || item.examSubjectId)) &&
        (!assignment.sectionId || String(assignment.sectionId) === enrollmentSections.get(String(item.enrollmentId)))));
      return res.status(200).json({ success: true, data: scoped });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const saveExaminationMarks = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    const { marks } = req.body || {};
    if (!Array.isArray(marks) || marks.length < 1 || marks.length > 500) return invalid(res, "Provide between 1 and 500 mark records");
    const exam = await Examination.findOne({ _id: req.params.examinationId, tenantId: req.tenantId });
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    if (exam.status === "draft" || exam.status === "published") return res.status(409).json({ success: false, message: "Marks can only be entered after scheduling and before results are published" });

    const subjectIds = [...new Set(marks.map((item) => item?.examSubjectId).filter(validId))];
    const enrollmentIds = [...new Set(marks.map((item) => item?.enrollmentId).filter(validId))];
    if (subjectIds.length !== new Set(marks.map((item) => item?.examSubjectId)).size ||
        enrollmentIds.length !== new Set(marks.map((item) => item?.enrollmentId)).size) {
      return invalid(res, "Every mark record must include valid examination subject and enrollment IDs");
    }
    const [subjects, enrollments] = await Promise.all([
      ExamSubject.find({ tenantId: req.tenantId, examinationId: exam._id, _id: { $in: subjectIds } }).lean(),
      Enrollment.find({
        tenantId: req.tenantId, _id: { $in: enrollmentIds }, status: "active",
        academicYearId: exam.academicYearId, classId: exam.classId,
        ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
      }).select("_id studentId sectionId").lean(),
    ]);
    if (subjects.length !== subjectIds.length) return invalid(res, "One or more subjects do not belong to this examination");
    if (enrollments.length !== enrollmentIds.length) return invalid(res, "One or more students are not actively enrolled in this examination class scope");
    const subjectMap = new Map(subjects.map((item) => [String(item._id), item]));
    const enrollmentMap = new Map(enrollments.map((item) => [String(item._id), item]));
    const operations = [];
    const seen = new Set();
    for (const item of marks) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return invalid(res, "Each mark record must be an object");
      if (["tenantId", "examinationId", "studentId", "enteredBy"].some((key) => Object.hasOwn(item, key))) return invalid(res, "School, examination, student and entering user are determined by the server");
      const subject = subjectMap.get(String(item.examSubjectId));
      const enrollment = enrollmentMap.get(String(item.enrollmentId));
      if (!subject || !enrollment) return invalid(res, "Invalid subject or enrollment in mark record");
      const key = `${item.examSubjectId}:${item.enrollmentId}`;
      if (seen.has(key)) return invalid(res, "A student can have only one mark record per subject in a request");
      seen.add(key);
      const absent = item.absent === true;
      if (item.absent !== undefined && typeof item.absent !== "boolean") return invalid(res, "Absent must be true or false");
      let score = null;
      if (absent) {
        if (item.marksObtained !== undefined && item.marksObtained !== null && item.marksObtained !== "") return invalid(res, "Absent students cannot have marks");
      } else {
        score = Number(item.marksObtained);
        if (item.marksObtained === "" || item.marksObtained === null || !Number.isFinite(score) || score < 0 || score > subject.maxMarks) return invalid(res, `Marks must be between zero and ${subject.maxMarks}`);
      }
      if (item.remarks !== undefined && (typeof item.remarks !== "string" || item.remarks.trim().length > 300)) return invalid(res, "Remarks must be 300 characters or fewer");
      if (!await assertTeacherAssignment(req, exam, subject, enrollment)) return res.status(403).json({ success: false, message: "You are not assigned to this subject and class" });
      operations.push({
        updateOne: {
          filter: { tenantId: req.tenantId, examinationId: exam._id, examSubjectId: subject._id, enrollmentId: enrollment._id },
          update: { $set: { marksObtained: score, absent, remarks: (item.remarks || "").trim(), enteredBy: req.auth.userId }, $setOnInsert: { studentId: enrollment.studentId } },
          upsert: true,
        },
      });
    }
    const lockToken = randomUUID();
    const lockedExam = await acquireExaminationResultLock({
      tenantId: req.tenantId,
      examinationId: exam._id,
      statuses: ["scheduled", "in_progress", "completed"],
      token: lockToken,
    });
    if (!lockedExam) {
      return res.status(409).json({
        success: false,
        message: "Another marks save or result publication is in progress. Refresh and try again.",
      });
    }

    const changeReason = typeof req.body.changeReason === "string"
      ? req.body.changeReason.trim()
      : "";
    if (req.body.changeReason !== undefined &&
        (typeof req.body.changeReason !== "string" || changeReason.length > 500)) {
      await releaseExaminationResultLock(req.tenantId, exam._id, lockToken);
      return invalid(res, "Change reason must be 500 characters or fewer");
    }

    const session = await mongoose.startSession();
    let auditCount = 0;
    try {
      await session.withTransaction(async () => {
        const existingMarks = await ExamMark.find({
          tenantId: req.tenantId,
          examinationId: exam._id,
          examSubjectId: { $in: subjectIds },
          enrollmentId: { $in: enrollmentIds },
        }).session(session).lean();
        const existingMap = new Map(existingMarks.map((record) => [
          `${record.examSubjectId}:${record.enrollmentId}`, record,
        ]));
        const auditEntries = [];

        for (let index = 0; index < marks.length; index += 1) {
          const item = marks[index];
          const subject = subjectMap.get(String(item.examSubjectId));
          const enrollment = enrollmentMap.get(String(item.enrollmentId));
          const key = `${item.examSubjectId}:${item.enrollmentId}`;
          const previous = existingMap.get(key) || null;
          const nextValue = {
            marksObtained: item.absent === true ? null : Number(item.marksObtained),
            absent: item.absent === true,
            remarks: (item.remarks || "").trim(),
            enteredBy: req.auth.userId,
          };
          const changed = !previous ||
            previous.marksObtained !== nextValue.marksObtained ||
            Boolean(previous.absent) !== nextValue.absent ||
            (previous.remarks || "") !== nextValue.remarks ||
            String(previous.enteredBy) !== String(nextValue.enteredBy);

          if (previous && changed && changeReason.length < 5) {
            const error = new Error("A change reason of at least 5 characters is required when modifying an existing mark");
            error.statusCode = 400;
            throw error;
          }

          const markId = previous?._id || new mongoose.Types.ObjectId();
          operations[index].updateOne.update.$setOnInsert._id = markId;
          if (!changed) continue;

          auditEntries.push({
            tenantId: req.tenantId,
            examinationId: exam._id,
            examMarkId: markId,
            examSubjectId: subject._id,
            enrollmentId: enrollment._id,
            studentId: enrollment.studentId,
            action: previous ? "updated" : "created",
            previous: previous ? {
              marksObtained: previous.marksObtained ?? null,
              absent: Boolean(previous.absent),
              remarks: previous.remarks || "",
              enteredBy: previous.enteredBy || null,
            } : undefined,
            current: nextValue,
            changedBy: req.auth.userId,
            changeReason: previous ? changeReason : "",
          });
        }

        await ExamMark.bulkWrite(operations, { ordered: true, session });
        if (auditEntries.length) {
          await ExamMarkAudit.insertMany(auditEntries, { session, ordered: true });
        }
        auditCount = auditEntries.length;
      });
    } finally {
      await session.endSession();
      await releaseExaminationResultLock(req.tenantId, exam._id, lockToken);
    }
    return res.status(200).json({
      success: true,
      message: "Examination marks saved",
      count: operations.length,
      auditCount,
    });
  } catch (error) {
    if (error.statusCode === 400) return invalid(res, error.message);
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more mark records are invalid");
    return next(error);
  }
};


export const listExaminationMarkAudit = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    const exam = await Examination.findOne({
      _id: req.params.examinationId,
      tenantId: req.tenantId,
    }).select("_id").lean();
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });

    const filter = { tenantId: req.tenantId, examinationId: exam._id };
    for (const field of ["examSubjectId", "enrollmentId"]) {
      if (req.query[field] !== undefined) {
        if (!validId(req.query[field])) return invalid(res, `Invalid ${field}`);
        filter[field] = req.query[field];
      }
    }

    const requestedPage = Number.parseInt(req.query.page, 10);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;
    const [data, total] = await Promise.all([
      ExamMarkAudit.find(filter)
        .populate("changedBy", "firstName lastName email role")
        .populate("studentId", "firstName lastName admissionNumber")
        .populate("examSubjectId", "subjectId maxMarks passMarks")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExamMarkAudit.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getTeacherExamRoster = async (req, res, next) => {
  try {
    if (!validId(req.params.examinationId)) return invalid(res, "Invalid examination ID");
    const exam = await Examination.findOne({ _id: req.params.examinationId, tenantId: req.tenantId }).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Examination not found" });
    const subjects = await ExamSubject.find({ tenantId: req.tenantId, examinationId: exam._id })
      .populate("subjectId", "name code").lean();
    const assignments = await TeacherAssignment.find({
      tenantId: req.tenantId, teacherId: req.auth.userId, status: "active",
      academicYearId: exam.academicYearId, classId: exam.classId,
      subjectId: { $in: subjects.map((item) => item.subjectId?._id) },
      ...(exam.sectionId ? { $or: [{ sectionId: null }, { sectionId: exam.sectionId }] } : {}),
    }).select("subjectId sectionId").lean();
    const permitted = subjects.filter((item) => assignments.some((assignment) =>
      String(assignment.subjectId) === String(item.subjectId?._id)));
    if (!permitted.length) return res.status(403).json({ success: false, message: "You are not assigned to this examination" });
    const sectionIds = assignments.map((item) => item.sectionId).filter(Boolean);
    const unrestricted = assignments.some((item) => !item.sectionId);
    const enrollments = await Enrollment.find({
      tenantId: req.tenantId, academicYearId: exam.academicYearId, classId: exam.classId,
      status: "active",
      ...(exam.sectionId ? { sectionId: exam.sectionId } :
        unrestricted ? {} : { sectionId: { $in: sectionIds } }),
    }).populate("studentId", "firstName lastName admissionNumber")
      .populate("sectionId", "name").sort({ createdAt: 1 }).lean();
    return res.status(200).json({
      success: true,
      data: { subjects: permitted, enrollments, assignments: assignments.map((item) => ({
        subjectId: String(item.subjectId), sectionId: item.sectionId ? String(item.sectionId) : null,
      })) },
    });
  } catch (error) { return next(error); }
};
