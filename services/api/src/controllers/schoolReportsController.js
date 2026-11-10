import mongoose from "mongoose";
import Student from "../models/Student.js";
import Enrollment from "../models/Enrollment.js";
import AcademicYear from "../models/AcademicYear.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Examination from "../models/Examination.js";
import { loadResultContext } from "./examResultController.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import Attendance from "../models/Attendance.js";
import Staff from "../models/Staff.js";
import { teacherCanAccessEnrollment } from "../utils/teacherAssignmentScope.js";

const validId = mongoose.isValidObjectId;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};
export const getStudentAcademicHistory = async (req, res, next) => {
  try {
    const { studentId } = req.query;
    if (!validId(studentId)) return fail(res, 400, "A valid student ID is required");
    const student = await Student.findOne({ _id: studentId, tenantId: req.tenantId })
      .select("admissionNumber firstName lastName status").lean();
    if (!student) return fail(res, 404, "Student not found");
    const enrollments = await Enrollment.find({ tenantId: req.tenantId, studentId })
      .populate("academicYearId", "name startDate endDate")
      .populate("classId", "name").populate("sectionId", "name")
      .sort({ enrollmentDate: 1, _id: 1 }).lean();
    if (req.auth.role === "teacher") {
      const allowed = [];
      for (const enrollment of enrollments) if (await teacherCanAccessEnrollment(req, enrollment)) allowed.push(enrollment);
      if (!allowed.length) return fail(res, 404, "Student not found");
      if (allowed.length !== enrollments.length) return fail(res, 403, "You can only view academic history within your teaching assignments");
    }
    const exams = await Examination.find({ tenantId: req.tenantId, status: "published", academicYearId: { $in: enrollments.map((item) => item.academicYearId?._id).filter(Boolean) } })
      .sort({ startDate: 1 }).lean();
    const academicResults = [];
    for (const exam of exams) {
      const matchingEnrollments = enrollments.filter((item) =>
        String(item.academicYearId?._id) === String(exam.academicYearId) &&
        String(item.classId?._id) === String(exam.classId) &&
        (!exam.sectionId || String(item.sectionId?._id || "") === String(exam.sectionId))
      );
      if (!matchingEnrollments.length) continue;
      const context = await loadResultContext(req.tenantId, exam, { includeHistoricalEnrollments: true });
      for (const enrollment of matchingEnrollments) {
        const result = context.results.find((item) => String(item.enrollmentId) === String(enrollment._id));
        if (result) academicResults.push({
          examinationId: exam._id, examinationName: exam.name, academicYearId: exam.academicYearId,
          enrollmentId: enrollment._id, startDate: exam.startDate, result,
        });
      }
    }
    const enrollmentHistory = enrollments.map((item) => ({
      _id: item._id, academicYearId: item.academicYearId, classId: item.classId, sectionId: item.sectionId,
      enrollmentDate: item.enrollmentDate, admissionType: item.admissionType, status: item.status, endedAt: item.endedAt,
    }));
    return res.json({ success: true, data: { student, enrollments: enrollmentHistory, academicResults } });
  } catch (error) { return next(error); }
};

