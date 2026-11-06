import dotenv from "dotenv";
import mongoose from "mongoose";
import env from "../config/env.js";
import Student from "../models/Student.js";
import { syncLegacyStudentGuardian } from "../services/syncLegacyStudentGuardian.js";

dotenv.config();

const execute = process.argv.includes("--execute");

const run = async () => {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is required to run the guardian migration.");
  }

  await mongoose.connect(env.mongoUri);
  try {
    const students = await Student.find({
      $or: [
        { guardianName: { $nin: ["", null] } },
        { guardianPhone: { $nin: ["", null] } },
        { guardianEmail: { $nin: ["", null] } },
      ],
    }).lean();

    console.log(`Found ${students.length} student records with legacy guardian details.`);
    if (!execute) {
      console.log("Dry run only. No data was changed. Re-run with --execute to apply.");
      return;
    }

    let processed = 0;
    let failed = 0;
    for (const student of students) {
      try {
        await syncLegacyStudentGuardian(student);
        processed += 1;
      } catch (error) {
        failed += 1;
        console.error(`Failed student ${student._id} (tenant ${student.tenantId}): ${error.message}`);
      }
    }

    console.log(`Migration complete. Processed: ${processed}; failed: ${failed}.`);
    if (failed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error("Guardian migration failed:", error);
  process.exitCode = 1;
});
