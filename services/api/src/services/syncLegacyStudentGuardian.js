import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";

const splitGuardianName = (value = "") => {
  const parts = value.trim().split(/\\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
};

export const hasLegacyGuardianDetails = (student) =>
  Boolean(student.guardianName?.trim() || student.guardianPhone?.trim() || student.guardianEmail?.trim());

const buildDetails = (student) => {
  const name = splitGuardianName(student.guardianName || "");
  return {
    firstName: name.firstName || "Guardian",
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
    const guardian = await resolveIdentity(student.tenantId, details);
    return { status: guardian ? "matched" : "new_guardian", guardianId: guardian?._id || null };
  } catch (error) {
    if (error.code === "GUARDIAN_IDENTITY_CONFLICT") {
      return { status: "ambiguous", reason: error.message };
    }
    throw error;
  }
};

/**
 * Synchronizes legacy student contact fields with normalized guardian records.
 * The caller supplies a transaction session so the student and relationship
 * writes can commit or roll back together.
 */
export const syncLegacyStudentGuardian = async (student, { session } = {}) => {
  const tenantId = student.tenantId;
  const studentId = student._id;
  let existingQuery = StudentGuardian.findOne({
    tenantId, studentId, source: { $in: ["legacy_student", "manual_and_legacy"] },
  });
  if (session) existingQuery = existingQuery.session(session);
  const existingLink = await existingQuery;

  if (!hasLegacyGuardianDetails(student)) {
    if (existingLink?.status === "active") {
      existingLink.status = "inactive";
      await existingLink.save({ session });
    }
    return null;
  }

  const details = buildDetails(student);
  let guardian = await resolveIdentity(tenantId, details, session);
  if (!guardian) {
    const [created] = await Guardian.create([{ tenantId, ...details }], { session });
    guardian = created;
  }

  if (existingLink && String(existingLink.guardianId) === String(guardian._id)) {
    existingLink.relationship = "other";
    existingLink.status = "active";
    await existingLink.save({ session });
    return { guardian, relationship: existingLink };
  }

  if (existingLink?.status === "active") {
    existingLink.status = "inactive";
    await existingLink.save({ session });
  }

  let pairQuery = StudentGuardian.findOne({ tenantId, studentId, guardianId: guardian._id });
  if (session) pairQuery = pairQuery.session(session);
  const existingPair = await pairQuery;
  if (existingPair) {
    existingPair.status = "active";
    if (existingPair.source === "manual") existingPair.source = "manual_and_legacy";
    await existingPair.save({ session });
    return { guardian, relationship: existingPair };
  }

  let primaryQuery = StudentGuardian.exists({
    tenantId, studentId, status: "active", isPrimary: true,
  });
  if (session) primaryQuery = primaryQuery.session(session);
  const activePrimary = await primaryQuery;

  const [relationship] = await StudentGuardian.create([{
    tenantId, studentId, guardianId: guardian._id, relationship: "other",
    source: "legacy_student", isPrimary: !activePrimary, receivesCommunication: true,
  }], { session });

  return { guardian, relationship };
};
