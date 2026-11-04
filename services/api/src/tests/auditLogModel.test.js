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
      "update",
      "updateOne",
      "updateMany",
      "findOneAndReplace",
      "findOneAndUpdate",
      "findOneAndRemove",
      "findOneAndDelete",
      "replaceOne",
      "remove",
      "deleteOne",
      "deleteMany",
    ];
    for (const operation of operations) {
      expect(AuditLog.schema.s.hooks._pres.has(operation)).toBe(true);
    }
    expect(AuditLog.schema.s.hooks._pres.has("bulkWrite")).toBe(true);
  });
  it("registers document-level protection against modifying existing audit records", () => {
  const saveHooks = AuditLog.schema.s.hooks._pres.get("save") ?? [];

  expect(
    saveHooks.some(({ fn }) => fn.name === "rejectAuditDocumentSave"),
  ).toBe(true);
});

it("registers document-level protection against deleting audit records", () => {
  const deleteHooks = AuditLog.schema.s.hooks._pres.get("deleteOne") ?? [];

  expect(
    deleteHooks.some(
      ({ fn, document, query }) =>
        fn.name === "rejectAuditDocumentDelete" &&
        document === true &&
        query === false,
    ),
  ).toBe(true);
});
});
