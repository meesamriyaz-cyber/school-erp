import { describe, expect, it } from "vitest";
import AuditLog from "../models/AuditLog.js";

describe("AuditLog model integrity", () => {
  it("requires a unique immutable event identifier", () => {
    const eventId = AuditLog.schema.path("eventId");
    expect(eventId.options.required).toBe(true);
    expect(eventId.options.immutable).toBe(true);
    expect(AuditLog.schema.indexes()).toContainEqual([
      { eventId: 1 },
      { unique: true, partialFilterExpression: { eventId: { $type: "objectId" } } },
    ]);
  });

  it("registers append-only middleware for update and delete operations", () => {
    const operations = [
      "updateOne",
      "updateMany",
      "findOneAndUpdate",
      "replaceOne",
      "deleteOne",
      "deleteMany",
      "findOneAndDelete",
    ];
    for (const operation of operations) {
      expect(AuditLog.schema.s.hooks._pres.has(operation)).toBe(true);
    }
  });
});
