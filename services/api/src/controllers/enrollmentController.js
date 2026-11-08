import mongoose from "mongoose";
import Enrollment from "../models/Enrollment.js";
import Student from "../models/Student.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";

const TERMINAL_STATUSES = ["completed", "transferred", "withdrawn"];
const validId = (value) => mongoose.isValidObjectId(value);
const calendarDay = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const invalid = (res, message) => res.status(400).json({ success: false, message });
const isEnrollmentDateWithinYear = (date, year) => {
  const enrollmentDay = calendarDay(date);
  return enrollmentDay >= calendarDay(year.startDate) &&
    enrollmentDay <= calendarDay(year.endDate);
};
const pick = (body, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));

const handleError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "This student already has an active enrollment in this school" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more enrollment fields are invalid");
  return next(error);
};

const validateBody = (body, res, creating = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide enrollment details");
    return null;
  }
  if (Object.hasOwn(body, "tenantId")) {
    invalid(res, "School assignment is determined by the authenticated account");
    return null;
  }
  const fields = pick(body, creating
    ? ["studentId", "academicYearId", "classId", "sectionId", "enrollmentDate", "notes", "reAdmissionReason"]
    : ["status", "endedAt"]);
  if (creating) {
    for (const key of ["studentId", "academicYearId", "classId"]) {
      if (!validId(fields[key])) {
        invalid(res, `Valid ${key} is required`);
        return null;
      }
    }
    if (Object.hasOwn(fields, "sectionId") && fields.sectionId !== null && !validId(fields.sectionId)) {
      invalid(res, "Invalid section ID");
      return null;
    }
    if (Object.hasOwn(fields, "reAdmissionReason") && (typeof fields.reAdmissionReason !== "string" || fields.reAdmissionReason.trim().length > 500)) {
      invalid(res, "Re-admission reason must be a string of at most 500 characters");
      return null;
    }
    if (Object.hasOwn(fields, "notes") && (typeof fields.notes !== "string" || fields.notes.trim().length > 500)) {
      invalid(res, "Notes must be a string of at most 500 characters");
      return null;
    }
    if (Object.hasOwn(fields, "enrollmentDate") && Number.isNaN(new Date(fields.enrollmentDate).getTime())) {
      invalid(res, "Invalid enrollment date");
      return null;
    }
    return fields;
  }
  if (!Object.hasOwn(fields, "status") || Object.keys(fields).length !== 1 || !TERMINAL_STATUSES.includes(fields.status)) {
    invalid(res, "Only an active enrollment can be ended as completed, transferred, or withdrawn");
    return null;
  }
  return fields;
};

