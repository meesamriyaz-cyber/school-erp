import "dotenv/config";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import AuditOutbox from "../models/AuditOutbox.js";
import { withAuditTransaction } from "../services/auditLogService.js";

const testMongoUri = process.env.MONGO_TEST_URI;
const integrationDescribe = testMongoUri ? describe : describe.skip;

function getDatabaseName(uri) {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

integrationDescribe("audit transaction MongoDB integration", () => {
  let topology;
  const createdUserIds = [];
  const createdOutboxIds = [];
  const createdAuditIds = [];

  beforeAll(async () => {
    const databaseName = getDatabaseName(testMongoUri);
    if (!databaseName || !/test/i.test(databaseName)) {
      throw new Error("Refusing integration test: MONGO_TEST_URI must target a database whose name includes test.");
    }

    await mongoose.connect(testMongoUri, { serverSelectionTimeoutMS: 10000 });
    topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== "isdbgrid") {
      throw new Error("MONGO_TEST_URI must connect to a replica set or sharded MongoDB deployment.");
    }
  }, 30000);

  afterAll(async () => {
    if (createdAuditIds.length) await AuditLog.deleteMany({ _id: { $in: createdAuditIds } });
    if (createdOutboxIds.length) await AuditOutbox.deleteMany({ _id: { $in: createdOutboxIds } });
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }, 30000);

  it("confirms the connected deployment supports multi-document transactions", () => {
    expect(Boolean(topology.setName || topology.msg === "isdbgrid")).toBe(true);
  });

  it("commits the user mutation and audit outbox event atomically", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const actorUserId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();
    let outboxId;

    await withAuditTransaction(async (session) => {
      await User.create([{
        _id: userId, tenantId: new mongoose.Types.ObjectId(), firstName: "Audit",
        lastName: "Transaction", email: `audit-transaction-${suffix}@example.test`,
        passwordHash: "integration-test-hash", role: "teacher", status: "pending",
      }], { session });

      const [outbox] = await AuditOutbox.create([{
        event: {
          eventId, actorUserId, actorRole: "platform_admin", tenantId: null,
          targetUserId: userId, targetTenantId: null, action: "USER_CREATED",
          changedFields: ["status"], previousValue: null, newValue: "pending",
        },
      }], { session });
      outboxId = outbox._id;
    });

    createdUserIds.push(userId);
    createdOutboxIds.push(outboxId);
    const persistedUser = await User.findById(userId).lean();
    const persistedOutbox = await AuditOutbox.findById(outboxId).lean();
    expect(persistedUser).not.toBeNull();
    expect(persistedOutbox).not.toBeNull();
    expect(persistedOutbox.event.eventId.toString()).toBe(eventId.toString());
  }, 30000);

  it("rolls back the user mutation and outbox event when the transaction fails", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const userId = new mongoose.Types.ObjectId();
    const outboxId = new mongoose.Types.ObjectId();

    await expect(withAuditTransaction(async (session) => {
      await User.create([{
        _id: userId, tenantId: new mongoose.Types.ObjectId(), firstName: "Rollback",
        lastName: "Audit", email: `audit-rollback-${suffix}@example.test`,
        passwordHash: "integration-test-hash", role: "teacher", status: "pending",
      }], { session });
      await AuditOutbox.create([{
        _id: outboxId,
        event: {
          eventId: new mongoose.Types.ObjectId(), actorUserId: new mongoose.Types.ObjectId(),
          actorRole: "platform_admin", tenantId: null, targetUserId: userId,
          targetTenantId: null, action: "USER_CREATED", changedFields: ["status"],
          previousValue: null, newValue: "pending",
        },
      }], { session });
      throw new Error("intentional transaction rollback");
    })).rejects.toThrow("intentional transaction rollback");

    expect(await User.findById(userId).lean()).toBeNull();
    expect(await AuditOutbox.findById(outboxId).lean()).toBeNull();
  }, 30000);
});
