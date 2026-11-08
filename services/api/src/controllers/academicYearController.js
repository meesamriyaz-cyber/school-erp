
import mongoose from "mongoose";
import AcademicYear from "../models/AcademicYear.js";
import Enrollment from "../models/Enrollment.js";
import Attendance from "../models/Attendance.js";
import Examination from "../models/Examination.js";
import AcademicTerm from "../models/AcademicTerm.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import TimetableEntry from "../models/TimetableEntry.js";

const CREATE_FIELDS = ["name", "startDate", "endDate", "status"];
const UPDATE_FIELDS = CREATE_FIELDS;

const VALID_STATUSES = ["draft", "active", "closed"];

const pickFields = (source, allowedFields) => {
  const result = {};

  for (const field of allowedFields) {
    if (Object.hasOwn(source, field)) {
      result[field] = source[field];
    }
  }

  return result;
};

const invalidRequest = (res, message) =>
  res.status(400).json({ success: false, message });

const handleAcademicYearError = (error, res, next) => {
  if (error.code === 11000) {
    const duplicateActiveYear =
      error.keyPattern?.status === 1 ||
      error.message?.includes("one_active_academic_year_per_school");

    return res.status(409).json({
      success: false,
      message: duplicateActiveYear
        ? "This school already has an active academic year"
        : "An academic year with this name already exists in this school",
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      message: "One or more academic-year fields are invalid",
    });
  }

  return next(error);
};

const validateBody = (body, res, { creating = false } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalidRequest(res, "Provide academic-year details");
    return null;
  }

  if (Object.hasOwn(body, "tenantId")) {
    invalidRequest(
      res,
      "School assignment is determined by the authenticated account"
    );
    return null;
  }

  const fields = pickFields(
    body,
    creating ? CREATE_FIELDS : UPDATE_FIELDS
  );

  if (creating && !Object.hasOwn(fields, "name")) {
    invalidRequest(res, "Academic-year name is required");
    return null;
  }

  if (
    Object.hasOwn(fields, "name") &&
    (typeof fields.name !== "string" || !fields.name.trim())
  ) {
    invalidRequest(res, "Academic-year name is required");
    return null;
  }

  for (const field of ["startDate", "endDate"]) {
    if (
      Object.hasOwn(fields, field) &&
      (fields[field] === "" ||
        fields[field] === null ||
        fields[field] === undefined ||
        !Number.isFinite(new Date(fields[field]).getTime()))
    ) {
      invalidRequest(res, `${field} must be a valid date`);
      return null;
    }
  }

  if (
    Object.hasOwn(fields, "status") &&
    !VALID_STATUSES.includes(fields.status)
  ) {
    invalidRequest(res, "Invalid academic-year status");
    return null;
  }

  if (!creating && Object.keys(fields).length === 0) {
    invalidRequest(res, "No supported academic-year fields provided");
    return null;
  }

  return fields;
};

// GET /api/v1/academic-years
export const listAcademicYears = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };

    if (req.query.status !== undefined) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        return invalidRequest(res, "Invalid academic-year status filter");
      }

      filter.status = req.query.status;
    }

    const academicYears = await AcademicYear.find(filter)
      .sort({ startDate: -1, _id: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: academicYears,
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/v1/academic-years/:academicYearId
export const getAcademicYear = async (req, res, next) => {
  try {
    const { academicYearId } = req.params;

    if (!mongoose.isValidObjectId(academicYearId)) {
      return invalidRequest(res, "Invalid academic-year ID");
    }

    const academicYear = await AcademicYear.findOne({
      _id: academicYearId,
      tenantId: req.tenantId,
    }).lean();

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: "Academic year not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: academicYear,
    });
  } catch (error) {
    return next(error);
  }
};

// POST /api/v1/academic-years
export const createAcademicYear = async (req, res, next) => {
  try {
    const fields = validateBody(req.body, res, { creating: true });
    if (!fields) return;

    const academicYear = await AcademicYear.create({
      ...fields,
      tenantId: req.tenantId,
    });

    return res.status(201).json({
      success: true,
      data: academicYear,
    });
  } catch (error) {
    return handleAcademicYearError(error, res, next);
  }
};

