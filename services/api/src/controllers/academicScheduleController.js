import mongoose from "mongoose";
import AcademicSchedule from "../models/AcademicSchedule.js";
import AcademicYear from "../models/AcademicYear.js";

const validTime = (value) => typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const invalid = (res, message) => res.status(400).json({ success: false, message });

const validateBlocks = (periods, breaks) => {
  if (!Array.isArray(periods) || periods.length > 20 || !Array.isArray(breaks) || breaks.length > 10) return "Provide up to 20 periods and 10 breaks";
  const numbers = new Set();
  const blocks = [];
  for (const period of periods) {
    if (!Number.isInteger(period.periodNumber) || period.periodNumber < 1 || period.periodNumber > 20 || numbers.has(period.periodNumber)) return "Period numbers must be unique integers from 1 to 20";
    numbers.add(period.periodNumber);
    if (typeof period.label !== "string" || period.label.length > 40 || !validTime(period.startTime) || !validTime(period.endTime) || minutes(period.endTime) <= minutes(period.startTime)) return "Each period needs a valid label and end time after start time";
    blocks.push({ start: minutes(period.startTime), end: minutes(period.endTime), name: `Period ${period.periodNumber}` });
  }
  for (const item of breaks) {
    if (typeof item.label !== "string" || !item.label.trim() || item.label.length > 40 || !validTime(item.startTime) || !validTime(item.endTime) || minutes(item.endTime) <= minutes(item.startTime)) return "Each break needs a name and valid start/end times";
    blocks.push({ start: minutes(item.startTime), end: minutes(item.endTime), name: item.label });
  }
  blocks.sort((a, b) => a.start - b.start);
  for (let i = 1; i < blocks.length; i += 1) if (blocks[i].start < blocks[i - 1].end) return `${blocks[i - 1].name} overlaps with ${blocks[i].name}`;
  return null;
};

export const getAcademicSchedule = async (req, res, next) => {
  try {
    const { academicYearId } = req.query;
    if (!mongoose.isValidObjectId(academicYearId)) return invalid(res, "A valid academicYearId is required");
    const year = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("_id name status").lean();
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found" });
    const schedule = await AcademicSchedule.findOne({ tenantId: req.tenantId, academicYearId }).lean();
    return res.status(200).json({ success: true, data: schedule || { academicYearId, periods: [], breaks: [] } });
  } catch (error) { return next(error); }
};

export const saveAcademicSchedule = async (req, res, next) => {
  try {
    const { academicYearId, periods, breaks } = req.body || {};
    if (!mongoose.isValidObjectId(academicYearId)) return invalid(res, "A valid academicYearId is required");
    const year = await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).select("_id status").lean();
    if (!year) return res.status(404).json({ success: false, message: "Academic year not found" });
    if (year.status === "closed") return res.status(409).json({ success: false, message: "A closed academic year schedule cannot be changed" });
    const validationError = validateBlocks(periods, breaks);
    if (validationError) return invalid(res, validationError);
    const data = await AcademicSchedule.findOneAndUpdate(
      { tenantId: req.tenantId, academicYearId },
      { $set: { periods, breaks, updatedBy: req.auth.userId }, $setOnInsert: { tenantId: req.tenantId, academicYearId } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "The academic schedule was updated concurrently. Reload and try again." });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more academic schedule fields are invalid");
    return next(error);
  }
};
