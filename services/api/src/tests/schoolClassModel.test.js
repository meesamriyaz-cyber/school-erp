import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import SchoolClass from "../models/SchoolClass.js";

const validClass = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  academicYearId: new mongoose.Types.ObjectId(),
  name: "Class 1",
});

describe("SchoolClass model", () => {
  it("accepts valid class details and defaults status and sort order", () => {
    const schoolClass = new SchoolClass(validClass());

    expect(schoolClass.validateSync()).toBeUndefined();
    expect(schoolClass.status).toBe("active");
    expect(schoolClass.sortOrder).toBe(0);
  });

  it("requires a school tenant", () => {
    const schoolClass = new SchoolClass({ ...validClass(), tenantId: undefined });
    expect(schoolClass.validateSync()?.errors.tenantId).toBeDefined();
  });

  it("requires an academic year", () => {
    const schoolClass = new SchoolClass({ ...validClass(), academicYearId: undefined });
    expect(schoolClass.validateSync()?.errors.academicYearId).toBeDefined();
  });

  it("requires a class name", () => {
    const schoolClass = new SchoolClass({ ...validClass(), name: "  " });
    expect(schoolClass.validateSync()?.errors.name).toBeDefined();
  });

  it("rejects unsupported status and invalid sort order", () => {
    const badStatus = new SchoolClass({ ...validClass(), status: "closed" });
    const badOrder = new SchoolClass({ ...validClass(), sortOrder: -1 });
    expect(badStatus.validateSync()?.errors.status).toBeDefined();
    expect(badOrder.validateSync()?.errors.sortOrder).toBeDefined();
  });

  it("defines a case-insensitive unique class name per school and year", () => {
    const index = SchoolClass.schema.indexes().find(
      ([keys, options]) => keys.name === 1 && options.unique
    );

    expect(index).toBeDefined();
    expect(index[0]).toEqual({ tenantId: 1, academicYearId: 1, name: 1 });
    expect(index[1].collation).toEqual({ locale: "en", strength: 2 });
  });
});
