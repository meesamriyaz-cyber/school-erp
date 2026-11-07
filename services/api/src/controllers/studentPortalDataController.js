import mongoose from "mongoose";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Enrollment from "../models/Enrollment.js";
import Attendance from "../models/Attendance.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import TimetableEntry from "../models/TimetableEntry.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const studentFields = "_id admissionNumber firstName lastName status";

const loadAuthorizedChildren = async (req) => {
  if (req.auth.role === "student") {
    const student = await Student.findOne({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      status: "active",
    }).select(studentFields).lean();

    if (!student) {
      return { error: [409, "Your student account has not been linked by the school"] };
    }
    return { children: [student] };
  }

  const guardian = await Guardian.findOne({
    tenantId: req.tenantId,
    userId: req.auth.userId,
    status: "active",
  }).select("_id").lean();

  if (!guardian) {
    return { error: [409, "Your parent account has not been linked by the school"] };
  }

  const links = await StudentGuardian.find({
    tenantId: req.tenantId,
    guardianId: guardian._id,
    status: "active",
  }).select("studentId").lean();

  if (!links.length) return { children: [] };

  const children = await Student.find({
    tenantId: req.tenantId,
    _id: { $in: links.map((link) => link.studentId) },
    status: "active",
  }).select(studentFields).sort({ firstName: 1, lastName: 1, _id: 1 }).lean();

  return { children };
};

const selectAuthorizedChildren = async (req, res) => {
  const result = await loadAuthorizedChildren(req);
  if (result.error) {
    res.status(result.error[0]).json({ success: false, message: result.error[1] });
    return null;
  }

  if (req.query.studentId !== undefined) {
    if (!validId(req.query.studentId)) {
      invalid(res, "Invalid studentId");
      return null;
    }
    const selected = result.children.find(
      (student) => String(student._id) === String(req.query.studentId),
    );
    if (!selected) {
      res.status(403).json({
        success: false,
        message: req.auth.role === "student"
          ? "You may only access your own school records"
          : "This student is not linked to your parent account",
      });
      return null;
    }
    return [selected];
  }

  return result.children;
};

const parseDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
};

export const getMyAttendance = async (req, res, next) => {
  try {
    const children = await selectAuthorizedChildren(req, res);
    if (!children) return;
    if (!children.length) return res.status(200).json({ success: true, data: [], summary: { present: 0, absent: 0, late: 0, excused: 0, percentage: null } });

    let from = req.query.from;
    let to = req.query.to;
    if ((from === undefined) !== (to === undefined)) {
      return invalid(res, "Provide both from and to dates in YYYY-MM-DD format");
    }
    if (from === undefined) {
      const end = new Date();
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 365);
      from = start.toISOString().slice(0, 10);
      to = end.toISOString().slice(0, 10);
    }
    const start = parseDay(from);
    const end = parseDay(to);
    if (!start || !end || start > end) return invalid(res, "Provide a valid attendance date range");
    if ((end - start) / 86400000 > 366) return invalid(res, "Attendance date range cannot exceed 367 calendar days");

    const records = await Attendance.find({
      tenantId: req.tenantId,
      studentId: { $in: children.map((student) => student._id) },
      date: { $gte: start, $lte: end },
    }).sort({ date: -1, studentId: 1 }).limit(2000).lean();

    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const record of records) {
      if (Object.hasOwn(counts, record.status)) counts[record.status] += 1;
    }
    const considered = counts.present + counts.absent + counts.late;
    const summary = {
      ...counts,
      marked: records.length,
      considered,
      attended: counts.present + counts.late,
      percentage: considered
        ? Math.round(((counts.present + counts.late) / considered) * 1000) / 10
        : null,
    };
    const childById = new Map(children.map((student) => [String(student._id), student]));
    const data = records.map((record) => ({
      ...record,
      student: childById.get(String(record.studentId)) || null,
    }));

    return res.status(200).json({ success: true, range: { from, to }, data, summary });
  } catch (error) {
    return next(error);
  }
};

