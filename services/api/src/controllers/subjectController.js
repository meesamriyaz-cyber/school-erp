import mongoose from "mongoose";
import Subject from "../models/Subject.js";

const CATEGORIES = ["core", "elective"];
const STATUSES = ["active", "inactive"];
const CREATE_FIELDS = ["name", "code", "description", "category", "status"];
const UPDATE_FIELDS = CREATE_FIELDS;
const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const pick = (body, fields) => Object.fromEntries(
  fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]])
);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateBody = (body, res, creating = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid(res, "Provide subject details");
    return null;
  }
  if (Object.hasOwn(body, "tenantId")) {
    invalid(res, "School assignment is determined by the authenticated account");
    return null;
  }
  const fields = pick(body, creating ? CREATE_FIELDS : UPDATE_FIELDS);
  if (creating && (typeof fields.name !== "string" || !fields.name.trim())) {
    invalid(res, "Subject name is required");
    return null;
  }
  if (Object.hasOwn(fields, "name") && (typeof fields.name !== "string" || !fields.name.trim())) {
    invalid(res, "Subject name is required");
    return null;
  }
  if (Object.hasOwn(fields, "code") && (typeof fields.code !== "string" || fields.code.trim().length > 20)) {
    invalid(res, "Subject code must be a string of at most 20 characters");
    return null;
  }
  if (Object.hasOwn(fields, "description") && (typeof fields.description !== "string" || fields.description.trim().length > 500)) {
    invalid(res, "Description must be a string of at most 500 characters");
    return null;
  }
  if (Object.hasOwn(fields, "category") && !CATEGORIES.includes(fields.category)) {
    invalid(res, "Invalid subject category");
    return null;
  }
  if (Object.hasOwn(fields, "status") && !STATUSES.includes(fields.status)) {
    invalid(res, "Invalid subject status");
    return null;
  }
  if (!creating && !Object.keys(fields).length) {
    invalid(res, "No supported subject fields provided");
    return null;
  }
  return fields;
};

const handleError = (error, res, next) => {
  if (error.code === 11000) {
    const duplicateCode = error.keyPattern?.code === 1;
    return res.status(409).json({
      success: false,
      message: duplicateCode
        ? "A subject with this code already exists in this school"
        : "A subject with this name already exists in this school",
    });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return invalid(res, "One or more subject fields are invalid");
  }
  return next(error);
};

export const listSubjects = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) return invalid(res, "Invalid subject status filter");
      filter.status = req.query.status;
    }
    if (req.query.category !== undefined) {
      if (!CATEGORIES.includes(req.query.category)) return invalid(res, "Invalid subject category filter");
      filter.category = req.query.category;
    }
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== "string" || req.query.search.trim().length > 100) {
        return invalid(res, "Search must be at most 100 characters");
      }
      const expression = new RegExp(escapeRegex(req.query.search.trim()), "i");
      filter.$or = [{ name: expression }, { code: expression }];
    }
    const data = await Subject.find(filter).sort({ name: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const getSubject = async (req, res, next) => {
  try {
    if (!validId(req.params.subjectId)) return invalid(res, "Invalid subject ID");
    const data = await Subject.findOne({ _id: req.params.subjectId, tenantId: req.tenantId }).lean();
    if (!data) return res.status(404).json({ success: false, message: "Subject not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createSubject = async (req, res, next) => {
  try {
    const fields = validateBody(req.body, res, true);
    if (!fields) return;
    const data = await Subject.create({ ...fields, tenantId: req.tenantId });
    return res.status(201).json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
};

export const updateSubject = async (req, res, next) => {
  try {
    if (!validId(req.params.subjectId)) return invalid(res, "Invalid subject ID");
    const fields = validateBody(req.body, res);
    if (!fields) return;
    const subject = await Subject.findOne({ _id: req.params.subjectId, tenantId: req.tenantId });
    if (!subject) return res.status(404).json({ success: false, message: "Subject not found" });
    subject.set(fields);
    await subject.save();
    return res.status(200).json({ success: true, data: subject });
  } catch (error) { return handleError(error, res, next); }
};
