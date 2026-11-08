import dotenv from "dotenv";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import { previewLegacyStudentGuardian, syncLegacyStudentGuardian } from "../services/syncLegacyStudentGuardian.js";

dotenv.config();

const execute = process.argv.includes("--execute");

const getMigrationMongoUri = () => {
  const uri = process.env.MONGO_TEST_URI?.trim();
  const validScheme = uri?.startsWith("mongodb://") || uri?.startsWith("mongodb+srv://");
  if (!uri || !validScheme) {
    throw new Error("MONGO_TEST_URI must be configured with a valid MongoDB URI. Migration is restricted to the development test database.");
  }
  const authorityAndPath = uri.split("?")[0].slice(uri.indexOf("://") + 3);
  const databaseName = authorityAndPath.includes("/") ? authorityAndPath.slice(authorityAndPath.indexOf("/") + 1) : "";
  if (!databaseName || !databaseName.toLowerCase().includes("test")) {
    throw new Error("Refusing to run guardian migration: MONGO_TEST_URI must target a database whose name includes 'test'.");
  }
  return uri;
};
const hasLegacyDetails = {
  $or: [
    { guardianName: { $exists: true, $nin: ["", null] } },
    { guardianPhone: { $exists: true, $nin: ["", null] } },
    { guardianEmail: { $exists: true, $nin: ["", null] } },
  ],
};

const run = async () => {
  const migrationMongoUri = getMigrationMongoUri();
  console.log("Guardian migration target: MONGO_TEST_URI (test database)");
  await mongoose.connect(migrationMongoUri);
  try {
    const students = await Student.find(hasLegacyDetails).sort({ tenantId: 1, _id: 1 }).lean();
    const report = { total: students.length, matched: 0, newGuardians: 0, ambiguous: 0, skipped: 0, processed: 0, failed: 0 };
    const ambiguousRecords = [];

    for (const student of students) {
      const preview = await previewLegacyStudentGuardian(student);
      if (preview.status === "matched") report.matched += 1;
      else if (preview.status === "new_guardian") report.newGuardians += 1;
      else if (preview.status === "ambiguous") {
        report.ambiguous += 1;
        ambiguousRecords.push({ studentId: String(student._id), tenantId: String(student.tenantId), reason: preview.reason });
      } else report.skipped += 1;
    }

    console.log("Guardian migration preview:", JSON.stringify(report, null, 2));
    if (ambiguousRecords.length) console.log("Manual review required:", JSON.stringify(ambiguousRecords, null, 2));
    if (!execute) {
      console.log("Dry run only. No data was changed. Re-run with --execute to apply non-ambiguous records.");
      return;
    }

    for (const student of students) {
      const preview = await previewLegacyStudentGuardian(student);
      if (preview.status === "ambiguous") { report.failed += 1; continue; }
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await syncLegacyStudentGuardian(student, { session });
        });
        report.processed += 1;
      } catch (error) {
        report.failed += 1;
        console.error(`Failed student ${student._id} (tenant ${student.tenantId}): ${error.message}`);
      } finally { await session.endSession(); }
    }

    console.log("Guardian migration result:", JSON.stringify(report, null, 2));
    if (report.failed) process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
};

run().catch((error) => { console.error("Guardian migration failed:", error); process.exitCode = 1; });
