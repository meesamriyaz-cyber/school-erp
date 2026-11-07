import mongoose from "mongoose";
import FeeStructure from "../models/FeeStructure.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Enrollment from "../models/Enrollment.js";
import Section from "../models/Section.js";

const validId = mongoose.isValidObjectId;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const roles = ["school_admin", "principal"];

export const listFeeStructures = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    for (const key of ["academicYearId", "classId", "status"]) {
      if (req.query[key] !== undefined) {
        if (["academicYearId", "classId"].includes(key) && !validId(req.query[key])) return fail(res, 400, `Invalid ${key}`);
        if (key === "status" && !["active", "inactive"].includes(req.query[key])) return fail(res, 400, "Invalid status");
        filter[key] = req.query[key];
      }
    }
    const data = await FeeStructure.find(filter).populate("academicYearId", "name status").populate("classId", "name").sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createFeeStructure = async (req, res, next) => {
  try {
    const { academicYearId, classId, name, items } = req.body || {};
    if (Object.hasOwn(req.body || {}, "tenantId")) return fail(res, 400, "School assignment is determined by the authenticated account");
    if (!validId(academicYearId) || !validId(classId) || typeof name !== "string" || !name.trim() || !Array.isArray(items) || !items.length) return fail(res, 400, "Academic year, class, name and at least one fee head are required");
    const normalized = [];
    for (const item of items) {
      if (!item || typeof item.name !== "string" || !item.name.trim() || !Number.isFinite(item.amount) || item.amount < 0 || !["one_time", "monthly", "quarterly", "half_yearly", "annually"].includes(item.frequency || "annually")) return fail(res, 400, "Each fee head needs a name, non-negative amount and valid frequency");
      normalized.push({ name: item.name.trim(), amount: Math.round(item.amount * 100) / 100, frequency: item.frequency || "annually" });
    }
    const [year, schoolClass] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId, status: "active" }).select("_id").lean(),
      SchoolClass.findOne({ _id: classId, tenantId: req.tenantId, academicYearId, status: "active" }).select("_id").lean(),
    ]);
    if (!year) return fail(res, 400, "Select this school's active academic year");
    if (!schoolClass) return fail(res, 400, "Active class was not found in the selected academic year");
    const data = await FeeStructure.create({ tenantId: req.tenantId, academicYearId, classId, name: name.trim(), items: normalized });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "A fee structure with this name already exists for the class and year");
    if (error.name === "ValidationError" || error.name === "CastError") return fail(res, 400, "Fee structure details are invalid");
    return next(error);
  }
};

export const updateFeeStructureStatus = async (req, res, next) => {
  try {
    if (!validId(req.params.structureId) || !["active", "inactive"].includes(req.body?.status)) return fail(res, 400, "A valid structure and status are required");
    const data = await FeeStructure.findOneAndUpdate({ _id: req.params.structureId, tenantId: req.tenantId }, { $set: { status: req.body.status } }, { new: true, runValidators: true });
    if (!data) return fail(res, 404, "Fee structure not found");
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
};

export const listFeeInvoices = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    for (const key of ["academicYearId", "studentId", "enrollmentId", "status"]) {
      if (req.query[key] !== undefined) {
        if (["academicYearId", "studentId", "enrollmentId"].includes(key) && !validId(req.query[key])) return fail(res, 400, `Invalid ${key}`);
        if (key === "status" && !["unpaid", "partial", "paid"].includes(req.query[key])) return fail(res, 400, "Invalid invoice status");
        filter[key] = req.query[key];
      }
    }
    const data = await FeeInvoice.find(filter).populate("studentId", "admissionNumber firstName lastName").populate("academicYearId", "name").populate("enrollmentId", "classId sectionId").sort({ dueDate: 1, createdAt: -1 }).lean();
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
};

