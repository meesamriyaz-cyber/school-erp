import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import Certificate from "../models/Certificate.js";
import CertificateCounter from "../models/CertificateCounter.js";
import Student from "../models/Student.js";
import Enrollment from "../models/Enrollment.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import EnrollmentTransferAudit from "../models/EnrollmentTransferAudit.js";

const validId = mongoose.isValidObjectId;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const safeText = (value, max = 500) => typeof value === "string" && value.trim().length <= max;

const makeSnapshot = ({ tenant, student, enrollment, year, schoolClass, section, transferReason }) => ({
  school: tenant.name,
  admissionNumber: student.admissionNumber,
  studentName: [student.firstName, student.lastName].filter(Boolean).join(" "),
  dateOfBirth: student.dateOfBirth || null,
  gender: student.gender,
  address: student.address || {},
  admissionDate: student.admissionDate || null,
  academicYear: year.name,
  className: schoolClass.name,
  sectionName: section?.name || "",
  enrollmentDate: enrollment.enrollmentDate,
  enrollmentEndedAt: enrollment.endedAt || null,
  enrollmentStatus: enrollment.status,
  transferReason: transferReason || "",
});

export const issueCertificate = async (req, res, next) => {
  const { studentId, enrollmentId, type, reason = "", remarks = "", reissuedFrom = null } = req.body || {};
  if (!validId(studentId) || !validId(enrollmentId) || !["bonafide", "transfer"].includes(type) ||
      !safeText(reason) || !safeText(remarks) || (reissuedFrom !== null && !validId(reissuedFrom)) ||
      Object.hasOwn(req.body || {}, "tenantId") || Object.hasOwn(req.body || {}, "certificateNumber") ||
      Object.hasOwn(req.body || {}, "snapshot") || Object.hasOwn(req.body || {}, "issuedBy")) {
    return fail(res, 400, "Provide valid student, enrollment, certificate type and permitted remarks");
  }

  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const student = await Student.findOne({ _id: studentId, tenantId: req.tenantId }).session(session).lean();
      const enrollment = await Enrollment.findOne({ _id: enrollmentId, tenantId: req.tenantId, studentId }).session(session).lean();
      if (!student || !enrollment) { const error = new Error("Student or enrollment not found in this school"); error.statusCode = 404; throw error; }
      if (type === "bonafide" && (student.status !== "active" || enrollment.status !== "active")) {
        const error = new Error("Bonafide certificates require an active student enrollment"); error.statusCode = 409; throw error;
      }
      if (type === "transfer" && !["completed", "transferred", "withdrawn"].includes(enrollment.status)) {
        const error = new Error("Transfer certificates require a completed, transferred or withdrawn enrollment"); error.statusCode = 409; throw error;
      }
      if (type === "transfer" && (!reason.trim() || !enrollment.endedAt)) {
        const error = new Error("A transfer reason and recorded enrollment end date are required"); error.statusCode = 400; throw error;
      }
      const [year, schoolClass, section, previous] = await Promise.all([
        AcademicYear.findOne({ _id: enrollment.academicYearId, tenantId: req.tenantId }).session(session).lean(),
        SchoolClass.findOne({ _id: enrollment.classId, tenantId: req.tenantId }).session(session).lean(),
        enrollment.sectionId ? Section.findOne({ _id: enrollment.sectionId, tenantId: req.tenantId, classId: enrollment.classId }).session(session).lean() : Promise.resolve(null),
        reissuedFrom ? Certificate.findOne({ _id: reissuedFrom, tenantId: req.tenantId, studentId, status: "issued" }).session(session).lean() : Promise.resolve(null),
      ]);
      if (!year || !schoolClass || (enrollment.sectionId && !section)) { const error = new Error("Enrollment academic placement is incomplete or unavailable"); error.statusCode = 409; throw error; }
      if (reissuedFrom && (!previous || previous.type !== type)) { const error = new Error("The original issued certificate for this student and type was not found"); error.statusCode = 404; throw error; }
      const transferAudit = type === "transfer" ? await EnrollmentTransferAudit.findOne({
        tenantId: req.tenantId, studentId, fromEnrollmentId: enrollmentId,
      }).session(session).lean() : null;
      const now = new Date();
      const counter = await CertificateCounter.findOneAndUpdate(
        { tenantId: req.tenantId, year: now.getUTCFullYear(), type },
        { $inc: { sequence: 1 }, $setOnInsert: { tenantId: req.tenantId, year: now.getUTCFullYear(), type } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      );
      const prefix = type === "bonafide" ? "BON" : "TC";
      const certificateNumber = `${prefix}/${now.getUTCFullYear()}/${String(counter.sequence).padStart(5, "0")}`;
      [created] = await Certificate.create([{
        tenantId: req.tenantId, studentId, enrollmentId, academicYearId: year._id, type,
        certificateNumber, verificationCode: randomBytes(18).toString("hex"),
        issuedAt: now, issuedBy: req.auth.userId, reason: reason.trim(), remarks: remarks.trim(),
        snapshot: makeSnapshot({ tenant: req.tenant, student, enrollment, year, schoolClass, section, transferReason: transferAudit?.reason || reason.trim() }),
        reissuedFrom: previous?._id || null,
      }], { session });
    });
    const data = await Certificate.findOne({ _id: created._id, tenantId: req.tenantId })
      .select("+verificationCode").populate("issuedBy", "firstName lastName").lean();
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return fail(res, error.statusCode, error.message);
    if (error.code === 11000) return fail(res, 409, "Certificate numbering conflict; retry the issuance");
    if (error.name === "ValidationError" || error.name === "CastError") return fail(res, 400, "Certificate details are invalid");
    return next(error);
  } finally { await session.endSession(); }
};

