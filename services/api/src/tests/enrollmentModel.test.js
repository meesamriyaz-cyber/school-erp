import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Enrollment from "../models/Enrollment.js";

const validEnrollment = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  studentId: new mongoose.Types.ObjectId(),
  academicYearId: new mongoose.Types.ObjectId(),
  classId: new mongoose.Types.ObjectId(),
});

describe("Enrollment model", () => {
  it("accepts a valid placement and defaults to active without a section", () => {
    const enrollment = new Enrollment(validEnrollment());
    expect(enrollment.validateSync()).toBeUndefined();
    expect(enrollment.status).toBe("active");
    expect(enrollment.sectionId).toBeNull();
    expect(enrollment.endedAt).toBeNull();
  });

  it("requires school, student, year, and class references", () => {
    const enrollment = new Enrollment({ ...validEnrollment(), tenantId: undefined, studentId: undefined, academicYearId: undefined, classId: undefined });
    const errors = enrollment.validateSync().errors;
    expect(errors.tenantId).toBeDefined();
    expect(errors.studentId).toBeDefined();
    expect(errors.academicYearId).toBeDefined();
    expect(errors.classId).toBeDefined();
  });

  it("rejects unsupported statuses", () => {
    const enrollment = new Enrollment({ ...validEnrollment(), status: "paused" });
    expect(enrollment.validateSync()?.errors.status).toBeDefined();
  });

  it("retains terminal status and end date fields for history", () => {
    const enrollment = new Enrollment({ ...validEnrollment(), status: "transferred", endedAt: new Date("2027-01-15T00:00:00Z") });
    expect(enrollment.validateSync()).toBeUndefined();
    expect(enrollment.endedAt.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("defines a partial unique index for one active placement per student and school", () => {
    expect(Enrollment.schema.indexes()).toEqual(expect.arrayContaining([
      [{ tenantId: 1, studentId: 1 }, expect.objectContaining({
        unique: true,
        partialFilterExpression: { status: "active" },
        name: "one_active_enrollment_per_student",
      })],
    ]));
  });

  it("keeps placement references immutable", () => {
    for (const field of ["tenantId", "studentId", "academicYearId", "classId", "sectionId"]) {
      expect(Enrollment.schema.path(field).options.immutable).toBe(true);
    }
  });
});