// PATCH /api/v1/academic-years/:academicYearId
export const updateAcademicYear = async (req, res, next) => {
  let session;
  try {
    const { academicYearId } = req.params;

    if (!mongoose.isValidObjectId(academicYearId)) {
      return invalidRequest(res, "Invalid academic-year ID");
    }

    const fields = validateBody(req.body, res);
    if (!fields) return;

    await AcademicTerm.init();
    session = await mongoose.startSession();
    let updatedAcademicYear;

    try {
      await session.withTransaction(async () => {
        // This is the shared lifecycle lock used by enrollment creation.
        // Date edits therefore serialize with new placements and year closure.
        const lockedYear = await AcademicYear.findOneAndUpdate(
          { _id: academicYearId, tenantId: req.tenantId },
          { $inc: { lifecycleRevision: 1 } },
          { new: true, session }
        );

        if (!lockedYear) {
          const error = new Error("Academic year not found");
          error.code = "ACADEMIC_YEAR_NOT_FOUND";
          throw error;
        }

        if (lockedYear.status === "closed") {
          const error = new Error("A closed academic year cannot be modified");
          error.code = "ACADEMIC_YEAR_CLOSED";
          throw error;
        }

        const nextStatus = fields.status ?? lockedYear.status;
        const allowedTransitions = {
          draft: ["draft", "active", "closed"],
          active: ["active", "closed"],
          closed: [],
        };

        if (!allowedTransitions[lockedYear.status].includes(nextStatus)) {
          const error = new Error(
            `Cannot change academic year from ${lockedYear.status} to ${nextStatus}`
          );
          error.code = "ACADEMIC_YEAR_TRANSITION";
          throw error;
        }

        const nextStartDate = Object.hasOwn(fields, "startDate")
          ? new Date(fields.startDate)
          : lockedYear.startDate;
        const nextEndDate = Object.hasOwn(fields, "endDate")
          ? new Date(fields.endDate)
          : lockedYear.endDate;

        if (
          !Number.isFinite(nextStartDate.getTime()) ||
          !Number.isFinite(nextEndDate.getTime()) ||
          nextEndDate <= nextStartDate
        ) {
          const error = new Error(
            "Academic year end date must be after its start date"
          );
          error.code = "ACADEMIC_YEAR_INVALID_DATE_RANGE";
          throw error;
        }

        const datesChanged =
          Object.hasOwn(fields, "startDate") ||
          Object.hasOwn(fields, "endDate");

        if (datesChanged) {
          const startOfFirstDay = new Date(Date.UTC(
            nextStartDate.getUTCFullYear(),
            nextStartDate.getUTCMonth(),
            nextStartDate.getUTCDate()
          ));
          const startOfDayAfterLastDay = new Date(Date.UTC(
            nextEndDate.getUTCFullYear(),
            nextEndDate.getUTCMonth(),
            nextEndDate.getUTCDate() + 1
          ));

          const outOfRangeEnrollment = await Enrollment.exists({
            tenantId: req.tenantId,
            academicYearId: lockedYear._id,
            $or: [
              { enrollmentDate: { $lt: startOfFirstDay } },
              { enrollmentDate: { $gte: startOfDayAfterLastDay } },
            ],
          }).session(session);

          if (outOfRangeEnrollment) {
            const error = new Error(
              "Academic-year dates cannot exclude existing enrollment dates"
            );
            error.code = "ACADEMIC_YEAR_ENROLLMENTS_OUT_OF_RANGE";
            throw error;
          }

          const outOfRangeAttendance = await Attendance.exists({
            tenantId: req.tenantId, academicYearId: lockedYear._id,
            $or: [{ date: { $lt: startOfFirstDay } }, { date: { $gte: startOfDayAfterLastDay } }],
          }).session(session);
          const outOfRangeExamination = await Examination.exists({
            tenantId: req.tenantId, academicYearId: lockedYear._id,
            $or: [{ startDate: { $lt: startOfFirstDay } }, { endDate: { $gte: startOfDayAfterLastDay } }],
          }).session(session);
          const outOfRangeTerm = await AcademicTerm.exists({
            tenantId: req.tenantId, academicYearId: lockedYear._id,
            $or: [{ startDate: { $lt: startOfFirstDay } }, { endDate: { $gte: startOfDayAfterLastDay } }],
          }).session(session);
          if (outOfRangeAttendance || outOfRangeExamination || outOfRangeTerm) {
            const error = new Error("Academic-year dates cannot exclude existing attendance, examination, or academic-term dates");
            error.code = "ACADEMIC_YEAR_DEPENDENCIES_OUT_OF_RANGE";
            throw error;
          }
        }

        if (lockedYear.status === "active" && nextStatus === "closed") {
          const unfinishedTerms = await AcademicTerm.exists({
            tenantId: req.tenantId, academicYearId: lockedYear._id, status: { $in: ["draft", "active"] },
          }).session(session);
          if (unfinishedTerms) {
            const error = new Error("Complete or cancel all academic terms before closing this academic year");
            error.code = "ACADEMIC_YEAR_HAS_UNFINISHED_TERMS";
            throw error;
          }
          const unfinishedExaminations = await Examination.exists({
            tenantId: req.tenantId, academicYearId: lockedYear._id, status: { $in: ["draft", "scheduled", "in_progress"] },
          }).session(session);
          if (unfinishedExaminations) {
            const error = new Error("Complete or cancel all draft and in-progress examinations before closing this academic year");
            error.code = "ACADEMIC_YEAR_HAS_UNFINISHED_EXAMINATIONS";
            throw error;
          }
          const activeEnrollments = await Enrollment.exists({
            tenantId: req.tenantId,
            academicYearId: lockedYear._id,
            status: "active",
          }).session(session);

          if (activeEnrollments) {
            const error = new Error(
              "Complete, transfer, or withdraw active student enrollments before closing this academic year"
            );
            error.code = "ACADEMIC_YEAR_HAS_ACTIVE_ENROLLMENTS";
            throw error;
          }
        }

        // Mark both date paths modified so cross-field validation also runs
        // when the client PATCHes only one boundary.
        lockedYear.set("startDate", nextStartDate);
        lockedYear.set("endDate", nextEndDate);
        lockedYear.set(fields);
        if (nextStatus === "closed") {
          await TeacherAssignment.updateMany(
            { tenantId: req.tenantId, academicYearId: lockedYear._id, status: "active" },
            { $set: { status: "inactive" } }, { session }
          );
          await TimetableEntry.updateMany(
            { tenantId: req.tenantId, academicYearId: lockedYear._id, status: "active" },
            { $set: { status: "inactive" } }, { session }
          );
        }
        await lockedYear.save({ session });
        updatedAcademicYear = lockedYear;
      });
    } catch (error) {
      const conflicts = {
        ACADEMIC_YEAR_CLOSED: 409,
        ACADEMIC_YEAR_TRANSITION: 409,
        ACADEMIC_YEAR_ENROLLMENTS_OUT_OF_RANGE: 409,
        ACADEMIC_YEAR_HAS_ACTIVE_ENROLLMENTS: 409,
      ACADEMIC_YEAR_DEPENDENCIES_OUT_OF_RANGE: 409,
      ACADEMIC_YEAR_HAS_UNFINISHED_TERMS: 409,
      ACADEMIC_YEAR_HAS_UNFINISHED_EXAMINATIONS: 409,
        ACADEMIC_YEAR_INVALID_DATE_RANGE: 400,
        ACADEMIC_YEAR_NOT_FOUND: 404,
      };

      if (conflicts[error.code]) {
        return res.status(conflicts[error.code]).json({
          success: false,
          message: error.message,
        });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: updatedAcademicYear,
    });
  } catch (error) {
    return handleAcademicYearError(error, res, next);
  } finally {
    if (session) await session.endSession();
  }
};
