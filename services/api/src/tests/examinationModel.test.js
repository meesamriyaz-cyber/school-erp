import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Examination from "../models/Examination.js";

const validExamination = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  academicYearId: new mongoose.Types.ObjectId(),
  classId: new mongoose.Types.ObjectId(),
  name: "Mid-Term Examination",
  startDate: new Date("2026-09-01T00:00:00.000Z"),
  endDate: new Date("2026-09-10T00:00:00.000Z"),
  createdBy: new mongoose.Types.ObjectId(),
});

describe("Examination model", () => {
  it("accepts valid details and applies defaults", () => {
    const examination = new Examination(validExamination());
    expect(examination.validateSync()).toBeUndefined();
    expect(examination.status).toBe("draft");
    expect(examination.sectionId).toBeNull();
  });

  it("requires tenant, academic year, class, name, dates and creator", () => {
    for (const field of ["tenantId", "academicYearId", "classId", "name", "startDate", "endDate", "createdBy"]) {
      const examination = new Examination({ ...validExamination(), [field]: undefined });
      expect(examination.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it("trims the examination name and rejects an end date before the start date", () => {
    const examination = new Examination({
      ...validExamination(),
      name: "  Annual Examination  ",
      endDate: new Date("2026-08-31T00:00:00.000Z"),
    });
    expect(examination.name).toBe("Annual Examination");
    expect(examination.validateSync()?.errors.endDate).toBeDefined();
  });

  it("rejects unsupported statuses and overly long names", () => {
    expect(new Examination({ ...validExamination(), status: "archived" }).validateSync()?.errors.status).toBeDefined();
    expect(new Examination({ ...validExamination(), name: "x".repeat(101) }).validateSync()?.errors.name).toBeDefined();
  });

  it("defines tenant-scoped duplicate and listing indexes", () => {
    const indexes = Examination.schema.indexes();
    expect(indexes.some(([keys, options]) => keys.tenantId === 1 && keys.academicYearId === 1 && keys.classId === 1 && options.unique)).toBe(true);
    expect(indexes.some(([keys]) => keys.tenantId === 1 && keys.academicYearId === 1 && keys.classId === 1 && keys.status === 1)).toBe(true);
  });
});
