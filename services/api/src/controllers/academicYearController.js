
import mongoose from "mongoose";
import AcademicYear from "../models/AcademicYear.js";
import Enrollment from "../models/Enrollment.js";

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
  try {
    const { academicYearId } = req.params;

    if (!mongoose.isValidObjectId(academicYearId)) {
      return invalidRequest(res, "Invalid academic-year ID");
    }

    const fields = validateBody(req.body, res);
    if (!fields) return;

    const academicYear = await AcademicYear.findOne({
      _id: academicYearId,
      tenantId: req.tenantId,
    });

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: "Academic year not found",
      });
    }

    // Closed academic years are historical records and cannot be changed.
    if (academicYear.status === "closed") {
      return res.status(409).json({
        success: false,
        message: "A closed academic year cannot be modified",
      });
    }

    const nextStatus = fields.status ?? academicYear.status;

    // Allowed lifecycle: draft -> active, draft -> closed,
    // active -> closed. Closed years are terminal.
    const allowedTransitions = {
      draft: ["draft", "active", "closed"],
      active: ["active", "closed"],
      closed: [],
    };

    if (!allowedTransitions[academicYear.status].includes(nextStatus)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change academic year from ${academicYear.status} to ${nextStatus}`,
      });
    }

    if (academicYear.status === "active" && nextStatus === "closed") {
      const activeEnrollments = await Enrollment.exists({
        tenantId: req.tenantId,
        academicYearId: academicYear._id,
        status: "active",
      });
      if (activeEnrollments) {
        return res.status(409).json({
          success: false,
          message: "Complete, transfer, or withdraw active student enrollments before closing this academic year",
        });
      }
    }

    academicYear.set(fields);
    await academicYear.save();

    return res.status(200).json({
      success: true,
      data: academicYear,
    });
  } catch (error) {
    return handleAcademicYearError(error, res, next);
  }
};
