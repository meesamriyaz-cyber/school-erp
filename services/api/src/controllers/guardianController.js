import mongoose from "mongoose";
import Guardian from "../models/Guardian.js";

const CREATE_FIELDS = ["firstName", "lastName", "phone", "email"];
const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];

const invalid = (res, message) =>
  res.status(400).json({ success: false, message });

const pick = (body, allowed) =>
  Object.fromEntries(
    allowed.filter((field) => Object.hasOwn(body, field))
      .map((field) => [field, body[field]]),
  );

const handleError = (error, res, next) => {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A matching guardian record already exists",
    });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return invalid(res, "One or more guardian fields are invalid");
  }
  return next(error);
};

const validateBody = (body, res, allowedFields) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide guardian details");
    return null;
  }
  if (Object.hasOwn(body, "tenantId")) {
    invalid(res, "School assignment is determined by the authenticated account");
    return null;
  }
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    invalid(res, "One or more unsupported guardian fields were provided");
    return null;
  }
  return pick(body, allowedFields);
};

export const listGuardians = async (req, res, next) => {
  try {
    const guardians = await Guardian.find({ tenantId: req.tenantId })
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .lean();
    return res.status(200).json({ success: true, data: guardians });
  } catch (error) {
    return next(error);
  }
};

export const createGuardian = async (req, res, next) => {
  try {
    const fields = validateBody(req.body, res, CREATE_FIELDS);
    if (!fields) return;
    if (typeof fields.firstName !== "string" || !fields.firstName.trim()) {
      return invalid(res, "Guardian first name is required");
    }
    for (const field of ["lastName", "phone", "email"]) {
      if (fields[field] !== undefined && fields[field] !== null &&
          typeof fields[field] !== "string") {
        return invalid(res, `${field} must be a string`);
      }
    }
    const guardian = await Guardian.create({
      ...fields,
      tenantId: req.tenantId,
    });
    return res.status(201).json({ success: true, data: guardian });
  } catch (error) {
    return handleError(error, res, next);
  }
};

export const getGuardian = async (req, res, next) => {
  try {
    const { guardianId } = req.params;
    if (!mongoose.isValidObjectId(guardianId)) {
      return invalid(res, "Invalid guardian ID");
    }
    const guardian = await Guardian.findOne({
      _id: guardianId,
      tenantId: req.tenantId,
    }).lean();
    if (!guardian) {
      return res.status(404).json({ success: false, message: "Guardian not found" });
    }
    return res.status(200).json({ success: true, data: guardian });
  } catch (error) {
    return next(error);
  }
};

export const updateGuardian = async (req, res, next) => {
  try {
    const { guardianId } = req.params;
    if (!mongoose.isValidObjectId(guardianId)) {
      return invalid(res, "Invalid guardian ID");
    }
    const updates = validateBody(req.body, res, UPDATE_FIELDS);
    if (!updates) return;
    if (Object.keys(updates).length === 0) {
      return invalid(res, "Provide at least one guardian field to update");
    }
    if (Object.hasOwn(updates, "firstName") &&
        (typeof updates.firstName !== "string" || !updates.firstName.trim())) {
      return invalid(res, "Guardian first name cannot be empty");
    }
    for (const field of ["lastName", "phone", "email"]) {
      if (updates[field] !== undefined && updates[field] !== null &&
          typeof updates[field] !== "string") {
        return invalid(res, `${field} must be a string`);
      }
    }
    const guardian = await Guardian.findOneAndUpdate(
      { _id: guardianId, tenantId: req.tenantId },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!guardian) {
      return res.status(404).json({ success: false, message: "Guardian not found" });
    }
    return res.status(200).json({ success: true, data: guardian });
  } catch (error) {
    return handleError(error, res, next);
  }
};