export const listOutstandingFees = async (req, res, next) => {
  try {
    const { academicYearId, classId, sectionId, overdueOnly } = req.query;
    if (academicYearId && !validId(academicYearId)) return fail(res, 400, "Invalid academic year");
    if (classId && !validId(classId)) return fail(res, 400, "Invalid class");
    if (sectionId && !validId(sectionId)) return fail(res, 400, "Invalid section");
    if (overdueOnly !== undefined && !["true", "false"].includes(overdueOnly)) return fail(res, 400, "Invalid overdue filter");
    if (academicYearId && !await AcademicYear.exists({ _id: academicYearId, tenantId: req.tenantId })) return fail(res, 404, "Academic year not found");
    let enrollmentIds;
    if (classId || sectionId) {
      const enrollmentFilter = { tenantId: req.tenantId };
      if (academicYearId) enrollmentFilter.academicYearId = academicYearId;
      if (classId) enrollmentFilter.classId = classId;
      if (sectionId) enrollmentFilter.sectionId = sectionId;
      enrollmentIds = await Enrollment.find(enrollmentFilter).distinct("_id");
    }
    const filter = { tenantId: req.tenantId, status: { $in: ["unpaid", "partial"] } };
    if (academicYearId) filter.academicYearId = academicYearId;
    if (enrollmentIds) filter.enrollmentId = { $in: enrollmentIds };
    const now = new Date();
    if (overdueOnly === "true") filter.dueDate = { $lt: now };
    const data = await FeeInvoice.find(filter)
      .populate("studentId", "admissionNumber firstName lastName")
      .populate("academicYearId", "name")
      .populate({ path: "enrollmentId", select: "classId sectionId", populate: [
        { path: "classId", select: "name" }, { path: "sectionId", select: "name" },
      ] })
      .sort({ dueDate: 1, createdAt: -1 }).lean();
    const summary = data.reduce((result, invoice) => {
      const balance = Math.max(0, Math.round((invoice.totalAmount - invoice.paidAmount) * 100) / 100);
      result.invoiceCount += 1;
      result.totalOutstanding += balance;
      if (new Date(invoice.dueDate) < now) { result.overdueCount += 1; result.overdueAmount += balance; }
      return result;
    }, { invoiceCount: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 });
    summary.totalOutstanding = Math.round(summary.totalOutstanding * 100) / 100;
    summary.overdueAmount = Math.round(summary.overdueAmount * 100) / 100;
    return res.json({ success: true, data, summary });
  } catch (error) { return next(error); }
};

