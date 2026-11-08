import mongoose from "mongoose";
import AcademicTerm from "../models/AcademicTerm.js";
import AcademicYear from "../models/AcademicYear.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const dayStart = (value) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const pick = (body, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
const validateBody = (body, res, creating = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.hasOwn(body, "tenantId") || Object.hasOwn(body, "createdBy") || Object.hasOwn(body, "updatedBy")) {
    invalid(res, "Provide valid academic-term details; school and audit fields are server-controlled"); return null;
  }
  const fields = pick(body, creating ? ["academicYearId", "name", "startDate", "endDate"] : ["name", "startDate", "endDate", "status"]);
  if (creating && !validId(fields.academicYearId)) { invalid(res, "A valid academic year is required"); return null; }
  if (Object.hasOwn(fields, "name") && (typeof fields.name !== "string" || !fields.name.trim() || fields.name.trim().length > 80)) { invalid(res, "Term name is required and must be at most 80 characters"); return null; }
  for (const key of ["startDate", "endDate"]) if (Object.hasOwn(fields, key) && !Number.isFinite(new Date(fields[key]).getTime())) { invalid(res, `Invalid ${key}`); return null; }
  if (Object.hasOwn(fields, "status") && !["draft", "active", "completed", "cancelled"].includes(fields.status)) { invalid(res, "Invalid term status"); return null; }
  if (!creating && !Object.keys(fields).length) { invalid(res, "No supported term fields provided"); return null; }
  return fields;
};
const checkRangeAndOverlap = async ({ tenantId, year, startDate, endDate, excludeId, session }) => {
  const start = dayStart(startDate), end = dayStart(endDate);
  if (end < start || start < dayStart(year.startDate) || end > dayStart(year.endDate)) {
    const error = new Error("Term dates must be an inclusive range within the academic year"); error.code = "TERM_OUTSIDE_YEAR"; throw error;
  }
  const overlap = await AcademicTerm.exists({
    tenantId, academicYearId: year._id, status: { $ne: "cancelled" },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    startDate: { $lt: new Date(end.getTime() + 86400000) }, endDate: { $gte: start },
  }).session(session);
  if (overlap) { const error = new Error("Academic terms cannot overlap within the same academic year"); error.code = "TERM_OVERLAP"; throw error; }
};
const handle = (error, res, next) => {
  const statuses = {
    TERM_OUTSIDE_YEAR: [400, "Term dates must be an inclusive range within the academic year"],
    TERM_OVERLAP: [409, "Academic terms cannot overlap within the same academic year"],
    TERM_YEAR_CLOSED: [409, "Terms cannot be changed after the academic year is closed"],
    TERM_LIFECYCLE: [409, "Invalid academic-term lifecycle transition or the term is locked"],
    TERM_NOT_FOUND: [404, "Academic term not found"],
  };
  if (statuses[error.code]) return res.status(statuses[error.code][0]).json({ success: false, message: statuses[error.code][1] });
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A term with this name already exists or another term is already active" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more academic-term fields are invalid");
  return next(error);
};

export const listAcademicTerms = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.academicYearId !== undefined) {
      if (!validId(req.query.academicYearId)) return invalid(res, "Invalid academicYearId");
      if (!await AcademicYear.exists({ _id: req.query.academicYearId, tenantId: req.tenantId })) return res.status(404).json({ success: false, message: "Academic year not found" });
      filter.academicYearId = req.query.academicYearId;
    }
    if (req.query.status !== undefined) {
      if (!["draft", "active", "completed", "cancelled"].includes(req.query.status)) return invalid(res, "Invalid term status filter");
      filter.status = req.query.status;
    }
    const data = await AcademicTerm.find(filter).sort({ startDate: 1, _id: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createAcademicTerm = async (req, res, next) => {
  const fields = validateBody(req.body, res, true);
  if (!fields) return;
  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const year = await AcademicYear.findOneAndUpdate(
        { _id: fields.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id startDate endDate status").lean();
      if (!year) { const error = new Error("Terms cannot be created for a missing or closed academic year"); error.code = "TERM_YEAR_CLOSED"; throw error; }
      await checkRangeAndOverlap({ tenantId: req.tenantId, year, startDate: fields.startDate, endDate: fields.endDate, session });
      [created] = await AcademicTerm.create([{
        ...fields, name: fields.name.trim(), tenantId: req.tenantId,
        createdBy: req.auth.userId, updatedBy: req.auth.userId,
      }], { session });
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) { return handle(error, res, next); }
  finally { await session.endSession(); }
};

export const updateAcademicTerm = async (req, res, next) => {
  if (!validId(req.params.termId)) return invalid(res, "Invalid term ID");
  const fields = validateBody(req.body, res);
  if (!fields) return;
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const term = await AcademicTerm.findOne({ _id: req.params.termId, tenantId: req.tenantId }).session(session);
      if (!term) { const error = new Error("Academic term not found"); error.code = "TERM_NOT_FOUND"; throw error; }
      const year = await AcademicYear.findOneAndUpdate(
        { _id: term.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id startDate endDate status").lean();
      if (!year) { const error = new Error("Terms cannot be changed after the academic year is closed"); error.code = "TERM_YEAR_CLOSED"; throw error; }
      if (["completed", "cancelled"].includes(term.status) && Object.keys(fields).some((key) => key !== "status" || fields.status !== term.status)) {
        const error = new Error("Completed or cancelled terms cannot be edited or reopened"); error.code = "TERM_LIFECYCLE"; throw error;
      }
      const transitions = { draft: ["active", "cancelled"], active: ["completed", "cancelled"], completed: [], cancelled: [] };
      if (fields.status && fields.status !== term.status && !transitions[term.status]?.includes(fields.status)) {
        const error = new Error("Invalid academic-term lifecycle transition"); error.code = "TERM_LIFECYCLE"; throw error;
      }
      if (fields.status === "active" && year.status !== "active") {
        const error = new Error("An academic term can only be activated while its academic year is active"); error.code = "TERM_YEAR_CLOSED"; throw error;
      }
      const nextStart = fields.startDate ?? term.startDate, nextEnd = fields.endDate ?? term.endDate;
      if (Object.hasOwn(fields, "startDate") || Object.hasOwn(fields, "endDate")) await checkRangeAndOverlap({
        tenantId: req.tenantId, year, startDate: nextStart, endDate: nextEnd, excludeId: term._id, session,
      });
      term.set(fields); term.updatedBy = req.auth.userId;
      await term.save({ session }); updated = term;
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) { return handle(error, res, next); }
  finally { await session.endSession(); }
};
