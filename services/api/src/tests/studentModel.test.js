import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Student from "../models/Student.js";
const makeStudent = (overrides = {}) => new Student({ tenantId: new mongoose.Types.ObjectId(), admissionNumber: "STU-001", firstName: "Ayaan", admissionDate: new Date("2026-04-01"), ...overrides });
describe("Student profile schema", () => {
  it("accepts address fields and an HTTPS photo URL", () => {
    const student = makeStudent({ photoUrl: "https://cdn.example.test/student.jpg", address: { line1: "Lal Chowk", city: "Srinagar" } });
    expect(student.validateSync()).toBeUndefined();
    expect(student.address.city).toBe("Srinagar");
  });
  it("rejects non-HTTPS and malformed photo URLs", () => {
    for (const photoUrl of ["http://example.test/photo.jpg", "not-a-url"]) expect(makeStudent({ photoUrl }).validateSync()?.errors.photoUrl).toBeDefined();
  });
  it("enforces address field length limits", () => expect(makeStudent({ address: { line1: "A".repeat(121) } }).validateSync()?.errors["address.line1"]).toBeDefined());
  it("keeps profile fields optional for legacy records", () => {
    const student = makeStudent();
    expect(student.validateSync()).toBeUndefined();
    expect(student.photoUrl).toBeNull();
  });
});
