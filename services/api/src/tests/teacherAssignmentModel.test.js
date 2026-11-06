import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import TeacherAssignment from "../models/TeacherAssignment.js";

const valid = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  teacherId: new mongoose.Types.ObjectId(),
  subjectId: new mongoose.Types.ObjectId(),
  academicYearId: new mongoose.Types.ObjectId(),
  classId: new mongoose.Types.ObjectId(),
  assignedBy: new mongoose.Types.ObjectId(),
});

describe("TeacherAssignment model", () => {
  it("accepts valid assignment references and defaults", () => {
    const assignment = new TeacherAssignment(valid());
    expect(assignment.validateSync()).toBeUndefined();
    expect(assignment.status).toBe("active");
    expect(assignment.sectionId).toBeNull();
  });
  it("requires all school, teacher, subject, year, class and actor references", () => {
    for (const field of ["tenantId", "teacherId", "subjectId", "academicYearId", "classId", "assignedBy"]) {
      const value = valid();
      delete value[field];
      expect(new TeacherAssignment(value).validateSync()?.errors[field]).toBeDefined();
    }
  });
  it("rejects unsupported assignment statuses", () => {
    expect(new TeacherAssignment({ ...valid(), status: "pending" }).validateSync()?.errors.status).toBeDefined();
  });
  it("defines a tenant-scoped unique assignment index", () => {
    const indexes = TeacherAssignment.schema.indexes();
    expect(indexes.some(([keys, options]) =>
      keys.tenantId === 1 && keys.teacherId === 1 && keys.subjectId === 1 &&
      keys.academicYearId === 1 && keys.classId === 1 && keys.sectionId === 1 && options.unique
    )).toBe(true);
  });
});
