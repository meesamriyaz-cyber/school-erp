import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import ExamSubject from "../models/ExamSubject.js";

const validExamSubject = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  examinationId: new mongoose.Types.ObjectId(),
  subjectId: new mongoose.Types.ObjectId(),
  examDate: new Date("2026-09-03T00:00:00.000Z"),
  maxMarks: 100,
  passMarks: 35,
});

describe("ExamSubject model", () => {
  it("accepts valid subject configuration and applies defaults", () => {
    const examSubject = new ExamSubject(validExamSubject());
    expect(examSubject.validateSync()).toBeUndefined();
    expect(examSubject.startTime).toBe("");
    expect(examSubject.endTime).toBe("");
    expect(examSubject.durationMinutes).toBeNull();
  });

  it("requires tenant, examination, subject, date and marks", () => {
    for (const field of ["tenantId", "examinationId", "subjectId", "examDate", "maxMarks", "passMarks"]) {
      const examSubject = new ExamSubject({ ...validExamSubject(), [field]: undefined });
      expect(examSubject.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it("rejects invalid mark ranges", () => {
    expect(new ExamSubject({ ...validExamSubject(), maxMarks: 0 }).validateSync()?.errors.maxMarks).toBeDefined();
    expect(new ExamSubject({ ...validExamSubject(), passMarks: -1 }).validateSync()?.errors.passMarks).toBeDefined();
    expect(new ExamSubject({ ...validExamSubject(), passMarks: 101 }).validateSync()?.errors.passMarks).toBeDefined();
  });

  it("validates time format and chronological order", () => {
    expect(new ExamSubject({ ...validExamSubject(), startTime: "9:00" }).validateSync()?.errors.startTime).toBeDefined();
    expect(new ExamSubject({ ...validExamSubject(), startTime: "11:00", endTime: "10:00" }).validateSync()?.errors.endTime).toBeDefined();
  });

  it("defines a tenant-scoped unique subject per examination index", () => {
    const indexes = ExamSubject.schema.indexes();
    expect(indexes.some(([keys, options]) => keys.tenantId === 1 && keys.examinationId === 1 && keys.subjectId === 1 && options.unique)).toBe(true);
  });
});
