
import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import AcademicYear from "../models/AcademicYear.js";

const validAcademicYear = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  name: "2026-2027",
  startDate: new Date("2026-04-01T00:00:00.000Z"),
  endDate: new Date("2027-03-31T00:00:00.000Z"),
});

describe("AcademicYear model", () => {
  it("accepts valid academic-year details", () => {
    const year = new AcademicYear(validAcademicYear());

    expect(year.validateSync()).toBeUndefined();
    expect(year.status).toBe("draft");
  });

  it("requires a school tenant", () => {
    const year = new AcademicYear({
      ...validAcademicYear(),
      tenantId: undefined,
    });

    expect(year.validateSync()?.errors.tenantId).toBeDefined();
  });

  it("requires an academic-year name", () => {
    const year = new AcademicYear({
      ...validAcademicYear(),
      name: "",
    });

    expect(year.validateSync()?.errors.name).toBeDefined();
  });

  it("rejects an end date before the start date", () => {
    const year = new AcademicYear({
      ...validAcademicYear(),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });

    expect(year.validateSync()?.errors.endDate).toBeDefined();
  });

  it("rejects an unsupported lifecycle status", () => {
    const year = new AcademicYear({
      ...validAcademicYear(),
      status: "suspended",
    });

    expect(year.validateSync()?.errors.status).toBeDefined();
  });

  it("defines school-scoped unique indexes", () => {
    const indexes = AcademicYear.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { tenantId: 1, name: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [
          { tenantId: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: { status: "active" },
          }),
        ],
      ])
    );
  });
});
