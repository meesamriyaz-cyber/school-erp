import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import AuditOutbox from "../models/AuditOutbox.js";

const objectId = () => new mongoose.Types.ObjectId();

function validUserEvent(overrides = {}) {
  return {
    eventId: objectId(),
    actorUserId: objectId(),
    actorRole: "platform_admin",
    tenantId: null,
    targetUserId: objectId(),
    targetTenantId: objectId(),
    action: "USER_ROLE_CHANGED",
    changedFields: ["role"],
    previousValue: "teacher",
    newValue: "principal",
    ...overrides,
  };
}

describe("AuditOutbox event validation", () => {
  it("accepts a complete allowlisted user audit event", () => {
    const record = new AuditOutbox({ event: validUserEvent() });
    expect(record.validateSync()).toBeUndefined();
  });

  it("rejects unexpected fields that could carry credentials or request data", () => {
    const record = new AuditOutbox({
      event: validUserEvent({ passwordHash: "must-never-be-stored" }),
    });
    expect(record.validateSync()?.errors.event.message).toMatch(/unsupported, unsafe, or incomplete/i);
  });

  it("rejects unsupported actor roles and changed fields", () => {
    const invalidRole = new AuditOutbox({
      event: validUserEvent({ actorRole: "superuser" }),
    });
    const invalidField = new AuditOutbox({
      event: validUserEvent({ changedFields: ["passwordHash"] }),
    });
    expect(invalidRole.validateSync()?.errors.event).toBeDefined();
    expect(invalidField.validateSync()?.errors.event).toBeDefined();
  });

  it("rejects a user event with a school target but no user target", () => {
    const record = new AuditOutbox({
      event: validUserEvent({ targetUserId: null }),
    });
    expect(record.validateSync()?.errors.event).toBeDefined();
  });

  it("accepts a school lifecycle event and rejects a user target on it", () => {
    const schoolEvent = {
      eventId: objectId(),
      actorUserId: objectId(),
      actorRole: "platform_admin",
      tenantId: null,
      targetUserId: null,
      targetTenantId: objectId(),
      action: "SCHOOL_STATUS_CHANGED",
      changedFields: ["status", "suspensionReason"],
      previousValue: "active",
      newValue: "suspended",
    };
    expect(new AuditOutbox({ event: schoolEvent }).validateSync()).toBeUndefined();
    expect(new AuditOutbox({
      event: { ...schoolEvent, targetUserId: objectId() },
    }).validateSync()?.errors.event).toBeDefined();
  });

  it("rejects unsafe status and role values", () => {
    const unsafeRole = new AuditOutbox({
      event: validUserEvent({ previousValue: "teacher", newValue: "root" }),
    });
    const unsafeStatus = new AuditOutbox({
      event: validUserEvent({
        action: "USER_STATUS_CHANGED",
        changedFields: ["status"],
        previousValue: "active",
        newValue: "deleted",
      }),
    });
    expect(unsafeRole.validateSync()?.errors.event).toBeDefined();
    expect(unsafeStatus.validateSync()?.errors.event).toBeDefined();
  });
});
