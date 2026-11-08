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

const auditChanges = (record, updates) => Object.entries(updates)
  .filter(([field, value]) => JSON.stringify(record[field] ?? null) !== JSON.stringify(value ?? null))
  .map(([field, value]) => ({ field, from: record[field] ?? null, to: value ?? null }));

const appendAudit = (record, { action, actorUserId, changes = [] }) => {
  record.auditTrail.push({
    action,
    actorUserId: mongoose.isValidObjectId(actorUserId) ? actorUserId : null,
    changes,
    changedAt: new Date(),
  });
  // Keep the most recent 50 events on each relationship to bound document growth.
  if (record.auditTrail.length > 50) record.auditTrail.splice(0, record.auditTrail.length - 50);
};

const demotePrimaryRelationships = async ({ tenantId, studentId, exceptId = null, actorUserId, session }) => {
  const filter = { tenantId, studentId, status: "active", isPrimary: true };
  if (exceptId) filter._id = { $ne: exceptId };
  const previousPrimaries = await StudentGuardian.find(filter).session(session);
  for (const previous of previousPrimaries) {
    previous.isPrimary = false;
    appendAudit(previous, {
      action: "primary_demoted",
      actorUserId,
      changes: [{ field: "isPrimary", from: true, to: false }],
    });
    await previous.save({ session });
  }
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

      const currentPrimary = await StudentGuardian.findOne({
        tenantId: req.tenantId, studentId: result.student._id, status: "active", isPrimary: true,
      }).session(session).select("_id").lean();
      // Repair a missing primary deterministically when adding the first available active relationship.
      const isPrimary = body.isPrimary === true || !currentPrimary;
      if (isPrimary) {
        await demotePrimaryRelationships({
          tenantId: req.tenantId, studentId: result.student._id, actorUserId: req.auth.userId, session,
        });
      }

      const fields = {
        tenantId: req.tenantId,
        studentId: result.student._id,
        guardianId: guardian._id,
        relationship: body.relationship,
        ...Object.fromEntries(BOOLEAN_FIELDS.filter((field) => body[field] !== undefined && field !== "isPrimary").map((field) => [field, body[field]])),
        isPrimary,
      };
      [link] = await StudentGuardian.create([fields], { session });
      appendAudit(link, {
        action: "created",
        actorUserId: req.auth.userId,
        changes: [
          { field: "relationship", from: null, to: body.relationship },
          { field: "isPrimary", from: null, to: isPrimary },
        ],
      });
      await link.save({ session });
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

      const updates = { ...body };
      if (updates.status === "active" || updates.isPrimary === true) {
        const guardian = await Guardian.findOne({ _id: current.guardianId, tenantId: req.tenantId, status: "active" }).session(session).lean();
        if (!guardian) {
          lifecycleError = "An inactive guardian cannot be linked or promoted";
          return;
        }
        const activePrimary = await StudentGuardian.findOne({
          tenantId: req.tenantId,
          studentId: result.student._id,
          status: "active",
          isPrimary: true,
          _id: { $ne: current._id },
        }).session(session).select("_id").lean();
        if (!activePrimary && !current.isPrimary) updates.isPrimary = true;
      }

      if (updates.isPrimary === true) {
        await demotePrimaryRelationships({
          tenantId: req.tenantId,
          studentId: result.student._id,
          exceptId: current._id,
          actorUserId: req.auth.userId,
          session,
        });
      }

      const wasPrimary = current.isPrimary;
      const changes = auditChanges(current, updates);
      Object.assign(current, updates);
      if (changes.length) {
        let action = "updated";
        if (body.isPrimary === true && !wasPrimary) action = "primary_promoted";
        else if (body.status === "inactive") action = "deactivated";
        else if (body.status === "active") action = "reactivated";
        appendAudit(current, { action, actorUserId: req.auth.userId, changes });
      }
      await current.save({ session });
      link = current.toObject();
    });
    if (lifecycleError) return res.status(409).json({ success: false, message: lifecycleError });
    if (!link) return res.status(404).json({ success: false, message: "Student-guardian relationship not found" });
    return res.status(200).json({ success: true, data: link });
  } catch (error) { return handleError(error, res, next); }
  finally { await session.endSession(); }
};
