import dotenv from "dotenv";
import mongoose from "mongoose";
import env from "../config/env.js";
import Student from "../models/Student.js";
import { previewLegacyStudentGuardian, syncLegacyStudentGuardian } from "../services/syncLegacyStudentGuardian.js";

dotenv.config();

const execute = process.argv.includes("--execute");
const hasLegacyDetails = {
  $or: [
    { guardianName: { $exists: true, $nin: ["", null] } },
    { guardianPhone: { $exists: true, $nin: ["", null] } },
    { guardianEmail: { $exists: true, $nin: ["", null] } },
  ],
};

const run = async () => {
  if (!env.mongoUri) throw new Error("MONGO_URI is required to run the guardian migration.");
  await mongoose.connect(env.mongoUri);
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
