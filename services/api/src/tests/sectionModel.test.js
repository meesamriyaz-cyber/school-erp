import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import Section from "../models/Section.js";

const validSection = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  classId: new mongoose.Types.ObjectId(),
  name: "A",
});

describe("Section model", () => {
  it("accepts valid section details and defaults status and capacity", () => {
    const section = new Section(validSection());

    expect(section.validateSync()).toBeUndefined();
    expect(section.status).toBe("active");
    expect(section.capacity).toBeNull();
  });

  it("requires a school tenant and class", () => {
    const noTenant = new Section({ ...validSection(), tenantId: undefined });
    const noClass = new Section({ ...validSection(), classId: undefined });

    expect(noTenant.validateSync()?.errors.tenantId).toBeDefined();
    expect(noClass.validateSync()?.errors.classId).toBeDefined();
  });

  it("requires a section name", () => {
    const section = new Section({ ...validSection(), name: "" });
    expect(section.validateSync()?.errors.name).toBeDefined();
  });

  it("rejects unsupported status and invalid capacity", () => {
    const badStatus = new Section({ ...validSection(), status: "closed" });
    const badCapacity = new Section({ ...validSection(), capacity: 0 });

    expect(badStatus.validateSync()?.errors.status).toBeDefined();
    expect(badCapacity.validateSync()?.errors.capacity).toBeDefined();
  });

  it("defines a case-insensitive unique section name per class", () => {
    const index = Section.schema.indexes().find(
      ([keys, options]) => keys.name === 1 && options.unique
    );

    expect(index).toBeDefined();
    expect(index[0]).toEqual({ tenantId: 1, classId: 1, name: 1 });
    expect(index[1].collation).toEqual({ locale: "en", strength: 2 });
  });
});