export const createFeeInvoice = async (req, res, next) => {
  try {
    const { enrollmentId, feeStructureId, dueDate, invoiceNumber } = req.body || {};
    if (Object.hasOwn(req.body || {}, "tenantId") || !validId(enrollmentId) || !validId(feeStructureId) || !invoiceNumber || typeof invoiceNumber !== "string" || invoiceNumber.trim().length > 40 || Number.isNaN(new Date(dueDate).getTime())) return fail(res, 400, "Enrollment, fee structure, invoice number and valid due date are required");
    const enrollment = await Enrollment.findOne({ _id: enrollmentId, tenantId: req.tenantId, status: "active" }).lean();
    if (!enrollment) return fail(res, 404, "Active student enrollment was not found");
    const structure = await FeeStructure.findOne({ _id: feeStructureId, tenantId: req.tenantId, academicYearId: enrollment.academicYearId, classId: enrollment.classId, status: "active" }).lean();
    if (!structure) return fail(res, 400, "An active fee structure for this enrollment's class and academic year is required");
    const totalAmount = structure.items.reduce((sum, item) => sum + item.amount, 0);
    const data = await FeeInvoice.create({
      tenantId: req.tenantId, enrollmentId: enrollment._id, studentId: enrollment.studentId,
      academicYearId: enrollment.academicYearId, feeStructureId: structure._id,
      invoiceNumber: invoiceNumber.trim(), items: structure.items.map(({ name, amount, frequency }) => ({ name, amount, frequency })),
      totalAmount: Math.round(totalAmount * 100) / 100, dueDate: new Date(dueDate), status: "unpaid",
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "Invoice number already exists");
    if (error.name === "ValidationError" || error.name === "CastError") return fail(res, 400, "Invoice details are invalid");
    return next(error);
  }
};

export const createBulkFeeInvoices = async (req, res, next) => {
  try {
    const { academicYearId, classId, sectionId, feeStructureId, dueDate, invoiceNumberPrefix } = req.body || {};
    if (Object.hasOwn(req.body || {}, "tenantId") || !validId(academicYearId) || !validId(classId) || !validId(feeStructureId) ||
      (sectionId !== undefined && sectionId !== null && !validId(sectionId)) ||
      typeof invoiceNumberPrefix !== "string" || !/^[A-Za-z0-9-]{1,24}$/.test(invoiceNumberPrefix.trim()) ||
      Number.isNaN(new Date(dueDate).getTime())) {
      return fail(res, 400, "Academic year, class, fee structure, invoice prefix and valid due date are required");
    }

    const [year, schoolClass, structure] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("_id").lean(),
      SchoolClass.findOne({ _id: classId, tenantId: req.tenantId, academicYearId }).select("_id").lean(),
      FeeStructure.findOne({ _id: feeStructureId, tenantId: req.tenantId, academicYearId, classId, status: "active" }).lean(),
    ]);
    if (!year || !schoolClass) return fail(res, 404, "Class or academic year was not found in this school");
    if (!structure) return fail(res, 400, "Select an active fee structure for the chosen class and academic year");
    if (sectionId) {
      const section = await Section.findOne({
        _id: sectionId, tenantId: req.tenantId, classId, status: "active",
      }).select("_id").lean();
      if (!section) return fail(res, 400, "Select an active section belonging to the chosen class");
    }

    const enrollmentFilter = { tenantId: req.tenantId, academicYearId, classId, status: "active" };
    if (sectionId) enrollmentFilter.sectionId = sectionId;
    const enrollments = await Enrollment.find(enrollmentFilter)
      .populate("studentId", "admissionNumber firstName lastName")
      .sort({ "studentId.admissionNumber": 1, _id: 1 }).lean();
    if (!enrollments.length) return fail(res, 404, "No active student enrollments were found for this class selection");

    const normalizedDueDate = new Date(dueDate);
    normalizedDueDate.setUTCHours(0, 0, 0, 0);
    const totalAmount = Math.round(structure.items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const results = [];
    for (const enrollment of enrollments) {
      const student = enrollment.studentId;
      if (!student?._id || !student.admissionNumber) {
        results.push({ enrollmentId: String(enrollment._id), status: "skipped", reason: "Student admission number is missing" });
        continue;
      }
      const existing = await FeeInvoice.findOne({
        tenantId: req.tenantId, enrollmentId: enrollment._id, feeStructureId: structure._id, dueDate: normalizedDueDate,
      }).select("_id invoiceNumber").lean();
      if (existing) {
        results.push({ enrollmentId: String(enrollment._id), studentName: [student.firstName, student.lastName].filter(Boolean).join(" "), admissionNumber: student.admissionNumber, status: "skipped", reason: `Already invoiced as ${existing.invoiceNumber}` });
        continue;
      }
      const admissionSuffix = String(student.admissionNumber).replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
      const invoiceNumber = `${invoiceNumberPrefix.trim()}-${admissionSuffix}`.slice(0, 40);
      try {
        const [created] = await FeeInvoice.create([{
          tenantId: req.tenantId, enrollmentId: enrollment._id, studentId: student._id,
          academicYearId, feeStructureId: structure._id, invoiceNumber,
          items: structure.items.map(({ name, amount, frequency }) => ({ name, amount, frequency })),
          totalAmount, dueDate: normalizedDueDate, status: "unpaid",
        }]);
        results.push({ enrollmentId: String(enrollment._id), invoiceId: String(created._id), invoiceNumber, studentName: [student.firstName, student.lastName].filter(Boolean).join(" "), admissionNumber: student.admissionNumber, status: "created" });
      } catch (error) {
        if (error.code === 11000) results.push({ enrollmentId: String(enrollment._id), studentName: [student.firstName, student.lastName].filter(Boolean).join(" "), admissionNumber: student.admissionNumber, status: "skipped", reason: "Invoice number already exists" });
        else throw error;
      }
    }
    const created = results.filter((item) => item.status === "created").length;
    return res.status(201).json({ success: true, data: { totalEligible: enrollments.length, created, skipped: results.length - created, results } });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return fail(res, 400, "Bulk invoice details are invalid");
    return next(error);
  }
};

