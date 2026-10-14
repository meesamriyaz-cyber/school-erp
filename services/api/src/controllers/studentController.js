
import mongoose from "mongoose";

import Student from "../models/Student.js";

const CREATE_FIELDS = [
  "admissionNumber",
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "admissionDate",
  "guardianName",
  "guardianPhone",
  "guardianEmail",
];

const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];

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

const handleStudentError = (error, res, next) => {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This admission number already exists in this school",
    });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "One or more student fields are invalid",
    });
  }

  return next(error);
};

// GET /api/v1/school/students
export const listStudents = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page ?? "1", 10);
    const limit = Number.parseInt(req.query.limit ?? "20", 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return invalidRequest(
        res,
        "Page must be positive and limit must be between 1 and 100"
      );
    }

    const filter = { tenantId: req.tenantId };

    if (req.query.status !== undefined) {
      if (
        !["active", "inactive", "withdrawn"].includes(req.query.status)
      ) {
        return invalidRequest(res, "Invalid student status filter");
      }

      filter.status = req.query.status;
    }

    if (req.query.search !== undefined) {
      if (
        typeof req.query.search !== "string" ||
        req.query.search.trim().length > 100
      ) {
        return invalidRequest(res, "Search must not exceed 100 characters");
      }

      const search = req.query.search.trim();

      if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escapedSearch, "i");

        filter.$or = [
          { admissionNumber: pattern },
          { firstName: pattern },
          { lastName: pattern },
        ];
      }
    }

    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort({ admissionNumber: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Student.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// POST /api/v1/school/students
export const createStudent = async (req, res, next) => {
  try {
    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidRequest(res, "Provide student details");
    }

    if (Object.hasOwn(body, "tenantId")) {
      return invalidRequest(
        res,
        "School assignment is determined by the authenticated account"
      );
    }

    const fields = pickFields(body, CREATE_FIELDS);

    if (
      typeof fields.admissionNumber !== "string" ||
      !fields.admissionNumber.trim() ||
      typeof fields.firstName !== "string" ||
      !fields.firstName.trim()
    ) {
      return invalidRequest(
        res,
        "Admission number and first name are required"
      );
    }

    const student = await Student.create({
      ...fields,
      tenantId: req.tenantId,
    });

    return res.status(201).json({
      success: true,
      data: student,
    });
  } catch (error) {
    return handleStudentError(error, res, next);
  }
};

// GET /api/v1/school/students/:studentId
export const getStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    if (!mongoose.isValidObjectId(studentId)) {
      return invalidRequest(res, "Invalid student ID");
    }

    const student = await Student.findOne({
      _id: studentId,
      tenantId: req.tenantId,
    }).lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    return next(error);
  }
};

// PATCH /api/v1/school/students/:studentId
export const updateStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const body = req.body;

    if (!mongoose.isValidObjectId(studentId)) {
      return invalidRequest(res, "Invalid student ID");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidRequest(res, "Provide student fields to update");
    }

    if (Object.hasOwn(body, "tenantId")) {
      return invalidRequest(res, "School assignment cannot be changed");
    }

    const updates = pickFields(body, UPDATE_FIELDS);

    if (Object.keys(updates).length === 0) {
      return invalidRequest(res, "No supported student fields provided");
    }

    const student = await Student.findOneAndUpdate(
      {
        _id: studentId,
        tenantId: req.tenantId,
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    return handleStudentError(error, res, next);
  }
};
