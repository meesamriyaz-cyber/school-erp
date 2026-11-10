import mongoose from "mongoose";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Student from "../models/Student.js";

const CREATE_FIELDS = ["firstName", "lastName", "phone", "email"];
const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];
const invalid = (res, message) => res.status(400).json({ success: false, message });
const appendRelationshipAudit = (record, actorUserId) => {
  record.auditTrail.push({
    action: "deactivated",
    actorUserId,
    changes: [{ field: "status", from: "active", to: "inactive" }],
    changedAt: new Date(),
  });
  if (record.auditTrail.length > 50) record.auditTrail.splice(0, record.auditTrail.length - 50);
};
const pick = (body, allowed) => Object.fromEntries(
  allowed.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]),
);
const handleError = (error, res, next) => {
  if (error.code === "PRIMARY_GUARDIAN_IN_USE") return res.status(409).json({ success: false, message: error.message });
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A matching guardian record already exists" });
  if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more guardian fields are invalid");
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

const escapeRegex = (value) => value.split("").map((character) => {
  const specialCharacters = ".*+?^${}()|[]\\";
  return specialCharacters.includes(character) ? String.fromCharCode(92) + character : character;
}).join("");

export const listGuardians = async (req, res, next) => {
  try {
    const pageValue = req.query.page ?? "1";
    const limitValue = req.query.limit ?? "20";
    if (typeof pageValue !== "string" || !/^\d+$/.test(pageValue)) return invalid(res, "Page must be a positive integer");
    if (typeof limitValue !== "string" || !/^\d+$/.test(limitValue)) return invalid(res, "Limit must be between 1 and 100");
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || page < 1) return invalid(res, "Page must be a positive integer");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return invalid(res, "Limit must be between 1 and 100");

    const filter = { tenantId: req.tenantId };
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== "string" || !["active", "inactive"].includes(req.query.status)) {
        return invalid(res, "Status must be active or inactive");
      }
      filter.status = req.query.status;
    }
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== "string" || req.query.search.trim().length > 100) {
        return invalid(res, "Search must not exceed 100 characters");
      }
      const search = req.query.search.trim();
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [
          { firstName: pattern },
          { lastName: pattern },
          { phone: pattern },
          { email: pattern },
        ];
      }
    }

    const [guardians, total] = await Promise.all([
      Guardian.find(filter)
        .select("_id firstName lastName phone email status userId")
        .sort({ firstName: 1, lastName: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Guardian.countDocuments(filter),
    ]);
    return res.status(200).json({
      success: true,
      data: guardians,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) { return next(error); }
};

export const createGuardian = async (req, res, next) => {
  try {
    const fields = validateBody(req.body, res, CREATE_FIELDS);
    if (!fields) return;
    if (typeof fields.firstName !== "string" || !fields.firstName.trim()) return invalid(res, "Guardian first name is required");
    for (const field of ["lastName", "phone", "email"]) {
      if (fields[field] !== undefined && fields[field] !== null && typeof fields[field] !== "string") return invalid(res, `${field} must be a string`);
    }
    const guardian = await Guardian.create({ ...fields, tenantId: req.tenantId });
    return res.status(201).json({ success: true, data: guardian });
  } catch (error) { return handleError(error, res, next); }
};

export const getGuardian = async (req, res, next) => {
  try {
    const { guardianId } = req.params;
    if (!mongoose.isValidObjectId(guardianId)) return invalid(res, "Invalid guardian ID");
    const guardian = await Guardian.findOne({ _id: guardianId, tenantId: req.tenantId }).lean();
    if (!guardian) return res.status(404).json({ success: false, message: "Guardian not found" });
    const relationships = await StudentGuardian.find({ tenantId: req.tenantId, guardianId: guardian._id })
      .sort({ status: 1, createdAt: 1, _id: 1 })
      .populate({ path: "studentId", select: "firstName lastName admissionNumber status", match: { tenantId: req.tenantId } })
      .lean();
    const linkedStudents = relationships.filter((relationship) => relationship.studentId).map((relationship) => ({
      _id: relationship._id, relationship: relationship.relationship, isPrimary: relationship.isPrimary,
      isEmergencyContact: relationship.isEmergencyContact, canPickup: relationship.canPickup,
      receivesCommunication: relationship.receivesCommunication, canAccessPortal: relationship.canAccessPortal,
      status: relationship.status, student: relationship.studentId,
    }));
    return res.status(200).json({ success: true, data: { ...guardian, linkedStudents } });
  } catch (error) { return next(error); }
};

export const updateGuardian = async (req, res, next) => {
  try {
    const { guardianId } = req.params;
    if (!mongoose.isValidObjectId(guardianId)) return invalid(res, "Invalid guardian ID");
    const updates = validateBody(req.body, res, UPDATE_FIELDS);
    if (!updates) return;
    if (Object.keys(updates).length === 0) return invalid(res, "Provide at least one guardian field to update");
    if (Object.hasOwn(updates, "firstName") && (typeof updates.firstName !== "string" || !updates.firstName.trim())) return invalid(res, "Guardian first name cannot be empty");
    for (const field of ["lastName", "phone", "email"]) {
      if (updates[field] !== undefined && updates[field] !== null && typeof updates[field] !== "string") return invalid(res, `${field} must be a string`);
    }

    const session = await mongoose.startSession();
    let guardian;
    try {
      await session.withTransaction(async () => {
        guardian = await Guardian.findOneAndUpdate(
          { _id: guardianId, tenantId: req.tenantId },
          { $set: updates },
          { new: true, runValidators: true, session },
        ).lean();
        if (!guardian) return;
        if (updates.status === "inactive") {
          const activePrimary = await StudentGuardian.exists({ tenantId: req.tenantId, guardianId: guardian._id, status: "active", isPrimary: true }).session(session);
          if (activePrimary) {
            const error = new Error("This guardian is the primary guardian for an active student relationship. Promote a replacement first.");
            error.code = "PRIMARY_GUARDIAN_IN_USE";
            throw error;
          }
          const activeRelationships = await StudentGuardian.find({
            tenantId: req.tenantId,
            guardianId: guardian._id,
            status: "active",
          }).session(session);
          for (const relationship of activeRelationships) {
            relationship.status = "inactive";
            appendRelationshipAudit(relationship, req.auth.userId);
            await relationship.save({ session });
          }
        }

        const contactFieldsChanged = ["firstName", "lastName", "phone", "email"].some((field) => Object.hasOwn(updates, field));
        if (contactFieldsChanged) {
          const legacyLinks = await StudentGuardian.find({
            tenantId: req.tenantId,
            guardianId: guardian._id,
            source: { $in: ["legacy_student", "manual_and_legacy"] },
          }).select("studentId").session(session).lean();

          if (legacyLinks.length) {
            const guardianName = [guardian.firstName, guardian.lastName].filter(Boolean).join(" ");
            await Student.updateMany(
              { tenantId: req.tenantId, _id: { $in: legacyLinks.map((link) => link.studentId) } },
              { $set: { guardianName, guardianPhone: guardian.phone || null, guardianEmail: guardian.email || null } },
              { session },
            );
          }
        }
      });
    } finally { await session.endSession(); }

    if (!guardian) return res.status(404).json({ success: false, message: "Guardian not found" });
    return res.status(200).json({ success: true, data: guardian });
  } catch (error) { return handleError(error, res, next); }
};
