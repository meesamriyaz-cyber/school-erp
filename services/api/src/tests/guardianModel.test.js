import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Guardian from "../models/Guardian.js";

const validGuardian = () => ({
  tenantId: new mongoose.Types.ObjectId(),
  firstName: "Imran",
  lastName: "Khan",
  phone: "9999999999",
  email: "IMRAN@EXAMPLE.COM",
});

describe("Guardian model", () => {
  it("accepts valid guardian details and applies defaults", () => {
    const guardian = new Guardian(validGuardian());

    expect(guardian.validateSync()).toBeUndefined();
    expect(guardian.status).toBe("active");
    expect(guardian.email).toBe("imran@example.com");
  });

  it("requires a school tenant", () => {
    const guardian = new Guardian({
      ...validGuardian(),
      tenantId: undefined,
    });

    expect(guardian.validateSync()?.errors.tenantId).toBeDefined();
  });

  it("requires a first name", () => {
    const guardian = new Guardian({
      ...validGuardian(),
      firstName: " ",
    });

    expect(guardian.validateSync()?.errors.firstName).toBeDefined();
  });

  it("rejects unsupported guardian status", () => {
    const guardian = new Guardian({
      ...validGuardian(),
      status: "deleted",
    });

    expect(guardian.validateSync()?.errors.status).toBeDefined();
  });

  it("allows contact details to be optional", () => {
    const guardian = new Guardian({
      tenantId: new mongoose.Types.ObjectId(),
      firstName: "Sara",
    });

    expect(guardian.validateSync()).toBeUndefined();
  });

  it("keeps tenant assignment immutable", () => {
    expect(Guardian.schema.path("tenantId").options.immutable).toBe(true);
  });

  it("defines school-scoped guardian lookup indexes", () => {
    const indexes = Guardian.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ tenantId: 1, phone: 1 }, expect.any(Object)],
        [{ tenantId: 1, email: 1 }, expect.any(Object)],
      ]),
    );
  });
});