import mongoose from "mongoose";
import Enrollment from "../models/Enrollment.js";
import EnrollmentTransferAudit from "../models/EnrollmentTransferAudit.js";
import Student from "../models/Student.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";

const validId = (value) => mongoose.isValidObjectId(value);
const dayStart = (value) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const withinYear = (date, year) => dayStart(date) >= dayStart(year.startDate) && dayStart(date) <= dayStart(year.endDate);
const invalid = (res, message) => res.status(400).json({ success: false, message });

export const transferEnrollment = async (req, res, next) => {
  if (!validId(req.params.enrollmentId)) return invalid(res, "Invalid enrollment ID");
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some((key) => !["targetClassId", "targetSectionId", "reason"].includes(key)) ||
    !validId(body.targetClassId) ||
    (body.targetSectionId !== undefined && body.targetSectionId !== null && body.targetSectionId !== "" && !validId(body.targetSectionId)) ||
    typeof body.reason !== "string" || !body.reason.trim() || body.reason.trim().length > 500) {
    return invalid(res, "Provide a valid target class, optional target section, and transfer reason (maximum 500 characters)");
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const source = await Enrollment.findOne({
        _id: req.params.enrollmentId, tenantId: req.tenantId, status: "active",
      }).session(session);
      if (!source) {
        const error = new Error("Only an active enrollment can be transferred within the school");
        error.code = "SOURCE_ENROLLMENT_NOT_ACTIVE";
        throw error;
      }
      const [student, year] = await Promise.all([
        Student.findOne({ _id: source.studentId, tenantId: req.tenantId, status: "active" }).select("_id").session(session).lean(),
        AcademicYear.findOneAndUpdate(
          { _id: source.academicYearId, tenantId: req.tenantId, status: "active" },
          { $inc: { lifecycleRevision: 1 } }, { new: true, session }
        ).select("_id startDate endDate status").lean(),
      ]);
      if (!student) { const error = new Error("The student is not active in this school"); error.code = "STUDENT_NOT_ACTIVE"; throw error; }
      if (!year) { const error = new Error("Within-school transfers require the active academic year"); error.code = "YEAR_NOT_ACTIVE"; throw error; }

      const targetClass = await SchoolClass.findOneAndUpdate(
        { _id: body.targetClassId, tenantId: req.tenantId, academicYearId: source.academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id academicYearId status").lean();
      if (!targetClass) { const error = new Error("Target class must be active and belong to the same academic year and school"); error.code = "TARGET_CLASS_INVALID"; throw error; }

      const targetSectionId = body.targetSectionId || null;
      let targetSection = null;
      if (targetSectionId) {
        targetSection = await Section.findOneAndUpdate(
          { _id: targetSectionId, tenantId: req.tenantId, classId: targetClass._id, status: "active" },
          { $inc: { capacityRevision: 1 } }, { new: true, session }
        ).select("_id capacity status").lean();
        if (!targetSection) { const error = new Error("Target section must be active and belong to the selected class"); error.code = "TARGET_SECTION_INVALID"; throw error; }
      }
      if (String(source.classId) === String(targetClass._id) && String(source.sectionId || "") === String(targetSectionId || "")) {
        const error = new Error("The student is already enrolled in the selected class and section"); error.code = "SAME_PLACEMENT"; throw error;
      }

      const transferredAt = new Date();
      if (!withinYear(transferredAt, year)) {
        const error = new Error("The current date is outside the active academic year; transfer cannot be dated in this session"); error.code = "TRANSFER_DATE_OUT_OF_RANGE"; throw error;
      }
      if (targetSection?.capacity !== null && targetSection?.capacity !== undefined) {
        const count = await Enrollment.countDocuments({
          tenantId: req.tenantId, sectionId: targetSection._id, status: "active",
          _id: { $ne: source._id },
        }).session(session);
        if (count >= targetSection.capacity) { const error = new Error("The target section has reached capacity"); error.code = "TARGET_SECTION_FULL"; throw error; }
      }

      source.status = "transferred";
      source.endedAt = transferredAt;
      await source.save({ session });
      const [created] = await Enrollment.create([{
        tenantId: req.tenantId, studentId: source.studentId, academicYearId: source.academicYearId,
        classId: targetClass._id, sectionId: targetSection?._id || null,
        enrollmentDate: transferredAt, status: "active", notes: source.notes,
      }], { session });
      await EnrollmentTransferAudit.create([{
        tenantId: req.tenantId, studentId: source.studentId,
        fromEnrollmentId: source._id, toEnrollmentId: created._id,
        previousPlacement: { academicYearId: source.academicYearId, classId: source.classId, sectionId: source.sectionId },
        nextPlacement: { academicYearId: source.academicYearId, classId: targetClass._id, sectionId: targetSection?._id || null },
        reason: body.reason.trim(), changedBy: req.auth.userId, transferredAt,
      }], { session });
      result = created;
    });
    const data = await Enrollment.findOne({ _id: result._id, tenantId: req.tenantId })
      .populate("studentId", "admissionNumber firstName lastName status")
      .populate("academicYearId", "name startDate endDate status")
      .populate("classId", "name sortOrder status")
      .populate("sectionId", "name status").lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const conflicts = {
      SOURCE_ENROLLMENT_NOT_ACTIVE: [409, "Only an active enrollment can be transferred within the school"],
      STUDENT_NOT_ACTIVE: [409, "The student is not active in this school"],
      YEAR_NOT_ACTIVE: [409, "Within-school transfers require the active academic year"],
      TARGET_CLASS_INVALID: [400, "Target class must be active and belong to the same academic year and school"],
      TARGET_SECTION_INVALID: [400, "Target section must be active and belong to the selected class"],
      SAME_PLACEMENT: [409, "The student is already enrolled in the selected class and section"],
      TRANSFER_DATE_OUT_OF_RANGE: [409, "The current date is outside the active academic year; transfer cannot be dated in this session"],
      TARGET_SECTION_FULL: [409, "The target section has reached capacity"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    if (error.code === 11000) return res.status(409).json({ success: false, message: "The student already has an active enrollment or this transfer has already been recorded" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more transfer fields are invalid");
    return next(error);
  } finally { await session.endSession(); }
};

export const listEnrollmentTransferHistory = async (req, res, next) => {
  try {
    if (!validId(req.params.enrollmentId)) return invalid(res, "Invalid enrollment ID");
    const enrollment = await Enrollment.findOne({ _id: req.params.enrollmentId, tenantId: req.tenantId }).select("_id studentId").lean();
    if (!enrollment) return res.status(404).json({ success: false, message: "Enrollment not found" });
    const data = await EnrollmentTransferAudit.find({
      tenantId: req.tenantId, studentId: enrollment.studentId,
    }).populate("changedBy", "firstName lastName email")
      .populate("fromEnrollmentId", "enrollmentDate status")
      .populate("toEnrollmentId", "enrollmentDate status")
      .sort({ transferredAt: -1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};
