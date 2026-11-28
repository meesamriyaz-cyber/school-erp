import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import GradingScale from "../models/GradingScale.js";

const validScale = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  name: "Secondary School Grading",
  bands: [
    { grade: "F", minPercentage: 0, maxPercentage: 35 },
    { grade: "D", minPercentage: 35, maxPercentage: 50 },
    { grade: "C", minPercentage: 50, maxPercentage: 65 },
    { grade: "B", minPercentage: 65, maxPercentage: 80 },
    { grade: "A", minPercentage: 80, maxPercentage: 100 },
  ],
  createdBy: new mongoose.Types.ObjectId(),
  updatedBy: new mongoose.Types.ObjectId(),
});

describe("GradingScale model", () => {
  it("accepts contiguous bands covering zero through 100 and defaults to draft", () => {
    const scale = new GradingScale(validScale());
    expect(scale.validateSync()).toBeUndefined();
    expect(scale.status).toBe("draft");
  });

  it("accepts bands supplied out of order and sorts only for validation", () => {
    const scale = new GradingScale({
      ...validScale(),
      bands: [...validScale().bands].reverse(),
    });
    expect(scale.validateSync()).toBeUndefined();
    expect(scale.bands[0].grade).toBe("A");
  });

  it("rejects gaps and overlaps between adjacent bands", () => {
    for (const bands of [
      [{ grade: "F", minPercentage: 0, maxPercentage: 40 }, { grade: "A", minPercentage: 41, maxPercentage: 100 }],
      [{ grade: "F", minPercentage: 0, maxPercentage: 60 }, { grade: "A", minPercentage: 50, maxPercentage: 100 }],
    ]) {
      const scale = new GradingScale({ ...validScale(), bands });
      expect(scale.validateSync()?.errors.bands).toBeDefined();
    }
  });

  it("requires complete coverage from zero to 100", () => {
    const scale = new GradingScale({
      ...validScale(),
      bands: [{ grade: "A", minPercentage: 1, maxPercentage: 99 }],
    });
    expect(scale.validateSync()?.errors.bands).toBeDefined();
  });

  it("rejects duplicate grade labels without regard to case", () => {
    const scale = new GradingScale({
      ...validScale(),
      bands: [
        { grade: "A", minPercentage: 0, maxPercentage: 50 },
        { grade: "a", minPercentage: 50, maxPercentage: 100 },
      ],
    });
    expect(scale.validateSync()?.errors.bands).toBeDefined();
  });

  it("rejects invalid bounds and zero-width bands", () => {
    for (const band of [
      { grade: "A", minPercentage: -1, maxPercentage: 100 },
      { grade: "A", minPercentage: 0, maxPercentage: 101 },
      { grade: "A", minPercentage: 50, maxPercentage: 50 },
    ]) {
      const scale = new GradingScale({ ...validScale(), bands: [band] });
      expect(scale.validateSync()?.errors.bands).toBeDefined();
    }
  });

  it("requires tenant, name, bands and creator metadata", () => {
    for (const field of ["tenantId", "name", "bands", "createdBy", "updatedBy"]) {
      const scale = new GradingScale({ ...validScale(), [field]: undefined });
      expect(scale.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it("defines tenant-scoped unique-name and single-active-scale indexes", () => {
    const indexes = GradingScale.schema.indexes();
    expect(indexes.some(([keys, options]) =>
      keys.tenantId === 1 && keys.name === 1 && options.unique &&
      options.collation?.strength === 2
    )).toBe(true);
    expect(indexes.some(([keys, options]) =>
      keys.tenantId === 1 && options.unique &&
      options.partialFilterExpression?.status === "active"
    )).toBe(true);
  });
});