export const getEnrollmentStrengthReport = async (req, res, next) => {
  try {
    const { academicYearId, classId } = req.query;
    if (academicYearId && !validId(academicYearId)) return fail(res, 400, "Invalid academic year ID");
    if (classId && !validId(classId)) return fail(res, 400, "Invalid class ID");
    if (academicYearId && !await AcademicYear.exists({ _id: academicYearId, tenantId: req.tenantId })) return fail(res, 404, "Academic year not found");
    const filter = { tenantId: req.tenantId, ...(academicYearId ? { academicYearId } : {}), ...(classId ? { classId } : {}) };
    if (req.auth.role === "teacher") {
      const assignments = await TeacherAssignment.find({ ...filter, teacherId: req.auth.userId, status: "active" }).select("academicYearId classId sectionId").lean();
      if (!assignments.length) return res.json({ success: true, data: [], summary: { totalStudents: 0, classes: 0 } });
      filter.$or = assignments.map((item) => ({ academicYearId: item.academicYearId, classId: item.classId, ...(item.sectionId ? { sectionId: item.sectionId } : {}) }));
    }
    const enrollments = await Enrollment.find(filter).populate("academicYearId", "name")
      .populate("classId", "name").populate("sectionId", "name")
      .populate("studentId", "status").lean();
    const grouped = new Map();
    for (const item of enrollments) {
      const key = [item.academicYearId?._id, item.classId?._id, item.sectionId?._id || "none"].join(":");
      if (!grouped.has(key)) grouped.set(key, {
        academicYear: item.academicYearId?.name || "", className: item.classId?.name || "",
        sectionName: item.sectionId?.name || "—", active: 0, completed: 0, transferred: 0, withdrawn: 0,
      });
      if (item.studentId?.status === "active") grouped.get(key)[item.status] += 1;
    }
    const data = [...grouped.values()];
    return res.json({ success: true, data, summary: { totalStudents: data.reduce((sum, item) => sum + item.active + item.completed + item.transferred + item.withdrawn, 0), classes: data.length } });
  } catch (error) { return next(error); }
};

export const getFeeCollectionReport = async (req, res, next) => {
  try {
    const { academicYearId, classId, sectionId, from, to } = req.query;
    if (academicYearId && !validId(academicYearId)) return fail(res, 400, "Invalid academic year ID");
    if (classId && !validId(classId)) return fail(res, 400, "Invalid class ID");
    if (sectionId && !validId(sectionId)) return fail(res, 400, "Invalid section ID");
    const start = from ? parseDate(from) : null, end = to ? parseDate(to) : null;
    if ((from && !start) || (to && !end) || (start && end && start > end)) return fail(res, 400, "Invalid report date range");
    if (start && end && (end - start) / 86400000 > 366) return fail(res, 400, "Report date range cannot exceed 367 days");
    if (academicYearId && !await AcademicYear.exists({ _id: academicYearId, tenantId: req.tenantId })) return fail(res, 404, "Academic year not found");
    let enrollmentIds = null;
    if (classId || sectionId || req.auth.role === "teacher") {
      const enrollmentFilter = { tenantId: req.tenantId, ...(academicYearId ? { academicYearId } : {}), ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) };
      if (req.auth.role === "teacher") {
        const assignments = await TeacherAssignment.find({ tenantId: req.tenantId, teacherId: req.auth.userId, status: "active", ...(academicYearId ? { academicYearId } : {}), ...(classId ? { classId } : {}) }).select("academicYearId classId sectionId").lean();
        if (!assignments.length) return res.json({ success: true, data: [], summary: { invoiced: 0, paid: 0, outstanding: 0, postedPayments: 0, reversedPayments: 0 } });
        enrollmentFilter.$or = assignments.map((item) => ({ academicYearId: item.academicYearId, classId: item.classId, ...(item.sectionId ? { sectionId: item.sectionId } : {}) }));
      }
      enrollmentIds = await Enrollment.find(enrollmentFilter).distinct("_id");
    }
    const invoiceFilter = { tenantId: req.tenantId, ...(academicYearId ? { academicYearId } : {}), ...(enrollmentIds ? { enrollmentId: { $in: enrollmentIds } } : {}) };
    const invoices = await FeeInvoice.find(invoiceFilter).populate("studentId", "admissionNumber firstName lastName")
      .populate("academicYearId", "name").populate({ path: "enrollmentId", select: "classId sectionId", populate: [{ path: "classId", select: "name" }, { path: "sectionId", select: "name" }] }).lean();
    const invoiceIds = invoices.map((item) => item._id);
    const paymentFilter = { tenantId: req.tenantId, invoiceId: { $in: invoiceIds }, ...(start || end ? { paymentDate: { ...(start ? { $gte: start } : {}), ...(end ? { $lte: new Date(end.getTime() + 86400000 - 1) } : {}) } } : {}) };
    const payments = invoiceIds.length ? await FeePayment.find(paymentFilter).lean() : [];
    const byInvoice = new Map();
    for (const payment of payments) {
      const entry = byInvoice.get(String(payment.invoiceId)) || { posted: 0, reversed: 0, postedCount: 0, reversedCount: 0 };
      if (payment.status === "posted") { entry.posted += payment.amount; entry.postedCount += 1; }
      else { entry.reversed += payment.amount; entry.reversedCount += 1; }
      byInvoice.set(String(payment.invoiceId), entry);
    }
    const data = invoices.map((invoice) => ({ ...invoice, paymentSummary: byInvoice.get(String(invoice._id)) || { posted: 0, reversed: 0, postedCount: 0, reversedCount: 0 } }));
    const summary = data.reduce((total, invoice) => {
      total.invoiced += invoice.totalAmount;
      total.outstanding += Math.max(0, invoice.totalAmount - invoice.paidAmount);
      total.postedPayments += invoice.paymentSummary.posted;
      total.reversedPayments += invoice.paymentSummary.reversed;
      total.postedPaymentsCount += invoice.paymentSummary.postedCount;
      total.reversedPaymentsCount += invoice.paymentSummary.reversedCount;
      return total;
    }, { invoiced: 0, outstanding: 0, postedPayments: 0, reversedPayments: 0, postedPaymentsCount: 0, reversedPaymentsCount: 0 });
    for (const key of ["invoiced", "outstanding", "postedPayments", "reversedPayments"]) summary[key] = Math.round(summary[key] * 100) / 100;
    summary.netPayments = Math.round((summary.postedPayments - summary.reversedPayments) * 100) / 100;
    return res.json({ success: true, data, summary });
  } catch (error) { return next(error); }
};

