import mongoose from "mongoose";
import GradingScale from "../models/GradingScale.js";

const invalid = (res, message) => res.status(400).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);
const allowedFields = new Set(["name", "description", "bands"]);

const validatePayload = (body, { partial = false } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Provide grading-scale details";
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !allowedFields.has(key))) {
    return "Only name, description and bands may be supplied";
  }
  if (!partial && (!Object.hasOwn(body, "name") || !Object.hasOwn(body, "bands"))) {
    return "A grading-scale name and percentage bands are required";
  }
  if (Object.hasOwn(body, "name") && (typeof body.name !== "string" || !body.name.trim())) {
    return "Grading-scale name is required";
  }
  if (Object.hasOwn(body, "description") && typeof body.description !== "string") {
    return "Description must be text";
  }
  if (Object.hasOwn(body, "bands") &&
      (!Array.isArray(body.bands) || body.bands.length === 0 ||
       body.bands.some((band) => !band || typeof band !== "object" || Array.isArray(band) ||
         Object.keys(band).some((key) => !["grade", "minPercentage", "maxPercentage", "description"].includes(key))))) {
    return "Provide one or more valid grading bands";
  }
  return null;
};

const handleModelError = (error, res) => {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: Object.hasOwn(error.keyPattern || {}, "name")
        ? "A grading scale with this name already exists in this school"
        : "This school already has an active grading scale",
    });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return invalid(res, error.message || "One or more grading-scale fields are invalid");
  }
  return null;
};

export const listGradingScales = async (req, res, next) => {
  try {
    const data = await GradingScale.find({ tenantId: req.tenantId })
      .sort({ status: 1, name: 1 })
      .lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const getActiveGradingScale = async (req, res, next) => {
  try {
    const data = await GradingScale.findOne({ tenantId: req.tenantId, status: "active" }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createGradingScale = async (req, res, next) => {
  try {
    const payloadError = validatePayload(req.body);
    if (payloadError) return invalid(res, payloadError);
    const data = await GradingScale.create({
      ...req.body,
      tenantId: req.tenantId,
      status: "draft",
      createdBy: req.auth.userId,
      updatedBy: req.auth.userId,
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleModelError(error, res) || next(error);
  }
};

export const updateGradingScale = async (req, res, next) => {
  try {
    if (!validId(req.params.gradingScaleId)) return invalid(res, "Invalid grading-scale ID");
    const payloadError = validatePayload(req.body, { partial: true });
    if (payloadError) return invalid(res, payloadError);
    const scale = await GradingScale.findOne({
      _id: req.params.gradingScaleId,
      tenantId: req.tenantId,
    });
    if (!scale) return res.status(404).json({ success: false, message: "Grading scale not found" });
    if (scale.status !== "draft") {
      return res.status(409).json({ success: false, message: "Only draft grading scales can be edited" });
    }
    for (const [key, value] of Object.entries(req.body)) scale[key] = value;
    scale.updatedBy = req.auth.userId;
    await scale.save();
    return res.status(200).json({ success: true, data: scale });
  } catch (error) {
    return handleModelError(error, res) || next(error);
  }
};

export const updateGradingScaleStatus = async (req, res, next) => {
  try {
    if (!validId(req.params.gradingScaleId)) return invalid(res, "Invalid grading-scale ID");
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).length !== 1 || !["active", "archived"].includes(req.body.status)) {
      return invalid(res, "Provide status active or archived");
    }
    const scale = await GradingScale.findOne({
      _id: req.params.gradingScaleId,
      tenantId: req.tenantId,
    });
    if (!scale) return res.status(404).json({ success: false, message: "Grading scale not found" });

    const allowed = { draft: ["active"], active: ["archived"], archived: [] };
    if (!allowed[scale.status].includes(req.body.status)) {
      return res.status(409).json({ success: false, message: `Cannot change grading scale from ${scale.status} to ${req.body.status}` });
    }
    scale.status = req.body.status;
    scale.updatedBy = req.auth.userId;
    await scale.save();
    return res.status(200).json({ success: true, data: scale });
  } catch (error) {
    return handleModelError(error, res) || next(error);
  }
};