export const listEnrollments = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    for (const key of ["studentId", "academicYearId", "classId", "sectionId"]) {
      if (req.query[key] !== undefined) {
        if (key === "sectionId" && req.query[key] === "none") filter.sectionId = null;
        else {
          if (!validId(req.query[key])) return invalid(res, `Invalid ${key}`);
          filter[key] = req.query[key];
        }
      }
    }
    if (req.query.status !== undefined) {
      if (!["active", ...TERMINAL_STATUSES].includes(req.query.status)) return invalid(res, "Invalid enrollment status filter");
      filter.status = req.query.status;
    }
    const data = await Enrollment.find(filter)
      .populate("studentId", "admissionNumber firstName lastName status")
      .populate("academicYearId", "name startDate endDate status")
      .populate("classId", "name sortOrder status")
      .populate("sectionId", "name status")
      .populate("previousEnrollmentId", "enrollmentDate status admissionType")
      .sort({ enrollmentDate: -1, _id: -1 })
      .lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getEnrollment = async (req, res, next) => {
  try {
    if (!validId(req.params.enrollmentId)) return invalid(res, "Invalid enrollment ID");
    const data = await Enrollment.findOne({ _id: req.params.enrollmentId, tenantId: req.tenantId })
      .populate("studentId", "admissionNumber firstName lastName status")
      .populate("academicYearId", "name startDate endDate status")
      .populate("classId", "name sortOrder status")
      .populate("sectionId", "name status")
      .populate("previousEnrollmentId", "enrollmentDate status admissionType")
      .lean();
    if (!data) return res.status(404).json({ success: false, message: "Enrollment not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createEnrollment = async (req, res, next) => {
  try {
    const fields = validateBody(req.body, res, true);
    if (!fields) return;
    const [student, year, schoolClass] = await Promise.all([
      Student.findOne({ _id: fields.studentId, tenantId: req.tenantId, status: "active" }).select("_id").lean(),
      AcademicYear.findOne({ _id: fields.academicYearId, tenantId: req.tenantId, status: "active" }).select("_id startDate endDate").lean(),
      SchoolClass.findOne({ _id: fields.classId, tenantId: req.tenantId, academicYearId: fields.academicYearId, status: "active" }).select("_id academicYearId").lean(),
    ]);
    if (!student) return res.status(400).json({ success: false, message: "Active student was not found in this school" });
    if (!year) return res.status(400).json({ success: false, message: "Enrollments can only be created for this school's active academic year" });
    const enrollmentDate = fields.enrollmentDate ? new Date(fields.enrollmentDate) : new Date();
    if (!isEnrollmentDateWithinYear(enrollmentDate, year)) {
      return res.status(400).json({ success: false, message: "Enrollment date must fall within the selected academic year" });
    }
    if (!schoolClass) return res.status(400).json({ success: false, message: "Active class was not found in the selected academic year and school" });
    const previousEnrollment = await Enrollment.findOne({
      tenantId: req.tenantId, studentId: fields.studentId, status: { $in: TERMINAL_STATUSES },
    }).sort({ endedAt: -1, createdAt: -1 }).select("_id status").lean();
    const isReadmission = ["withdrawn", "transferred"].includes(previousEnrollment?.status);
    if (isReadmission && !fields.reAdmissionReason?.trim()) {
      return invalid(res, "A reason is required to re-admit a previously withdrawn or transferred student");
    }
    if (!isReadmission && fields.reAdmissionReason?.trim()) {
      return invalid(res, "A re-admission reason is only accepted when the student has a previous withdrawn or transferred enrollment");
    }
    const admissionMetadata = {
      admissionType: isReadmission ? "readmission" : previousEnrollment ? "continuing" : "initial",
      previousEnrollmentId: previousEnrollment?._id || null,
      reAdmissionReason: isReadmission ? fields.reAdmissionReason.trim() : "",
    };

    if (fields.sectionId) {
      const section = await Section.findOne({
        _id: fields.sectionId,
        tenantId: req.tenantId,
        classId: schoolClass._id,
        status: "active",
      }).select("_id capacity").lean();
      if (!section) return res.status(400).json({ success: false, message: "Active section was not found in the selected class and school" });

      if (section) {
        const session = await mongoose.startSession();
        let data;
        try {
          await session.withTransaction(async () => {
            // Enrollment creation and year closure both write the academic-year document.
            const lockedYear = await AcademicYear.findOneAndUpdate(
              { _id: fields.academicYearId, tenantId: req.tenantId, status: "active" },
              { $inc: { lifecycleRevision: 1 } },
              { new: true, session }
            ).select("_id status startDate endDate").lean();

            if (!lockedYear) {
              const error = new Error("Enrollments can only be created for this school's active academic year");
              error.code = "ACADEMIC_YEAR_NOT_ACTIVE";
              throw error;
            }

            if (!isEnrollmentDateWithinYear(enrollmentDate, lockedYear)) {
              const error = new Error("Enrollment date must fall within the selected academic year");
              error.code = "ENROLLMENT_DATE_OUT_OF_RANGE";
              throw error;
            }

            const lockedClass = await SchoolClass.findOneAndUpdate(
              { _id: schoolClass._id, tenantId: req.tenantId, academicYearId: fields.academicYearId, status: "active" },
              { $inc: { placementRevision: 1 } }, { new: true, session }
            ).select("_id").lean();
            if (!lockedClass) {
              const error = new Error("Active class was not found in the selected academic year and school");
              error.code = "CLASS_NOT_ACTIVE";
              throw error;
            }

            // All placements serialize on the section document, even when capacity is unlimited.
            // MongoDB retries write-conflicting transactions, so each retry sees the latest count.
            const lockedSection = await Section.findOneAndUpdate(
              { _id: section._id, tenantId: req.tenantId, classId: schoolClass._id, status: "active" },
              { $inc: { capacityRevision: 1 } },
              { new: true, session }
            ).select("_id capacity").lean();

            if (!lockedSection) {
              const error = new Error("Active section was not found in the selected class and school");
              error.code = "SECTION_NOT_ACTIVE";
              throw error;
            }

            const activeCount = await Enrollment.countDocuments({
              tenantId: req.tenantId,
              sectionId: lockedSection._id,
              status: "active",
            }).session(session);

            if (lockedSection.capacity !== null && activeCount >= lockedSection.capacity) {
              const error = new Error("The selected section has reached its capacity");
              error.code = "SECTION_CAPACITY";
              throw error;
            }

            const created = await Enrollment.create([{
              ...fields,
              ...admissionMetadata,
              enrollmentDate,
              tenantId: req.tenantId,
              sectionId: fields.sectionId,
              status: "active",
            }], { session });
            data = created[0];
          });
        } catch (error) {
          if (error.code === "SECTION_CAPACITY") {
            return res.status(409).json({ success: false, message: error.message });
          }
          if (error.code === "CLASS_NOT_ACTIVE") return res.status(400).json({ success: false, message: error.message });
          if (error.code === "SECTION_NOT_ACTIVE") {
            return res.status(400).json({ success: false, message: error.message });
          }
          if (error.code === "ACADEMIC_YEAR_NOT_ACTIVE") {
            return res.status(400).json({ success: false, message: error.message });
          }
          if (error.code === "ENROLLMENT_DATE_OUT_OF_RANGE") {
            return res.status(400).json({ success: false, message: error.message });
          }
          throw error;
        } finally {
          await session.endSession();
        }
        return res.status(201).json({ success: true, data });
      }
    }

    const session = await mongoose.startSession();
    let data;
    try {
      await session.withTransaction(async () => {
        // This write serializes even unsectioned or uncapped enrollments with year closure.
        const lockedYear = await AcademicYear.findOneAndUpdate(
          { _id: fields.academicYearId, tenantId: req.tenantId, status: "active" },
          { $inc: { lifecycleRevision: 1 } },
          { new: true, session }
        ).select("_id status startDate endDate").lean();

        if (!lockedYear) {
          const error = new Error("Enrollments can only be created for this school's active academic year");
          error.code = "ACADEMIC_YEAR_NOT_ACTIVE";
          throw error;
        }

        if (!isEnrollmentDateWithinYear(enrollmentDate, lockedYear)) {
          const error = new Error("Enrollment date must fall within the selected academic year");
          error.code = "ENROLLMENT_DATE_OUT_OF_RANGE";
          throw error;
        }

        const lockedClass = await SchoolClass.findOneAndUpdate(
          { _id: schoolClass._id, tenantId: req.tenantId, academicYearId: fields.academicYearId, status: "active" },
          { $inc: { placementRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!lockedClass) {
          const error = new Error("Active class was not found in the selected academic year and school");
          error.code = "CLASS_NOT_ACTIVE";
          throw error;
        }

        const created = await Enrollment.create([{
          ...fields,
          ...admissionMetadata,
          enrollmentDate,
          tenantId: req.tenantId,
          sectionId: fields.sectionId || null,
          status: "active",
        }], { session });
        data = created[0];
      });
    } catch (error) {
      if (error.code === "CLASS_NOT_ACTIVE") return res.status(400).json({ success: false, message: error.message });
      if (error.code === "ACADEMIC_YEAR_NOT_ACTIVE") {
        return res.status(400).json({ success: false, message: error.message });
      }
      if (error.code === "ENROLLMENT_DATE_OUT_OF_RANGE") {
        return res.status(400).json({ success: false, message: error.message });
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return res.status(201).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
};

export const endEnrollment = async (req, res, next) => {
  if (!validId(req.params.enrollmentId)) return invalid(res, "Invalid enrollment ID");
  const fields = validateBody(req.body, res);
  if (!fields) return;
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const enrollment = await Enrollment.findOne({
        _id: req.params.enrollmentId, tenantId: req.tenantId, status: "active",
      }).session(session);
      if (!enrollment) {
        const error = new Error("Only active enrollments can be ended");
        error.code = "ENROLLMENT_NOT_ACTIVE";
        throw error;
      }
      enrollment.status = fields.status;
      enrollment.endedAt = new Date();
      await enrollment.save({ session });
      if (fields.status === "withdrawn" || fields.status === "transferred") {
        await Student.updateOne(
          { _id: enrollment.studentId, tenantId: req.tenantId },
          { $set: { status: fields.status === "withdrawn" ? "withdrawn" : "inactive" } },
          { session }
        );
      }
      updated = enrollment;
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    if (error.code === "ENROLLMENT_NOT_ACTIVE") return res.status(409).json({ success: false, message: error.message });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};
