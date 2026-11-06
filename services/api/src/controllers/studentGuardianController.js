import mongoose from "mongoose";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian, { RELATIONSHIPS } from "../models/StudentGuardian.js";

const BOOLEAN_FIELDS = [
  "isPrimary",
  "isEmergencyContact",
  "canPickup",
  "receivesCommunication",
];

const invalid = (res, message) =>
  res.status(400).json({ success: false, message });

const handleError = (error, res, next) => {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This student-guardian relationship already exists or conflicts with the primary guardian",
    });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return invalid(res, "One or more student-guardian fields are invalid");
  }
  return next(error);
};

const findStudent = async (studentId, tenantId) => {
  if (!mongoose.isValidObjectId(studentId)) return { invalidId: true };
  const student = await Student.findOne({
    _id: studentId,
    tenantId,
  }).select("_id").lean();
  return { student };
};

export const listStudentGuardians = async (req, res, next) => {
  try {
    const result = await findStudent(req.params.studentId, req.tenantId);
    if (result.invalidId) return invalid(res, "Invalid student ID");
    if (!result.student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const links = await StudentGuardian.find({
      tenantId: req.tenantId,
      studentId: result.student._id,
    })
      .sort({ isPrimary: -1, createdAt: 1, _id: 1 })
      .populate({
        path: "guardianId",
        select: "firstName lastName phone email status",
        match: { tenantId: req.tenantId },
      })
      .lean();
    return res.status(200).json({ success: true, data: links });
  } catch (error) {
    return next(error);
  }
};

export const createStudentGuardian = async (req, res, next) => {
  try {
    const result = await findStudent(req.params.studentId, req.tenantId);
    if (result.invalidId) return invalid(res, "Invalid student ID");
    if (!result.student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalid(res, "Provide student-guardian relationship details");
    }
    if (Object.hasOwn(body, "tenantId") || Object.hasOwn(body, "studentId")) {
      return invalid(res, "School and student assignment are determined by the request context");
    }
    const allowed = ["guardianId", "relationship", ...BOOLEAN_FIELDS];
    if (Object.keys(body).some((field) => !allowed.includes(field))) {
      return invalid(res, "One or more unsupported relationship fields were provided");
    }
    if (!mongoose.isValidObjectId(body.guardianId)) {
      return invalid(res, "A valid guardian ID is required");
    }
    if (!RELATIONSHIPS.includes(body.relationship)) {
      return invalid(res, "Invalid guardian relationship type");
    }
    for (const field of BOOLEAN_FIELDS) {
      if (body[field] !== undefined && typeof body[field] !== "boolean") {
        return invalid(res, `${field} must be a boolean`);
      }
    }

    const guardian = await Guardian.findOne({
      _id: body.guardianId,
      tenantId: req.tenantId,
      status: "active",
    }).select("_id").lean();
    if (!guardian) {
      return res.status(404).json({ success: false, message: "Guardian not found" });
    }

    const link = await StudentGuardian.create({
      tenantId: req.tenantId,
      studentId: result.student._id,
      guardianId: guardian._id,
      relationship: body.relationship,
      ...Object.fromEntries(
        BOOLEAN_FIELDS.filter((field) => body[field] !== undefined)
          .map((field) => [field, body[field]]),
      ),
    });
    return res.status(201).json({ success: true, data: link });
  } catch (error) {
    return handleError(error, res, next);
  }
};

export const updateStudentGuardian = async (req, res, next) => {
  try {
    const result = await findStudent(req.params.studentId, req.tenantId);
    if (result.invalidId) return invalid(res, "Invalid student ID");
    if (!result.student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (!mongoose.isValidObjectId(req.params.studentGuardianId)) {
      return invalid(res, "Invalid student-guardian relationship ID");
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalid(res, "Provide student-guardian fields to update");
    }

    const allowed = ["relationship", ...BOOLEAN_FIELDS, "status"];
    if (Object.keys(body).some((field) => !allowed.includes(field))) {
      return invalid(res, "One or more unsupported relationship fields were provided");
    }

    if (Object.keys(body).length === 0) {
      return invalid(res, "Provide at least one relationship field to update");
    }

    if (Object.hasOwn(body, "relationship") &&
        !RELATIONSHIPS.includes(body.relationship)) {
      return invalid(res, "Invalid guardian relationship type");
    }

    for (const field of BOOLEAN_FIELDS) {
      if (Object.hasOwn(body, field) && typeof body[field] !== "boolean") {
        return invalid(res, `${field} must be a boolean`);
      }
    }

    if (Object.hasOwn(body, "status") &&
        !["active", "inactive"].includes(body.status)) {
      return invalid(res, "Status must be active or inactive");
    }

    const link = await StudentGuardian.findOneAndUpdate(
      {
        _id: req.params.studentGuardianId,
        tenantId: req.tenantId,
        studentId: result.student._id,
      },
      { $set: body },
      { new: true, runValidators: true },
    ).lean();

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Student-guardian relationship not found",
      });
    }

    return res.status(200).json({ success: true, data: link });
  } catch (error) {
    return handleError(error, res, next);
  }
};