export const listCertificates = async (req, res, next) => {
  try {
    const { studentId, type, status, page = "1", limit = "20" } = req.query;
    const pageNumber = Number(page), pageSize = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return fail(res, 400, "Invalid pagination");
    if (studentId && !validId(studentId)) return fail(res, 400, "Invalid student ID");
    if (type && !["bonafide", "transfer"].includes(type)) return fail(res, 400, "Invalid certificate type");
    if (status && !["issued", "void"].includes(status)) return fail(res, 400, "Invalid certificate status");
    const filter = { tenantId: req.tenantId, ...(studentId ? { studentId } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}) };
    const [data, total] = await Promise.all([
      Certificate.find(filter).select("-verificationCode").populate("studentId", "admissionNumber firstName lastName")
        .populate("issuedBy", "firstName lastName").sort({ issuedAt: -1, _id: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize).lean(),
      Certificate.countDocuments(filter),
    ]);
    return res.json({ success: true, data, pagination: { page: pageNumber, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) { return next(error); }
};

export const voidCertificate = async (req, res, next) => {
  try {
    if (!validId(req.params.certificateId) || typeof req.body?.reason !== "string" || !req.body.reason.trim() || req.body.reason.trim().length > 500) return fail(res, 400, "A valid certificate and void reason (maximum 500 characters) are required");
    const data = await Certificate.findOneAndUpdate(
      { _id: req.params.certificateId, tenantId: req.tenantId, status: "issued" },
      { $set: { status: "void", voidedAt: new Date(), voidedBy: req.auth.userId, voidReason: req.body.reason.trim() } },
      { new: true, runValidators: true },
    ).select("-verificationCode").lean();
    if (!data) return fail(res, 404, "Issued certificate not found");
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
};

export const verifyCertificate = async (req, res, next) => {
  try {
    const code = req.params.code;
    if (typeof code !== "string" || !/^[a-f0-9]{36}$/.test(code)) return fail(res, 400, "Invalid verification code");
    const certificate = await Certificate.findOne({ verificationCode: code }).select("certificateNumber type issuedAt status snapshot.school snapshot.studentName snapshot.admissionNumber").lean();
    if (!certificate) return fail(res, 404, "Certificate not found");
    return res.json({ success: true, data: {
      certificateNumber: certificate.certificateNumber, type: certificate.type,
      issuedAt: certificate.issuedAt, status: certificate.status,
      school: certificate.snapshot.school, studentName: certificate.snapshot.studentName,
      admissionNumber: certificate.snapshot.admissionNumber,
    } });
  } catch (error) { return next(error); }
};
