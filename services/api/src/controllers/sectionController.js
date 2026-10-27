import mongoose from "mongoose";
import Section from "../models/Section.js";
import SchoolClass from "../models/SchoolClass.js";

const CREATE_FIELDS = ["classId", "name", "capacity", "status"];
const UPDATE_FIELDS = ["name", "capacity", "status"];
const STATUSES = ["active", "inactive"];
const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);
const pick = (body, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));

const handleError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A section with this name already exists in this class" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more section fields are invalid");
  return next(error);
};

const validateBody = (body, res, creating = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide section details");
    return null;
  }
  if (Object.hasOwn(body, "tenantId")) {
    invalid(res, "School assignment is determined by the authenticated account");
    return null;
  }
  const fields = pick(body, creating ? CREATE_FIELDS : UPDATE_FIELDS);
  if (creating && !fields.classId) {
    invalid(res, "Class is required");
    return null;
  }
  if (Object.hasOwn(fields, "classId") && !validId(fields.classId)) {
    invalid(res, "Invalid class ID");
    return null;
  }
  if (Object.hasOwn(fields, "name") && (typeof fields.name !== "string" || !fields.name.trim())) {
    invalid(res, "Section name is required");
    return null;
  }
  if (Object.hasOwn(fields, "capacity") && fields.capacity !== null && (!Number.isInteger(fields.capacity) || fields.capacity < 1 || fields.capacity > 500)) {
    invalid(res, "Capacity must be null or an integer between 1 and 500");
    return null;
  }
  if (Object.hasOwn(fields, "status") && !STATUSES.includes(fields.status)) {
    invalid(res, "Invalid section status");
    return null;
  }
  if (!creating && !Object.keys(fields).length) {
    invalid(res, "No supported section fields provided");
    return null;
  }
  return fields;
};

export const listSections = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.classId !== undefined) {
      if (!validId(req.query.classId)) return invalid(res, "Invalid class ID");
      const parent = await SchoolClass.findOne({ _id: req.query.classId, tenantId: req.tenantId }).select("_id").lean();
      if (!parent) return res.status(404).json({ success: false, message: "Class not found" });
      filter.classId = req.query.classId;
    }
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) return invalid(res, "Invalid section status filter");
      filter.status = req.query.status;
    }
    const data = await Section.find(filter).sort({ name: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getSection = async (req, res, next) => {
  try {
    if (!validId(req.params.sectionId)) return invalid(res, "Invalid section ID");
    const data = await Section.findOne({ _id: req.params.sectionId, tenantId: req.tenantId }).lean();
    if (!data) return res.status(404).json({ success: false, message: "Section not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createSection = async (req, res, next) => {
  try {
    const fields = validateBody(req.body, res, true);
    if (!fields) return;
    const parent = await SchoolClass.findOne({ _id: fields.classId, tenantId: req.tenantId, status: "active" }).select("_id academicYearId").lean();
    if (!parent) return res.status(400).json({ success: false, message: "Class was not found in this school or is inactive" });
    const data = await Section.create({ ...fields, tenantId: req.tenantId });
    return res.status(201).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
};

export const updateSection = async (req, res, next) => {
  try {
    if (!validId(req.params.sectionId)) return invalid(res, "Invalid section ID");
    const fields = validateBody(req.body, res);
    if (!fields) return;
    const section = await Section.findOne({ _id: req.params.sectionId, tenantId: req.tenantId });
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    if (fields.status === "active") {
      const parent = await SchoolClass.findOne({ _id: section.classId, tenantId: req.tenantId, status: "active" }).select("_id").lean();
      if (!parent) return res.status(409).json({ success: false, message: "A section cannot be activated while its class is inactive" });
    }
    section.set(fields);
    await section.save();
    return res.status(200).json({ success: true, data: section });
  } catch (error) { return handleError(error, res, next); }
};
