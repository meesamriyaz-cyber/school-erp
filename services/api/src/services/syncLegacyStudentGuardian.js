import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";

const splitGuardianName = (value = "") => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "",
    lastName: parts.join(" "),
  };
};

const hasLegacyGuardianDetails = (student) =>
  Boolean(
    student.guardianName?.trim() ||
    student.guardianPhone?.trim() ||
    student.guardianEmail?.trim()
  );

const findMatchingGuardian = async (tenantId, details) => {
  const identity = details.phone
    ? { phone: details.phone }
    : details.email
      ? { email: details.email.toLowerCase() }
      : { firstName: details.firstName, lastName: details.lastName };

  return Guardian.findOne({ tenantId, ...identity });
};

/**
 * Keeps the legacy guardian fields on Student connected to the normalized
 * Guardian and StudentGuardian collections. The source marker ensures this
 * sync never overwrites relationships entered through the dedicated workflow.
 */
export const syncLegacyStudentGuardian = async (student) => {
  const tenantId = student.tenantId;
  const studentId = student._id;
  const existingLink = await StudentGuardian.findOne({
    tenantId,
    studentId,
    source: "legacy_student",
  });

  if (!hasLegacyGuardianDetails(student)) {
    if (existingLink?.status === "active") {
      existingLink.status = "inactive";
      await existingLink.save();
    }
    return null;
  }

  const name = splitGuardianName(student.guardianName || "");
  const details = {
    firstName: name.firstName || "Guardian",
    lastName: name.lastName,
    phone: student.guardianPhone?.trim() || null,
    email: student.guardianEmail?.trim().toLowerCase() || null,
  };

  let guardian = await findMatchingGuardian(tenantId, details);
  if (!guardian) {
    guardian = await Guardian.create({ tenantId, ...details });
  }

  if (existingLink && String(existingLink.guardianId) === String(guardian._id)) {
    existingLink.relationship = "other";
    existingLink.status = "active";
    await existingLink.save();
    return { guardian, relationship: existingLink };
  }

  if (existingLink?.status === "active") {
    existingLink.status = "inactive";
    await existingLink.save();
  }

  const existingPair = await StudentGuardian.findOne({
    tenantId,
    studentId,
    guardianId: guardian._id,
  });
  if (existingPair) {
    existingPair.relationship = "other";
    existingPair.status = "active";
    await existingPair.save();
    return { guardian, relationship: existingPair };
  }

  const activePrimary = await StudentGuardian.exists({
    tenantId,
    studentId,
    status: "active",
    isPrimary: true,
  });

  const relationship = await StudentGuardian.create({
    tenantId,
    studentId,
    guardianId: guardian._id,
    relationship: "other",
    source: "legacy_student",
    isPrimary: !activePrimary,
    receivesCommunication: true,
  });

  return { guardian, relationship };
};
