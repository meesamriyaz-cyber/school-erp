import dotenv from "dotenv";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";

dotenv.config();

const getAuditMongoUri = () => {
  const uri = process.env.MONGO_TEST_URI?.trim();
  const validScheme = uri?.startsWith("mongodb://") || uri?.startsWith("mongodb+srv://");
  if (!uri || !validScheme) {
    throw new Error("MONGO_TEST_URI must be configured with a valid MongoDB URI. Guardian integrity audit is restricted to the development test database.");
  }

  const authorityAndPath = uri.split("?")[0].slice(uri.indexOf("://") + 3);
  const databaseName = authorityAndPath.includes("/")
    ? authorityAndPath.slice(authorityAndPath.indexOf("/") + 1)
    : "";
  if (!databaseName || !databaseName.toLowerCase().includes("test")) {
    throw new Error("Refusing to audit guardian relationships: MONGO_TEST_URI must target a database whose name includes 'test'.");
  }
  return uri;
};

const run = async () => {
  await mongoose.connect(getAuditMongoUri());
  try {
    const [students, guardians, relationships] = await Promise.all([
      Student.find({}).select("_id tenantId admissionNumber status").lean(),
      Guardian.find({}).select("_id tenantId status").lean(),
      StudentGuardian.find({}).select("_id tenantId studentId guardianId status isPrimary").lean(),
    ]);

    const guardianById = new Map(guardians.map((guardian) => [String(guardian._id), guardian]));
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const activeStudents = students.filter((student) => student.status === "active");
    const linksByStudent = new Map();
    const exceptions = {
      activeStudentsWithoutPrimary: [],
      activeStudentsWithMultiplePrimaries: [],
      primaryRelationshipsWithInactiveGuardian: [],
      relationshipsWithMissingOrCrossTenantRecords: [],
      activeRelationshipsWithInactiveGuardian: [],
    };

    for (const relationship of relationships) {
      const student = studentById.get(String(relationship.studentId));
      const guardian = guardianById.get(String(relationship.guardianId));
      const studentTenantMatches = student && String(student.tenantId) === String(relationship.tenantId);
      const guardianTenantMatches = guardian && String(guardian.tenantId) === String(relationship.tenantId);

      if (!studentTenantMatches || !guardianTenantMatches) {
        exceptions.relationshipsWithMissingOrCrossTenantRecords.push({
          relationshipId: String(relationship._id),
          tenantId: String(relationship.tenantId),
          studentId: String(relationship.studentId),
          guardianId: String(relationship.guardianId),
          studentIssue: !student ? "missing_student" : !studentTenantMatches ? "tenant_mismatch" : null,
          guardianIssue: !guardian ? "missing_guardian" : !guardianTenantMatches ? "tenant_mismatch" : null,
        });
      }

      if (relationship.status === "active" && studentTenantMatches && student.status === "active" && guardian && guardian.status !== "active") {
        exceptions.activeRelationshipsWithInactiveGuardian.push({
          relationshipId: String(relationship._id),
          studentId: String(relationship.studentId),
          guardianId: String(relationship.guardianId),
        });
      }

      if (studentTenantMatches) {
        const key = String(student._id);
        if (!linksByStudent.has(key)) linksByStudent.set(key, []);
        linksByStudent.get(key).push({ relationship, guardian });
      }
    }

    for (const student of activeStudents) {
      const studentLinks = linksByStudent.get(String(student._id)) || [];
      const activePrimaries = studentLinks.filter(({ relationship }) =>
        relationship.status === "active" && relationship.isPrimary === true,
      );
      if (activePrimaries.length === 0) {
        exceptions.activeStudentsWithoutPrimary.push({
          studentId: String(student._id),
          tenantId: String(student.tenantId),
          admissionNumber: student.admissionNumber,
        });
      } else if (activePrimaries.length > 1) {
        exceptions.activeStudentsWithMultiplePrimaries.push({
          studentId: String(student._id),
          tenantId: String(student.tenantId),
          admissionNumber: student.admissionNumber,
          relationshipIds: activePrimaries.map(({ relationship }) => String(relationship._id)),
        });
      }

      for (const { relationship, guardian } of activePrimaries) {
        if (!guardian || guardian.status !== "active") {
          exceptions.primaryRelationshipsWithInactiveGuardian.push({
            studentId: String(student._id),
            relationshipId: String(relationship._id),
            guardianId: String(relationship.guardianId),
            guardianStatus: guardian?.status || "missing",
          });
        }
      }
    }

    const summary = Object.fromEntries(
      Object.entries(exceptions).map(([key, records]) => [key, records.length]),
    );
    const totalExceptions = Object.values(summary).reduce((total, count) => total + count, 0);
    console.log("Guardian integrity audit target: MONGO_TEST_URI (test database)");
    console.log(JSON.stringify({
      readOnly: true,
      studentsChecked: students.length,
      activeStudentsChecked: activeStudents.length,
      guardiansChecked: guardians.length,
      relationshipsChecked: relationships.length,
      summary,
      exceptions,
    }, null, 2));

    if (totalExceptions > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error("Guardian integrity audit failed:", error);
  process.exitCode = 1;
});
