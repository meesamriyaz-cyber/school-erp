import mongoose from "mongoose";
import Student from "../models/Student.js";
import Enrollment from "../models/Enrollment.js";
import AcademicYear from "../models/AcademicYear.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Examination from "../models/Examination.js";
import { loadResultContext } from "./examResultController.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
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
