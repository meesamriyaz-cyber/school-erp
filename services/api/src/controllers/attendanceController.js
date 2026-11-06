import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Enrollment from "../models/Enrollment.js";
import AcademicYear from "../models/AcademicYear.js";

const STATUSES = ["present", "absent", "late", "excused"];
const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const parseDay = (value) => {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

export const getAttendanceRoster = async (req, res, next) => {
  try {
    const { date, academicYearId, classId, sectionId } = req.query;
    const day = parseDay(date);
    if (!day) return invalid(res, "Provide a valid attendance date in YYYY-MM-DD format");
    if (!validId(academicYearId) || !validId(classId)) return invalid(res, "Academic year and class are required");
    if (sectionId !== undefined && sectionId !== "none" && !validId(sectionId)) return invalid(res, "Invalid section ID");

    const year = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("startDate endDate status").lean();
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found" });
    if (day < new Date(year.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(year.endDate).setUTCHours(0, 0, 0, 0)) {
      return invalid(res, "Attendance date must fall within the selected academic year");
    }

    const enrollmentFilter = { tenantId: req.tenantId, academicYearId, classId, status: "active" };
    if (sectionId === "none") enrollmentFilter.sectionId = null;
    else if (sectionId) enrollmentFilter.sectionId = sectionId;
    const enrollments = await Enrollment.find(enrollmentFilter)
      .populate("studentId", "admissionNumber firstName lastName status")
      .populate("sectionId", "name")
      .sort({ "studentId.firstName": 1, "studentId.lastName": 1 })
      .lean();
    const records = await Attendance.find({ tenantId: req.tenantId, academicYearId, classId, date: day }).lean();
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
  try {
    const { date, academicYearId, classId, sectionId, records } = req.body || {};
    const day = parseDay(date);
    if (!day) return invalid(res, "Provide a valid attendance date in YYYY-MM-DD format");
    if (!validId(academicYearId) || !validId(classId)) return invalid(res, "Academic year and class are required");
    if (sectionId !== undefined && sectionId !== null && !validId(sectionId)) return invalid(res, "Invalid section ID");
    if (!Array.isArray(records) || records.length < 1 || records.length > 500) return invalid(res, "Provide between 1 and 500 attendance records");
    if (Object.hasOwn(req.body, "tenantId") || records.some((item) => !item || Object.hasOwn(item, "tenantId"))) {
      return invalid(res, "School assignment is determined by the authenticated account");
    }

    const year = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId, status: "active" }).select("startDate endDate").lean();
    if (!year) return res.status(409).json({ success: false, message: "Attendance can only be recorded for this school's active academic year" });
    if (day < new Date(year.startDate).setUTCHours(0, 0, 0, 0) || day > new Date(year.endDate).setUTCHours(0, 0, 0, 0)) {
      return invalid(res, "Attendance date must fall within the selected academic year");
    }

    const ids = records.map((item) => item.studentId);
    if (ids.some((id) => !validId(id)) || new Set(ids.map(String)).size !== ids.length) return invalid(res, "Student IDs must be valid and unique");
    if (records.some((item) => !STATUSES.includes(item.status) || (item.remarks !== undefined && (typeof item.remarks !== "string" || item.remarks.trim().length > 300)))) {
      return invalid(res, "Each record needs a valid status and remarks of at most 300 characters");
    }

    const enrollmentFilter = {
      tenantId: req.tenantId, academicYearId, classId, status: "active", studentId: { $in: ids },
      ...(sectionId ? { sectionId } : {}),
    };
    if (sectionId === null) enrollmentFilter.sectionId = null;
    const enrollments = await Enrollment.find(enrollmentFilter).select("_id studentId sectionId").lean();
    if (enrollments.length !== records.length) {
      return res.status(400).json({ success: false, message: "Every student must have an active enrollment in the selected class, section, academic year, and school" });
    }
    const enrollmentByStudent = new Map(enrollments.map((item) => [String(item.studentId), item]));
    const operations = records.map((record) => {
      const enrollment = enrollmentByStudent.get(String(record.studentId));
      return { updateOne: {
        filter: { tenantId: req.tenantId, studentId: record.studentId, date: day },
        update: { $set: {
          enrollmentId: enrollment._id, academicYearId, classId, sectionId: enrollment.sectionId || null,
          status: record.status, remarks: record.remarks?.trim() || "", markedBy: req.auth.userId,
        }},
        upsert: true,
      }};
    });
    await Attendance.bulkWrite(operations, { ordered: true });
    const saved = await Attendance.find({ tenantId: req.tenantId, academicYearId, classId, date: day, studentId: { $in: ids } }).lean();
    return res.status(200).json({ success: true, data: saved, savedCount: saved.length });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "Attendance was updated concurrently. Reload the register and try again." });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more attendance records are invalid");
    return next(error);
  }
};
