import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";

const validRecord = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  studentId: new mongoose.Types.ObjectId(),
  enrollmentId: new mongoose.Types.ObjectId(),
  academicYearId: new mongoose.Types.ObjectId(),
  classId: new mongoose.Types.ObjectId(),
  markedBy: new mongoose.Types.ObjectId(),
  date: new Date("2026-11-06T00:00:00.000Z"),
  status: "present",
});

describe("Attendance model", () => {
  it("accepts a valid daily attendance record", () => {
    const record = new Attendance(validRecord());
    expect(record.validateSync()).toBeUndefined();
    expect(record.remarks).toBe("");
    expect(record.sectionId).toBeNull();
  });

  it("requires school, student, enrollment, year, class, date, status and marker", () => {
    const record = new Attendance({ ...validRecord(), tenantId: undefined, studentId: undefined, enrollmentId: undefined, academicYearId: undefined, classId: undefined, date: undefined, status: undefined, markedBy: undefined });
    const errors = record.validateSync().errors;
    for (const field of ["tenantId", "studentId", "enrollmentId", "academicYearId", "classId", "date", "status", "markedBy"]) expect(errors[field]).toBeDefined();
  });

  it.each(["present", "absent", "late", "excused"])("accepts %s attendance", (status) => {
    expect(new Attendance({ ...validRecord(), status }).validateSync()).toBeUndefined();
  });

  it("rejects unsupported attendance statuses", () => {
    expect(new Attendance({ ...validRecord(), status: "holiday" }).validateSync()?.errors.status).toBeDefined();
  });

  it("limits remarks to 300 characters", () => {
    expect(new Attendance({ ...validRecord(), remarks: "x".repeat(301) }).validateSync()?.errors.remarks).toBeDefined();
  });

  it("enforces one record per student per school day", () => {
    expect(Attendance.schema.indexes()).toEqual(expect.arrayContaining([
      [{ tenantId: 1, studentId: 1, date: 1 }, expect.objectContaining({ unique: true, name: "one_attendance_record_per_student_per_day" })],
    ]));
  });

  it("keeps tenant and placement references immutable", () => {
    for (const field of ["tenantId", "studentId", "enrollmentId", "academicYearId", "classId", "sectionId", "date"]) {
      expect(Attendance.schema.path(field).options.immutable).toBe(true);
    }
  });
});