export const listInvoicePayments = async (req, res, next) => {
  try {
    if (!validId(req.params.invoiceId)) return fail(res, 400, "Invalid invoice ID");
    const invoice = await FeeInvoice.findOne({ _id: req.params.invoiceId, tenantId: req.tenantId }).select("_id").lean();
    if (!invoice) return fail(res, 404, "Invoice not found");
    const data = await FeePayment.find({ tenantId: req.tenantId, invoiceId: invoice._id }).populate("receivedBy", "firstName lastName").populate("reversedBy", "firstName lastName").sort({ paymentDate: -1 }).lean();
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
};

export const recordFeePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { amount, method, paymentDate, reference = "", notes = "" } = req.body || {};
    if (Object.hasOwn(req.body || {}, "tenantId") || !Number.isFinite(amount) || amount <= 0 || !["cash", "bank_transfer", "cheque", "upi", "card", "other"].includes(method) || (paymentDate && Number.isNaN(new Date(paymentDate).getTime())) || typeof reference !== "string" || reference.length > 100 || typeof notes !== "string" || notes.length > 300) return fail(res, 400, "Enter a valid amount, payment method and optional payment details");
    let payment;
    let failure;
    await session.withTransaction(async () => {
      const invoice = await FeeInvoice.findOne({ _id: req.params.invoiceId, tenantId: req.tenantId }).session(session);
      if (!invoice) { failure = [404, "Invoice not found"]; return; }
      const rounded = Math.round(amount * 100) / 100;
      if (rounded > invoice.totalAmount - invoice.paidAmount + 0.0001) { failure = [400, "Payment exceeds the outstanding invoice balance"]; return; }
      const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const [created] = await FeePayment.create([{
        tenantId: req.tenantId, invoiceId: invoice._id, receiptNumber, amount: rounded,
        method, paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        reference: reference.trim(), notes: notes.trim(), receivedBy: req.auth.userId,
      }], { session });
      invoice.paidAmount = Math.round((invoice.paidAmount + rounded) * 100) / 100;
      invoice.status = invoice.paidAmount >= invoice.totalAmount ? "paid" : "partial";
      await invoice.save({ session });
      payment = created;
    });
    if (failure) return fail(res, failure[0], failure[1]);
    return res.status(201).json({ success: true, data: payment });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return fail(res, 400, "Payment details are invalid");
    return next(error);
  } finally { await session.endSession(); }
};


export const reverseFeePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { reason } = req.body || {};
    if (!validId(req.params.invoiceId) || !validId(req.params.paymentId) ||
      typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 300 ||
      Object.hasOwn(req.body || {}, "tenantId")) {
      return fail(res, 400, "A valid invoice, payment and reversal reason (5–300 characters) are required");
    }
    let failure;
    let reversed;
    await session.withTransaction(async () => {
      const invoice = await FeeInvoice.findOne({ _id: req.params.invoiceId, tenantId: req.tenantId }).session(session);
      if (!invoice) { failure = [404, "Invoice not found"]; return; }
      const payment = await FeePayment.findOne({
        _id: req.params.paymentId, invoiceId: invoice._id, tenantId: req.tenantId,
      }).session(session);
      if (!payment) { failure = [404, "Payment not found"]; return; }
      if (payment.status !== "posted") { failure = [409, "Payment has already been reversed"]; return; }
      const remainingPaid = Math.max(0, Math.round((invoice.paidAmount - payment.amount) * 100) / 100);
      invoice.paidAmount = remainingPaid;
      invoice.status = remainingPaid >= invoice.totalAmount ? "paid" : remainingPaid > 0 ? "partial" : "unpaid";
      payment.status = "reversed";
      payment.reversedAt = new Date();
      payment.reversedBy = req.auth.userId;
      payment.reversalReason = reason.trim();
      await Promise.all([invoice.save({ session }), payment.save({ session })]);
      reversed = payment;
    });
    if (failure) return fail(res, failure[0], failure[1]);
    return res.json({ success: true, data: reversed });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return fail(res, 400, "Payment reversal details are invalid");
    return next(error);
  } finally { await session.endSession(); }
};
