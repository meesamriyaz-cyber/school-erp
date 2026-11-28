import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Subject from "../models/Subject.js";

const validSubject = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  name: "Mathematics",
});

describe("Subject model", () => {
  it("accepts valid subject details and applies defaults", () => {
    const subject = new Subject(validSubject());
    expect(subject.validateSync()).toBeUndefined();
    expect(subject.category).toBe("core");
    expect(subject.status).toBe("active");
    expect(subject.code).toBe("");
    expect(subject.description).toBe("");
  });

  it("requires a school tenant and subject name", () => {
    expect(new Subject({ ...validSubject(), tenantId: undefined }).validateSync()?.errors.tenantId).toBeDefined();
    expect(new Subject({ ...validSubject(), name: "" }).validateSync()?.errors.name).toBeDefined();
  });

  it("normalizes subject codes and trims text", () => {
    const subject = new Subject({ ...validSubject(), name: "  English  ", code: " eng ", description: " Language " });
    expect(subject.name).toBe("English");
    expect(subject.code).toBe("ENG");
    expect(subject.description).toBe("Language");
  });

  it("rejects unsupported categories and statuses", () => {
    expect(new Subject({ ...validSubject(), category: "optional" }).validateSync()?.errors.category).toBeDefined();
    expect(new Subject({ ...validSubject(), status: "archived" }).validateSync()?.errors.status).toBeDefined();
  });

  it("defines tenant-scoped unique name and code indexes", () => {
    const indexes = Subject.schema.indexes();
    expect(indexes.some(([keys, options]) => keys.tenantId === 1 && keys.name === 1 && options.unique && options.collation?.strength === 2)).toBe(true);
    expect(indexes.some(([keys, options]) => keys.tenantId === 1 && keys.code === 1 && options.unique)).toBe(true);
  });
});
