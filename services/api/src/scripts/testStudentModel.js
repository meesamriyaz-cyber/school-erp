
import "dotenv/config";

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import Tenant from "../models/Tenant.js";
import Student from "../models/Student.js";

const runTests = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from services/api/.env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const slugA = `student-test-a-${suffix}`;
  const slugB = `student-test-b-${suffix}`;

  let tenantA;
  let tenantB;

  try {
    // Ensure model indexes, including the unique compound index, exist.
    await Tenant.init();
    await Student.init();

    [tenantA, tenantB] = await Tenant.create([
      {
        name: "Temporary Student Test School A",
        slug: slugA,
        status: "active",
      },
      {
        name: "Temporary Student Test School B",
        slug: slugB,
        status: "active",
      },
    ]);

    const baseStudent = {
      admissionNumber: "2026-001",
      firstName: "Test",
      lastName: "Student",
      admissionDate: new Date("2026-04-01T00:00:00.000Z"),
    };

    const studentA = await Student.create({
      ...baseStudent,
      tenantId: tenantA._id,
    });

    assert.equal(studentA.admissionNumber, "2026-001");
    assert.equal(String(studentA.tenantId), String(tenantA._id));

    // The same admission number is allowed in a different school.
    const studentB = await Student.create({
      ...baseStudent,
      tenantId: tenantB._id,
    });

    assert.equal(studentB.admissionNumber, "2026-001");
    assert.equal(String(studentB.tenantId), String(tenantB._id));

    // But duplicate admission numbers within one school are rejected.
    await assert.rejects(
      Student.create({
        ...baseStudent,
        tenantId: tenantA._id,
        firstName: "Duplicate",
      }),
      (error) => error?.code === 11000
    );

    // A student cannot be saved without a tenant.
    const missingTenantStudent = new Student(baseStudent);

    await assert.rejects(
      missingTenantStudent.validate(),
      (error) => Boolean(error?.errors?.tenantId)
    );

    // Admission numbers are normalized to uppercase.
    const normalizedStudent = await Student.create({
      tenantId: tenantA._id,
      admissionNumber: " lower-001 ",
      firstName: "Normalized",
    });

    assert.equal(normalizedStudent.admissionNumber, "LOWER-001");

    console.log("Student model tests passed.");
    console.log("- Tenant is required.");
    console.log("- Admission numbers are unique within a school.");
    console.log("- Different schools can reuse admission numbers.");
    console.log("- Admission numbers are normalized.");
  } finally {
    // Remove only records created by this test.
    await Student.deleteMany({
      tenantId: { $in: [tenantA?._id, tenantB?._id].filter(Boolean) },
    });

    if (tenantA?._id) {
      await Tenant.deleteOne({ _id: tenantA._id, slug: slugA });
    }

    if (tenantB?._id) {
      await Tenant.deleteOne({ _id: tenantB._id, slug: slugB });
    }

    await mongoose.disconnect();
  }
};

try {
  await runTests();
} catch (error) {
  console.error("Student model tests failed:", error);
  process.exitCode = 1;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
