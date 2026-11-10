import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Enrollment from "../models/Enrollment.js";
import AcademicYear from "../models/AcademicYear.js";
import AcademicTerm from "../models/AcademicTerm.js";
import SchoolClass from "../models/SchoolClass.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import { enqueueStudentScopedNotification } from "../services/notificationEnqueueService.js";

const STATUSES = ["present", "absent", "late", "excused"];
const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const parseDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};


const teacherAssignmentFilter = async (req, academicYearId, classId, sectionId, session = null) => {
  if (req.auth.role !== "teacher") return null;
  let query = TeacherAssignment.find({ tenantId: req.tenantId, teacherId: req.auth.userId, academicYearId, classId, status: "active" }).select("sectionId");
  if (session) query = query.session(session);
  const assignments = await query.lean();
  if (!assignments.length) return false;
  if (sectionId !== undefined && sectionId !== null && !assignments.some((item) => !item.sectionId || String(item.sectionId) === String(sectionId))) return false;
  return assignments;
};

export const getAttendanceRoster = async (req, res, next) => {
  try {
    const { date, academicYearId, classId, sectionId, academicTermId } = req.query;
    const day = parseDay(date);
    if (!day) return invalid(res, "Provide a valid attendance date in YYYY-MM-DD format");
    if (!validId(academicYearId) || !validId(classId)) return invalid(res, "Academic year and class are required");
    if (sectionId !== undefined && sectionId !== "none" && !validId(sectionId)) return invalid(res, "Invalid section ID");

    const year = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("startDate endDate status").lean();
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found" });
    const teacherScope = await teacherAssignmentFilter(req, academicYearId, classId, sectionId === "none" ? null : sectionId);
    if (teacherScope === false) return res.status(403).json({ success: false, message: "You are not assigned to this class or section" });
    if (day < new Date(year.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(year.endDate).setUTCHours(0, 0, 0, 0)) {
      return invalid(res, "Attendance date must fall within the selected academic year");
    }
    let term = null;
    if (academicTermId) {
      term = await AcademicTerm.findOne({ _id: academicTermId, tenantId: req.tenantId, academicYearId, status: "active" }).select("_id startDate endDate").lean();
      if (!term) return res.status(409).json({ success: false, message: "Attendance can only be recorded against an active term in this academic year" });
      if (day < new Date(term.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(term.endDate).setUTCHours(0, 0, 0, 0)) {
        return invalid(res, "Attendance date must fall within the selected academic term");
      }
    }

    let termFilter = {};
    if (academicTermId !== undefined) {
      if (!validId(academicTermId)) return invalid(res, "Invalid academic term ID");
      const term = await AcademicTerm.findOne({ _id: academicTermId, tenantId: req.tenantId, academicYearId }).select("_id startDate endDate").lean();
      if (!term || day < new Date(term.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(term.endDate).setUTCHours(0, 0, 0, 0)) {
        return invalid(res, "Attendance date must fall within the selected academic term");
      }
      termFilter = { academicTermId: term._id };
    }

    const enrollmentFilter = { tenantId: req.tenantId, academicYearId, classId, status: "active" };
    if (sectionId === "none") enrollmentFilter.sectionId = null;
    else if (sectionId) enrollmentFilter.sectionId = sectionId;
    else if (Array.isArray(teacherScope)) {
      const assignedSections = teacherScope.filter((item) => item.sectionId).map((item) => item.sectionId);
      if (assignedSections.length && !teacherScope.some((item) => !item.sectionId)) enrollmentFilter.sectionId = { $in: assignedSections };
    }
    const enrollments = await Enrollment.find(enrollmentFilter)
      .populate("studentId", "admissionNumber firstName lastName status")
      .populate("sectionId", "name")
      .sort({ "studentId.firstName": 1, "studentId.lastName": 1 })
      .lean();
    const records = await Attendance.find({ tenantId: req.tenantId, academicYearId, classId, date: day, ...termFilter }).lean();
    const byStudent = new Map(records.map((record) => [String(record.studentId), record]));
    const data = enrollments.filter((item) => item.studentId?.status === "active").map((item) => ({
      enrollmentId: item._id,
      student: item.studentId,
      section: item.sectionId,
      attendance: byStudent.get(String(item.studentId._id)) || null,
    }));
    return res.status(200).json({ success: true, date, data, summary: {
      total: data.length,
      marked: data.filter((item) => item.attendance).length,
      present: records.filter((item) => item.status === "present").length,
      absent: records.filter((item) => item.status === "absent").length,
      late: records.filter((item) => item.status === "late").length,
      excused: records.filter((item) => item.status === "excused").length,
    }});
  } catch (error) { return next(error); }
};

export const saveAttendance = async (req, res, next) => {
  const { date, academicYearId, academicTermId = null, classId, sectionId, records } = req.body || {};
  const day = parseDay(date);
  if (!day) return invalid(res, "Provide a valid attendance date in YYYY-MM-DD format");
  if (!validId(academicYearId) || !validId(classId)) return invalid(res, "Academic year and class are required");
  if (academicTermId !== null && !validId(academicTermId)) return invalid(res, "Invalid academic term ID");
  if (sectionId !== undefined && sectionId !== null && !validId(sectionId)) return invalid(res, "Invalid section ID");
  if (!Array.isArray(records) || records.length < 1 || records.length > 500) return invalid(res, "Provide between 1 and 500 attendance records");
  if (Object.hasOwn(req.body, "tenantId") || records.some((item) => !item || Object.hasOwn(item, "tenantId"))) {
    return invalid(res, "School assignment is determined by the authenticated account");
  }
  const ids = records.map((item) => item.studentId);
  if (ids.some((id) => !validId(id)) || new Set(ids.map(String)).size !== ids.length) return invalid(res, "Student IDs must be valid and unique");
  if (records.some((item) => !STATUSES.includes(item.status) || (item.remarks !== undefined && (typeof item.remarks !== "string" || item.remarks.trim().length > 300)))) {
    return invalid(res, "Each record needs a valid status and remarks of at most 300 characters");
  }

  if (academicTermId) await AcademicTerm.init();
  const session = await mongoose.startSession();
  let saved = [];
  try {
    await session.withTransaction(async () => {
      const year = await AcademicYear.findOneAndUpdate(
        { _id: academicYearId, tenantId: req.tenantId, status: "active" },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("startDate endDate status").lean();
      if (!year) { const error = new Error("Attendance can only be recorded for this school's active academic year"); error.statusCode = 409; throw error; }
      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: classId, tenantId: req.tenantId, academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!schoolClass) { const error = new Error("Attendance can only be recorded for an active class in this academic year"); error.statusCode = 409; throw error; }
      if (day < new Date(year.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(year.endDate).setUTCHours(0, 0, 0, 0)) {
        const error = new Error("Attendance date must fall within the selected academic year"); error.statusCode = 400; throw error;
      }

      let term = null;
      if (academicTermId) {
        term = await AcademicTerm.findOne({
          _id: academicTermId, tenantId: req.tenantId, academicYearId, status: "active",
        }).select("_id startDate endDate").session(session).lean();
        if (!term) { const error = new Error("Attendance can only be recorded against an active term in this academic year"); error.statusCode = 409; throw error; }
        if (day < new Date(term.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(term.endDate).setUTCHours(0, 0, 0, 0)) {
          const error = new Error("Attendance date must fall within the selected academic term"); error.statusCode = 400; throw error;
        }
      }

      const teacherScope = await teacherAssignmentFilter(req, academicYearId, classId, sectionId, session);
      if (teacherScope === false) { const error = new Error("You are not assigned to this class or section"); error.statusCode = 403; throw error; }

      const enrollmentFilter = {
        tenantId: req.tenantId, academicYearId, classId, status: "active", studentId: { $in: ids },
        ...(sectionId ? { sectionId } : {}),
      };
      if (sectionId === null) enrollmentFilter.sectionId = null;
      const enrollments = await Enrollment.find(enrollmentFilter).select("_id studentId sectionId").session(session).lean();
      if (enrollments.length !== records.length) {
        const error = new Error("Every student must have an active enrollment in the selected class, section, academic year, and school"); error.statusCode = 400; throw error;
      }
      if (Array.isArray(teacherScope)) {
        const allowedSections = teacherScope.filter((item) => item.sectionId).map((item) => String(item.sectionId));
        const hasClassWideAssignment = teacherScope.some((item) => !item.sectionId);
        if (enrollments.some((item) => item.sectionId && !hasClassWideAssignment && !allowedSections.includes(String(item.sectionId)))) {
          const error = new Error("Attendance includes a section outside your teaching assignment"); error.statusCode = 403; throw error;
        }
      }
      const enrollmentByStudent = new Map(enrollments.map((item) => [String(item.studentId), item]));
      const previousRecords = await Attendance.find({
        tenantId: req.tenantId, studentId: { $in: ids }, date: day,
      }).select("_id studentId status").session(session).lean();
      const previousByStudent = new Map(previousRecords.map((item) => [String(item.studentId), item]));
      const operations = records.map((record) => {
        const enrollment = enrollmentByStudent.get(String(record.studentId));
        return { updateOne: {
          filter: { tenantId: req.tenantId, studentId: record.studentId, date: day },
          update: { $set: {
            enrollmentId: enrollment._id, academicYearId, academicTermId: term?._id || null,
            classId, sectionId: enrollment.sectionId || null,
            status: record.status, remarks: record.remarks?.trim() || "", markedBy: req.auth.userId,
          }},
          upsert: true,
        }};
      });
      await Attendance.bulkWrite(operations, { ordered: true, session });
      saved = await Attendance.find({
        tenantId: req.tenantId, academicYearId, classId, date: day, studentId: { $in: ids },
      }).session(session).lean();
      const newlyAbsent = saved.filter((item) =>
        item.status === "absent" && previousByStudent.get(String(item.studentId))?.status !== "absent"
      );
      for (const item of newlyAbsent) {
        const enrollment = enrollmentByStudent.get(String(item.studentId));
        await enqueueStudentScopedNotification({
          tenantId: req.tenantId, enrollmentIds: [enrollment._id],
          eventType: "attendance_absence", sourceType: "Attendance", sourceId: item._id,
          eventKey: `attendance:${item.studentId}:${day.toISOString().slice(0, 10)}:absent`,
          title: "Student marked absent",
          body: `Attendance recorded as absent for ${day.toISOString().slice(0, 10)}.`,
          link: "/portal?tab=attendance", session,
        });
      }
    });
    return res.status(200).json({ success: true, data: saved, savedCount: saved.length });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    if (error.code === 11000) return res.status(409).json({ success: false, message: "Attendance was updated concurrently. Reload the register and try again." });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more attendance records are invalid");
    return next(error);
  } finally { await session.endSession(); }
};


export const getAttendanceReports = async (req, res, next) => {
  try {
    const { academicYearId, from, to, classId, academicTermId } = req.query;
    const start = parseDay(from);
    const end = parseDay(to);
    if (!validId(academicYearId)) return invalid(res, "A valid academic year is required");
    if (!start || !end || start > end) return invalid(res, "Provide a valid date range in YYYY-MM-DD format");
    if ((end - start) / 86400000 > 366) return invalid(res, "Date range cannot exceed 367 calendar days");
    if (classId && !validId(classId)) return invalid(res, "Invalid class ID");
    const year = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("startDate endDate").lean();
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found" });
    const yearStart = new Date(year.startDate); yearStart.setUTCHours(0, 0, 0, 0);
    const yearEnd = new Date(year.endDate); yearEnd.setUTCHours(0, 0, 0, 0);
    if (start < yearStart || end > yearEnd) return invalid(res, "Report dates must fall within the selected academic year");
    let reportTermFilter = {};
    if (academicTermId !== undefined) {
      if (!validId(academicTermId)) return invalid(res, "Invalid academic term ID");
      const term = await AcademicTerm.findOne({ _id: academicTermId, tenantId: req.tenantId, academicYearId }).select("startDate endDate").lean();
      if (!term || start < new Date(term.startDate) || end > new Date(term.endDate)) return invalid(res, "Report dates must fall within the selected academic term");
      reportTermFilter = { academicTermId: term._id };
    }

    let teacherReportClauses = null;
    if (req.auth?.role === "teacher") {
      const assignments = await TeacherAssignment.find({
        tenantId: req.tenantId, teacherId: req.auth.userId, academicYearId, status: "active",
        ...(classId ? { classId } : {}),
      }).select("classId sectionId").lean();
      if (!assignments.length) return res.status(403).json({ success: false, message: "You are not assigned to this class or academic year" });
      teacherReportClauses = assignments.map((item) => ({
        classId: item.classId,
        ...(item.sectionId ? { sectionId: item.sectionId } : {}),
      }));
    }
    const enrollmentFilter = { tenantId: req.tenantId, academicYearId, status: { $in: ["active", "completed", "transferred", "withdrawn"] } };
    if (classId) enrollmentFilter.classId = classId;
    if (teacherReportClauses) enrollmentFilter.$or = teacherReportClauses;
    const enrollments = await Enrollment.find(enrollmentFilter)
      .populate("studentId", "admissionNumber firstName lastName status")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .lean();
    const reportEnrollments = enrollments.filter((item) => Boolean(item.studentId));
    const recordsFilter = {
      tenantId: req.tenantId, academicYearId,
      date: { $gte: start, $lte: end },
      ...reportTermFilter,
      ...(classId ? { classId } : {}),
      ...(teacherReportClauses ? { $or: teacherReportClauses } : {}),
    };
    const records = await Attendance.find(recordsFilter).select("studentId classId sectionId date status").lean();

    const tally = (items) => {
      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      items.forEach((item) => { if (counts[item.status] !== undefined) counts[item.status] += 1; });
      const considered = counts.present + counts.absent + counts.late;
      return { ...counts, marked: items.length, considered, attended: counts.present + counts.late,
        percentage: considered ? Math.round(((counts.present + counts.late) / considered) * 1000) / 10 : null };
    };
    const students = reportEnrollments.map((enrollment) => {
      const studentRecords = records.filter((item) => String(item.studentId) === String(enrollment.studentId._id) && String(item.classId) === String(enrollment.classId?._id) && String(item.sectionId || "") === String(enrollment.sectionId?._id || ""));
      return {
        enrollmentId: enrollment._id,
        enrollmentStatus: enrollment.status,
        studentId: enrollment.studentId._id,
        admissionNumber: enrollment.studentId.admissionNumber,
        name: [enrollment.studentId.firstName, enrollment.studentId.lastName].filter(Boolean).join(" "),
        classId: enrollment.classId?._id,
        className: enrollment.classId?.name || "Unassigned",
        sectionName: enrollment.sectionId?.name || "—",
        ...tally(studentRecords),
      };
    }).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    const classMap = new Map();
    reportEnrollments.forEach((item) => {
      const id = String(item.classId?._id);
      if (!id) return;
      if (!classMap.has(id)) classMap.set(id, { classId: item.classId._id, className: item.classId.name, studentCount: 0 });
      classMap.get(id).studentCount += 1;
    });
    const monthlyMap = new Map();
    records.forEach((record) => {
      const month = record.date.toISOString().slice(0, 7);
      const key = String(record.classId) + ":" + month;
      if (!monthlyMap.has(key)) {
        const classInfo = classMap.get(String(record.classId));
        monthlyMap.set(key, { classId: record.classId, className: classInfo?.className || "Class", month, records: [] });
      }
      monthlyMap.get(key).records.push(record);
    });
    const monthly = [...monthlyMap.values()].map((item) => ({
      classId: item.classId, className: item.className, month: item.month, ...tally(item.records),
    })).sort((a, b) => a.month.localeCompare(b.month) || a.className.localeCompare(b.className));
    const overall = tally(records);
    return res.status(200).json({ success: true, range: { from, to }, summary: {
      students: reportEnrollments.length, ...overall,
      classes: classMap.size,
    }, students, monthly });
  } catch (error) { return next(error); }
};
