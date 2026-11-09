import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";

const splitGuardianName = (value = "") => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
};

export const hasLegacyGuardianDetails = (student) =>
  Boolean(student.guardianName?.trim());

const buildDetails = (student) => {
  const name = splitGuardianName(student.guardianName || "");
  return {
    firstName: name.firstName,
    lastName: name.lastName,
    phone: student.guardianPhone?.trim() || null,
    email: student.guardianEmail?.trim().toLowerCase() || null,
  };
};

const findIdentityMatches = async (tenantId, details, session) => {
  const clauses = [];
  if (details.phone) clauses.push({ phone: details.phone });
  if (details.email) clauses.push({ email: details.email });
  if (!clauses.length) return [];
  let query = Guardian.find({ tenantId, $or: clauses });
  if (session) query = query.session(session);
  return query.lean();
};

const resolveIdentity = async (tenantId, details, session) => {
  const matches = await findIdentityMatches(tenantId, details, session);
  const unique = [...new Map(matches.map((guardian) => [String(guardian._id), guardian])).values()];
  if (unique.length > 1) {
    const error = new Error("Legacy guardian phone and email identify different guardian records; manual review is required");
    error.code = "GUARDIAN_IDENTITY_CONFLICT";
    throw error;
  }
  const guardian = unique[0] || null;
  if (guardian && details.phone && guardian.phone && guardian.phone !== details.phone) {
    const error = new Error("Legacy guardian phone conflicts with the matched guardian record");
    error.code = "GUARDIAN_IDENTITY_CONFLICT";
    throw error;
  }
  if (guardian && details.email && guardian.email && guardian.email.toLowerCase() !== details.email) {
    const error = new Error("Legacy guardian email conflicts with the matched guardian record");
    error.code = "GUARDIAN_IDENTITY_CONFLICT";
    throw error;
  }
  return guardian;
};

export const previewLegacyStudentGuardian = async (student) => {
  if (!hasLegacyGuardianDetails(student)) return { status: "skipped", reason: "no_legacy_details" };
  const details = buildDetails(student);
  try {
    let guardian = await resolveIdentity(student.tenantId, details);
    if (!guardian && !details.phone && !details.email) {
      const existingLink = await StudentGuardian.findOne({ tenantId: student.tenantId, studentId: student._id, source: { $in: ["legacy_student", "manual_and_legacy"] } });
      if (existingLink) guardian = await Guardian.findOne({ _id: existingLink.guardianId, tenantId: student.tenantId }).lean();
    }
    return { status: guardian ? "matched" : "new_guardian", guardianId: guardian?._id || null };
  } catch (error) {
    if (error.code === "GUARDIAN_IDENTITY_CONFLICT") return { status: "ambiguous", reason: error.message };
    throw error;
  }
};

/**
 * Synchronizes the guardian captured on the student profile as the active primary
 * guardian. Caller must pass a transaction session.
 */
const appendRelationshipAudit = (record, { action, actorUserId, changes = [] }) => {
  record.auditTrail.push({ action, actorUserId: actorUserId || null, changes, changedAt: new Date() });
  if (record.auditTrail.length > 50) record.auditTrail.splice(0, record.auditTrail.length - 50);
};

export const syncLegacyStudentGuardian = async (student, { session, actorUserId = null } = {}) => {
  if (!hasLegacyGuardianDetails(student)) {
    const error = new Error("A primary guardian name is required for every student");
    error.code = "PRIMARY_GUARDIAN_REQUIRED";
    throw error;
  }
  const tenantId = student.tenantId;
  const studentId = student._id;
  const details = buildDetails(student);
  let guardian = await resolveIdentity(tenantId, details, session);
  let existingLegacyQuery = StudentGuardian.findOne({ tenantId, studentId, source: { $in: ["legacy_student", "manual_and_legacy"] } });
  if (session) existingLegacyQuery = existingLegacyQuery.session(session);
  const existingLegacyLink = await existingLegacyQuery;
  if (!guardian && !details.phone && !details.email && existingLegacyLink) {
    let linkedGuardianQuery = Guardian.findOne({ _id: existingLegacyLink.guardianId, tenantId });
    if (session) linkedGuardianQuery = linkedGuardianQuery.session(session);
    guardian = await linkedGuardianQuery;
  }
  if (!guardian) {
    const [created] = await Guardian.create([{ tenantId, ...details }], { session });
    guardian = created;
  }
  if (guardian.status !== "active") {
    const error = new Error("The selected primary guardian is inactive");
    error.code = "PRIMARY_GUARDIAN_INACTIVE";
    throw error;
  }

  const relationshipType = student.guardianRelationship || "other";
  let pairQuery = StudentGuardian.findOne({ tenantId, studentId, guardianId: guardian._id });
  if (session) pairQuery = pairQuery.session(session);
  const existingPair = await pairQuery;

  // Demote any previous primary before promoting/reaffirming this guardian.
  let previousPrimariesQuery = StudentGuardian.find({
    tenantId, studentId, status: "active", isPrimary: true,
    ...(existingPair ? { _id: { $ne: existingPair._id } } : {}),
  });
  if (session) previousPrimariesQuery = previousPrimariesQuery.session(session);
  const previousPrimaries = await previousPrimariesQuery;
  for (const previous of previousPrimaries) {
    const hadPortalAccess = previous.canAccessPortal === true;
    previous.isPrimary = false;
    previous.canAccessPortal = false;
    appendRelationshipAudit(previous, {
      action: "primary_demoted",
      actorUserId,
      changes: [
        { field: "isPrimary", from: true, to: false },
        ...(hadPortalAccess ? [{ field: "canAccessPortal", from: true, to: false }] : []),
      ],
    });
    await previous.save({ session });
  }

  if (existingPair) {
    const changes = [];
    if (existingPair.relationship !== relationshipType) {
      changes.push({ field: "relationship", from: existingPair.relationship, to: relationshipType });
    }
    if (existingPair.status !== "active") {
      changes.push({ field: "status", from: existingPair.status, to: "active" });
    }
    if (!existingPair.isPrimary) {
      changes.push({ field: "isPrimary", from: false, to: true });
    }
    if (existingPair.canAccessPortal !== true) {
      changes.push({ field: "canAccessPortal", from: existingPair.canAccessPortal ?? false, to: true });
    }
    existingPair.relationship = relationshipType;
    existingPair.status = "active";
    existingPair.isPrimary = true;
    existingPair.canAccessPortal = true;
    if (existingPair.source === "manual") existingPair.source = "manual_and_legacy";
    if (changes.length) {
      appendRelationshipAudit(existingPair, {
        action: changes.some((change) => change.field === "isPrimary") ? "primary_promoted" : "updated",
        actorUserId,
        changes,
      });
    }
    await existingPair.save({ session });
    return { guardian, relationship: existingPair };
  }

  const [relationship] = await StudentGuardian.create([{
    tenantId, studentId, guardianId: guardian._id, relationship: relationshipType,
    source: "legacy_student", isPrimary: true, canAccessPortal: true, receivesCommunication: true,
    auditTrail: [{
      action: "created",
      actorUserId,
      changes: [
        { field: "relationship", from: null, to: relationshipType },
        { field: "isPrimary", from: null, to: true },
        { field: "canAccessPortal", from: null, to: true },
      ],
      changedAt: new Date(),
    }],
  }], { session });
  return { guardian, relationship };
};