import mongoose from "mongoose";
import Student from "../models/Student.js";
import Enrollment from "../models/Enrollment.js";
import AcademicYear from "../models/AcademicYear.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Examination from "../models/Examination.js";
import Attendance from "../models/Attendance.js";
import Staff from "../models/Staff.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import { loadResultContext } from "./examResultController.js";

const validId = mongoose.isValidObjectId;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

export const getDashboardOverview = async (req, res, next) => {
  try {
    const { academicYearId } = req.query;
    if (academicYearId !== undefined && !validId(academicYearId)) {
      return fail(res, 400, "Invalid academic year ID");
    }

    const academicYear = academicYearId
      ? await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("_id name startDate endDate status").lean()
      : await AcademicYear.findOne({ tenantId: req.tenantId, status: "active" }).sort({ startDate: -1, _id: -1 }).select("_id name startDate endDate status").lean();

    if (academicYearId && !academicYear) return fail(res, 404, "Academic year not found");

    const tenantId = req.tenantId;
    const yearId = academicYear?._id;
    const today = new Date();
    const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
    const trendStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));

    const [
      activeStudents,
      totalStudents,
      activeStaff,
      teachingStaff,
      nonTeachingStaff,
      enrollmentCounts,
      todayAttendance,
      attendanceTrend,
      invoiceIds,
      publishedExamCount,
      latestPublishedExam,
    ] = await Promise.all([
      Student.countDocuments({ tenantId, status: "active" }),
      Student.countDocuments({ tenantId }),
      Staff.countDocuments({ tenantId, employmentStatus: "active" }),
      Staff.countDocuments({ tenantId, employeeType: "teaching", employmentStatus: "active" }),
      Staff.countDocuments({ tenantId, employeeType: "non_teaching", employmentStatus: "active" }),
      yearId ? Enrollment.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), academicYearId: new mongoose.Types.ObjectId(String(yearId)) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]) : Promise.resolve([]),
      yearId ? Attendance.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), academicYearId: new mongoose.Types.ObjectId(String(yearId)), date: { $gte: dayStart, $lte: dayEnd } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]) : Promise.resolve([]),
      yearId ? Attendance.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), academicYearId: new mongoose.Types.ObjectId(String(yearId)), date: { $gte: trendStart, $lte: dayEnd } } },
        { $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$date", timezone: "UTC" } },
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ["$status", "excused"] }, 1, 0] } },
          marked: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]) : Promise.resolve([]),
      yearId ? FeeInvoice.find({ tenantId, academicYearId: yearId }).distinct("_id") : Promise.resolve([]),
      yearId ? Examination.countDocuments({ tenantId, academicYearId: yearId, status: "published" }) : Promise.resolve(0),
      yearId ? Examination.findOne({ tenantId, academicYearId: yearId, status: "published" }).sort({ startDate: -1, _id: -1 }).lean() : Promise.resolve(null),
    ]);

    const enrollmentSummary = { active: 0, completed: 0, transferred: 0, withdrawn: 0, total: 0 };
    for (const item of enrollmentCounts) {
      if (Object.hasOwn(enrollmentSummary, item._id)) enrollmentSummary[item._id] = item.count;
      enrollmentSummary.total += item.count;
    }

    const attendanceSummary = { present: 0, absent: 0, late: 0, excused: 0, marked: 0, attended: 0, percentage: null };
    for (const item of todayAttendance) {
      if (Object.hasOwn(attendanceSummary, item._id)) attendanceSummary[item._id] = item.count;
      attendanceSummary.marked += item.count;
    }
    attendanceSummary.attended = attendanceSummary.present + attendanceSummary.late;
    const consideredAttendance = attendanceSummary.attended + attendanceSummary.absent;
    attendanceSummary.percentage = consideredAttendance
      ? Math.round((attendanceSummary.attended / consideredAttendance) * 1000) / 10
      : null;

    const payments = invoiceIds.length ? await FeePayment.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), invoiceId: { $in: invoiceIds } } },
      { $group: {
        _id: "$status",
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      } },
    ]) : [];
    const feeSummary = { posted: 0, reversed: 0, net: 0, postedCount: 0, reversedCount: 0, outstanding: 0 };
    for (const payment of payments) {
      if (payment._id === "posted") {
        feeSummary.posted = payment.amount;
        feeSummary.postedCount = payment.count;
      } else if (payment._id === "reversed") {
        feeSummary.reversed = payment.amount;
        feeSummary.reversedCount = payment.count;
      }
    }
    feeSummary.net = Math.round((feeSummary.posted - feeSummary.reversed) * 100) / 100;
    feeSummary.posted = Math.round(feeSummary.posted * 100) / 100;
    feeSummary.reversed = Math.round(feeSummary.reversed * 100) / 100;

    const [invoiceTotals, resultContext] = await Promise.all([
      yearId ? FeeInvoice.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), academicYearId: new mongoose.Types.ObjectId(String(yearId)) } },
        { $group: { _id: null, outstanding: { $sum: { $max: [0, { $subtract: ["$totalAmount", "$paidAmount"] }] } } } },
      ]) : Promise.resolve([]),
      latestPublishedExam ? loadResultContext(tenantId, latestPublishedExam) : Promise.resolve(null),
    ]);
    feeSummary.outstanding = Math.round((invoiceTotals[0]?.outstanding || 0) * 100) / 100;

    const latestResult = resultContext ? {
      examinationId: latestPublishedExam._id,
      name: latestPublishedExam.name,
      averagePercentage: resultContext.averagePercentage,
      passed: resultContext.passedCount,
      failed: resultContext.failedCount,
      students: resultContext.enrollments.length,
      passRate: resultContext.enrollments.length
        ? Math.round((resultContext.passedCount / resultContext.enrollments.length) * 1000) / 10
        : null,
    } : null;

    return res.status(200).json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        academicYear: academicYear ? { id: academicYear._id, name: academicYear.name, status: academicYear.status } : null,
        students: { total: totalStudents, active: activeStudents },
        enrollments: enrollmentSummary,
        staff: { totalActive: activeStaff, teaching: teachingStaff, nonTeaching: nonTeachingStaff },
        attendance: {
          date: dayStart.toISOString().slice(0, 10),
          today: attendanceSummary,
          trend: attendanceTrend.map((item) => ({
            month: item._id, present: item.present, late: item.late,
            absent: item.absent, excused: item.excused, marked: item.marked,
          })),
        },
        fees: feeSummary,
        examinations: { published: publishedExamCount, latestResult },
      },
    });
  } catch (error) {
    return next(error);
  }
};
