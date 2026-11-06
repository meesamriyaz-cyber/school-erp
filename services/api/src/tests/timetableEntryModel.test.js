import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import TimetableEntry from "../models/TimetableEntry.js";

const valid = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  academicYearId: new mongoose.Types.ObjectId(),
  classId: new mongoose.Types.ObjectId(),
  assignmentId: new mongoose.Types.ObjectId(),
  createdBy: new mongoose.Types.ObjectId(),
  dayOfWeek: 1,
  periodNumber: 1,
  startTime: "09:00",
  endTime: "09:45",
});

describe("TimetableEntry model", () => {
  it("accepts a valid weekday period and defaults", () => {
    const entry = new TimetableEntry(valid());
    expect(entry.validateSync()).toBeUndefined();
    expect(entry.status).toBe("active");
    expect(entry.sectionId).toBeNull();
    expect(entry.room).toBe("");
  });
  it("requires school, year, class, assignment, creator and period fields", () => {
    for (const field of ["tenantId", "academicYearId", "classId", "assignmentId", "createdBy", "dayOfWeek", "periodNumber", "startTime", "endTime"]) {
      const value = valid();
      delete value[field];
      expect(new TimetableEntry(value).validateSync()?.errors[field]).toBeDefined();
    }
  });
  it("rejects invalid weekdays, period numbers and time formats", () => {
    expect(new TimetableEntry({ ...valid(), dayOfWeek: 0 }).validateSync()?.errors.dayOfWeek).toBeDefined();
    expect(new TimetableEntry({ ...valid(), periodNumber: 21 }).validateSync()?.errors.periodNumber).toBeDefined();
    expect(new TimetableEntry({ ...valid(), startTime: "9am" }).validateSync()?.errors.startTime).toBeDefined();
  });
  it("defines an active tenant-scoped class period uniqueness index", () => {
    expect(TimetableEntry.schema.indexes().some(([keys, options]) =>
      keys.tenantId === 1 && keys.academicYearId === 1 && keys.classId === 1 &&
      keys.sectionId === 1 && keys.dayOfWeek === 1 && keys.periodNumber === 1 &&
      options.unique && options.partialFilterExpression?.status === "active"
    )).toBe(true);
  });
});