export const getMyFees = async (req, res, next) => {
  try {
    const children = await selectAuthorizedChildren(req, res);
    if (!children) return;
    if (!children.length) return res.status(200).json({ success: true, data: [], summary: { invoiceCount: 0, totalAmount: 0, paidAmount: 0, balance: 0 } });

    const invoices = await FeeInvoice.find({
      tenantId: req.tenantId,
      studentId: { $in: children.map((student) => student._id) },
    })
      .populate("academicYearId", "name")
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(500)
      .lean();

    const invoiceIds = invoices.map((invoice) => invoice._id);
    const payments = invoiceIds.length
      ? await FeePayment.find({
          tenantId: req.tenantId,
          invoiceId: { $in: invoiceIds },
        })
          .select("invoiceId receiptNumber amount paymentDate method reference status reversedAt reversalReason")
          .sort({ paymentDate: -1, _id: -1 })
          .lean()
      : [];

    const paymentsByInvoice = new Map();
    for (const payment of payments) {
      const key = String(payment.invoiceId);
      if (!paymentsByInvoice.has(key)) paymentsByInvoice.set(key, []);
      paymentsByInvoice.get(key).push(payment);
    }

    const childById = new Map(children.map((student) => [String(student._id), student]));
    const data = invoices.map((invoice) => ({
      ...invoice,
      student: childById.get(String(invoice.studentId)) || null,
      payments: paymentsByInvoice.get(String(invoice._id)) || [],
      balance: Math.max(0, Math.round((invoice.totalAmount - invoice.paidAmount) * 100) / 100),
    }));
    const summary = data.reduce((result, invoice) => {
      result.invoiceCount += 1;
      result.totalAmount += invoice.totalAmount;
      result.paidAmount += invoice.paidAmount;
      result.balance += invoice.balance;
      return result;
    }, { invoiceCount: 0, totalAmount: 0, paidAmount: 0, balance: 0 });
    for (const key of ["totalAmount", "paidAmount", "balance"]) {
      summary[key] = Math.round(summary[key] * 100) / 100;
    }

    return res.status(200).json({ success: true, data, summary });
  } catch (error) {
    return next(error);
  }
};

export const getMyTimetable = async (req, res, next) => {
  try {
    const children = await selectAuthorizedChildren(req, res);
    if (!children) return;
    if (!children.length) return res.status(200).json({ success: true, data: [] });

    const enrollments = await Enrollment.find({
      tenantId: req.tenantId,
      studentId: { $in: children.map((student) => student._id) },
      status: "active",
    })
      .populate("academicYearId", "name")
      .populate("classId", "name")
      .populate("sectionId", "name")
      .lean();

    const childById = new Map(children.map((student) => [String(student._id), student]));
    const data = [];
    for (const enrollment of enrollments) {
      const assignments = await TeacherAssignment.find({
        tenantId: req.tenantId,
        academicYearId: enrollment.academicYearId?._id || enrollment.academicYearId,
        classId: enrollment.classId?._id || enrollment.classId,
        status: "active",
        ...(enrollment.sectionId
          ? { $or: [{ sectionId: null }, { sectionId: enrollment.sectionId._id || enrollment.sectionId }] }
          : { sectionId: null }),
      }).select("_id").lean();

      const assignmentIds = assignments.map((assignment) => assignment._id);
      const entries = assignmentIds.length
        ? await TimetableEntry.find({
            tenantId: req.tenantId,
            academicYearId: enrollment.academicYearId?._id || enrollment.academicYearId,
            classId: enrollment.classId?._id || enrollment.classId,
            ...(enrollment.sectionId
              ? { $or: [{ sectionId: null }, { sectionId: enrollment.sectionId._id || enrollment.sectionId }] }
              : { sectionId: null }),
            assignmentId: { $in: assignmentIds },
            status: "active",
          })
            .populate({
              path: "assignmentId",
              populate: [
                { path: "teacherId", select: "firstName lastName" },
                { path: "subjectId", select: "name code" },
              ],
            })
            .sort({ dayOfWeek: 1, periodNumber: 1, startTime: 1 })
            .lean()
        : [];

      data.push({
        student: childById.get(String(enrollment.studentId)) || null,
        enrollment,
        entries,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};
