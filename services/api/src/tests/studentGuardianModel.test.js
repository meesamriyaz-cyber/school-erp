import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import StudentGuardian from "../models/StudentGuardian.js";

const validLink = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  studentId: new mongoose.Types.ObjectId(),
  guardianId: new mongoose.Types.ObjectId(),
  relationship: "father",
});

describe("StudentGuardian model", () => {
  it("accepts a valid student-guardian relationship", () => {
    const link = new StudentGuardian(validLink());

    expect(link.validateSync()).toBeUndefined();
    expect(link.status).toBe("active");
    expect(link.isPrimary).toBe(false);
    expect(link.isEmergencyContact).toBe(false);
    expect(link.canPickup).toBe(false);
    expect(link.receivesCommunication).toBe(true);
  });

  it("requires tenant, student and guardian references", () => {
    const link = new StudentGuardian({
      ...validLink(),
      tenantId: undefined,
      studentId: undefined,
      guardianId: undefined,
    });

    const errors = link.validateSync().errors;

    expect(errors.tenantId).toBeDefined();
    expect(errors.studentId).toBeDefined();
    expect(errors.guardianId).toBeDefined();
  });

  it("requires a valid relationship type", () => {
    const link = new StudentGuardian({
      ...validLink(),
      relationship: "unknown",
    });

    expect(link.validateSync()?.errors.relationship).toBeDefined();
  });

  it("supports the defined relationship types", () => {
    const relationships = [
      "mother",
      "father",
      "legal_guardian",
      "grandparent",
      "step_parent",
      "sibling",
      "other",
    ];

    for (const relationship of relationships) {
      const link = new StudentGuardian({
        ...validLink(),
        relationship,
      });

      expect(link.validateSync()).toBeUndefined();
    }
  });

  it("rejects unsupported relationship status", () => {
    const link = new StudentGuardian({
      ...validLink(),
      status: "deleted",
    });

    expect(link.validateSync()?.errors.status).toBeDefined();
  });

  it("keeps school and relationship references immutable", () => {
    for (const field of ["tenantId", "studentId", "guardianId"]) {
      expect(
        StudentGuardian.schema.path(field).options.immutable,
      ).toBe(true);
    }
  });

  it("prevents duplicate links for the same student and guardian", () => {
    expect(StudentGuardian.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { tenantId: 1, studentId: 1, guardianId: 1 },
          expect.objectContaining({ unique: true }),
        ],
      ]),
    );
  });

  it("allows only one active primary guardian per student", () => {
    expect(StudentGuardian.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { tenantId: 1, studentId: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: {
              isPrimary: true,
              status: "active",
            },
          }),
        ],
      ]),
    );
  });
});