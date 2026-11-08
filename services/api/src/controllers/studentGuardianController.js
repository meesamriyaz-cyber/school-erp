import mongoose from "mongoose";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian, { RELATIONSHIPS } from "../models/StudentGuardian.js";

const BOOLEAN_FIELDS = ["isPrimary", "isEmergencyContact", "canPickup", "receivesCommunication"];
const invalid = (res, message) => res.status(400).json({ success: false, message });
const handleError = (error, res, next) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "This student-guardian relationship already exists or conflicts with the primary guardian" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more student-guardian fields are invalid");
  return next(error);
};
const findStudent = async (studentId, tenantId) => {
  if (!mongoose.isValidObjectId(studentId)) return { invalidId: true };
  const student = await Student.findOne({ _id: studentId, tenantId }).select("_id").lean();
  return { student };
};

export const listStudentGuardians = async (req, res, next) => {
  try {
    const result = await findStudent(req.params.studentId, req.tenantId);
    if (result.invalidId) return invalid(res, "Invalid student ID");
    if (!result.student) return res.status(404).json({ success: false, message: "Student not found" });
    const links = await StudentGuardian.find({ tenantId: req.tenantId, studentId: result.student._id })
      .sort({ isPrimary: -1, createdAt: 1, _id: 1 })
      .populate({ path: "guardianId", select: "firstName lastName phone email status", match: { tenantId: req.tenantId } }).lean();
    return res.status(200).json({ success: true, data: links });
  } catch (error) { return next(error); }
};

export const createStudentGuardian = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const result = await findStudent(req.params.studentId, req.tenantId);
    if (result.invalidId) return invalid(res, "Invalid student ID");
    if (!result.student) return res.status(404).json({ success: false, message: "Student not found" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide student-guardian relationship details");
    if (Object.hasOwn(body, "tenantId") || Object.hasOwn(body, "studentId")) return invalid(res, "School and student assignment are determined by the request context");
    const allowed = ["guardianId", "relationship", ...BOOLEAN_FIELDS];
    if (Object.keys(body).some((field) => !allowed.includes(field))) return invalid(res, "One or more unsupported relationship fields were provided");
    if (!mongoose.isValidObjectId(body.guardianId)) return invalid(res, "A valid guardian ID is required");
    if (!RELATIONSHIPS.includes(body.relationship)) return invalid(res, "Invalid guardian relationship type");
    for (const field of BOOLEAN_FIELDS) if (body[field] !== undefined && typeof body[field] !== "boolean") return invalid(res, `${field} must be a boolean`);

    let link;
    await session.withTransaction(async () => {
      const guardian = await Guardian.findOne({ _id: body.guardianId, tenantId: req.tenantId, status: "active" }).select("_id").session(session).lean();
      if (!guardian) {
        const error = new Error("Guardian not found");
        error.code = "GUARDIAN_NOT_FOUND";
        throw error;
      }
      const isPrimary = body.isPrimary === true;
      if (isPrimary) {
        await StudentGuardian.updateMany(
          { tenantId: req.tenantId, studentId: result.student._id, status: "active", isPrimary: true },
          { $set: { isPrimary: false } },
          { session },
        );
      }
      [link] = await StudentGuardian.create([{
        tenantId: req.tenantId, studentId: result.student._id, guardianId: guardian._id,
        relationship: body.relationship,
        ...Object.fromEntries(BOOLEAN_FIELDS.filter((field) => body[field] !== undefined).map((field) => [field, body[field]])),
      }], { session });
    });
    return res.status(201).json({ success: true, data: link });
  } catch (error) {
    if (error.code === "GUARDIAN_NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    return handleError(error, res, next);
  } finally { await session.endSession(); }
};

export const updateStudentGuardian = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const result = await findStudent(req.params.studentId, req.tenantId);
    if (result.invalidId) return invalid(res, "Invalid student ID");
    if (!result.student) return res.status(404).json({ success: false, message: "Student not found" });
    if (!mongoose.isValidObjectId(req.params.studentGuardianId)) return invalid(res, "Invalid student-guardian relationship ID");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide student-guardian fields to update");
    const allowed = ["relationship", ...BOOLEAN_FIELDS, "status"];
    if (Object.keys(body).some((field) => !allowed.includes(field))) return invalid(res, "One or more unsupported relationship fields were provided");
    if (!Object.keys(body).length) return invalid(res, "Provide at least one relationship field to update");
    if (Object.hasOwn(body, "relationship") && !RELATIONSHIPS.includes(body.relationship)) return invalid(res, "Invalid guardian relationship type");
    for (const field of BOOLEAN_FIELDS) if (Object.hasOwn(body, field) && typeof body[field] !== "boolean") return invalid(res, `${field} must be a boolean`);
    if (Object.hasOwn(body, "status") && !["active", "inactive"].includes(body.status)) return invalid(res, "Status must be active or inactive");
    if (body.status === "inactive" && body.isPrimary === true) return invalid(res, "A relationship cannot be made primary and inactive at the same time");

    let link;
    let lifecycleError;
    await session.withTransaction(async () => {
      const current = await StudentGuardian.findOne({
        _id: req.params.studentGuardianId, tenantId: req.tenantId, studentId: result.student._id,
      }).session(session);
      if (!current) return;
      if (body.isPrimary === true && (body.status === "inactive" || (current.status === "inactive" && body.status !== "active"))) {
        lifecycleError = "Reactivate this guardian relationship before promoting it to primary";
        return;
      }
      if (body.status === "inactive" && current.status === "active" && current.isPrimary) {
        lifecycleError = "A primary guardian cannot be deactivated until another active guardian is promoted to primary";
        return;
      }
      if (body.isPrimary === false && current.isPrimary && current.status === "active") {
        lifecycleError = "Every student must retain exactly one active primary guardian";
        return;
      }
      if (body.isPrimary === true) {
        const guardian = await Guardian.findOne({ _id: current.guardianId, tenantId: req.tenantId, status: "active" }).session(session).lean();
        if (!guardian) {
          lifecycleError = "An inactive guardian cannot be promoted to primary";
          return;
        }
        await StudentGuardian.updateMany(
          { tenantId: req.tenantId, studentId: result.student._id, status: "active", isPrimary: true, _id: { $ne: current._id } },
          { $set: { isPrimary: false } },
          { session },
        );
      }
      Object.assign(current, body);
      await current.save({ session });
      link = current.toObject();
    });
    if (lifecycleError) return res.status(409).json({ success: false, message: lifecycleError });
    if (!link) return res.status(404).json({ success: false, message: "Student-guardian relationship not found" });
    return res.status(200).json({ success: true, data: link });
  } catch (error) { return handleError(error, res, next); }
  finally { await session.endSession(); }
};
