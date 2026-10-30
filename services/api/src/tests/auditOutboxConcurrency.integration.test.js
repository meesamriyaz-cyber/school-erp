import "dotenv/config";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import AuditOutbox from "../models/AuditOutbox.js";

const testMongoUri = process.env.MONGO_TEST_URI;
const integrationDescribe = testMongoUri ? describe : describe.skip;

function getDatabaseName(uri) {
  const match = uri.match(/^mongodb(?:\\+srv)?:\\/\\/[^/]+\\/([^?]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

integrationDescribe("audit outbox concurrency integration", () => {
  const createdIds = [];

  beforeAll(async () => {
    const databaseName = getDatabaseName(testMongoUri);
    if (!databaseName || !/test/i.test(databaseName)) {
      throw new Error("Refusing integration test: MONGO_TEST_URI must target a database whose name includes test.");
    }
    await mongoose.connect(testMongoUri, { serverSelectionTimeoutMS: 10000 });
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== "isdbgrid") {
      throw new Error("MONGO_TEST_URI must connect to a replica set or sharded MongoDB deployment.");
    }
  }, 30000);

  afterAll(async () => {
    if (createdIds.length) await AuditOutbox.deleteMany({ _id: { $in: createdIds } });
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }, 30000);

  const createEvent = async (overrides = {}) => {
    const actorUserId = new mongoose.Types.ObjectId();
    const targetUserId = new mongoose.Types.ObjectId();
    const [record] = await AuditOutbox.create([{
      event: {
        eventId: new mongoose.Types.ObjectId(), actorUserId, actorRole: "platform_admin",
        tenantId: null, targetUserId, targetTenantId: null, action: "USER_CREATED",
        changedFields: ["status"], previousValue: null, newValue: "pending",
      },
      ...overrides,
    }]);
    createdIds.push(record._id);
    return record;
  };

  it("allows only one of two concurrent worker claims to own a pending event", async () => {
    const record = await createEvent();
    const now = new Date();
    const claims = await Promise.all(["worker-A", "worker-B"].map((processingToken) =>
      AuditOutbox.findOneAndUpdate(
        { _id: record._id, attempts: { $lt: 10 }, status: "pending", nextAttemptAt: { $lte: now } },
        { $set: { status: "processing", processingStartedAt: now, processingToken }, $inc: { attempts: 1 } },
        { new: true },
      ).select("+processingToken").lean(),
    ));

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean).processingToken).toMatch(/^worker-/);
    expect(await AuditOutbox.countDocuments({ _id: record._id, attempts: 1 })).toBe(1);
  }, 30000);

  it("reclaims an expired lease and fences out the previous worker acknowledgement", async () => {
    const oldToken = "expired-worker-claim";
    const record = await createEvent({
      status: "processing", attempts: 1,
      processingStartedAt: new Date(Date.now() - 6 * 60 * 1000),
      processingToken: oldToken,
    });
    const newToken = "replacement-worker-claim";
    const reclaimed = await AuditOutbox.findOneAndUpdate(
      {
        _id: record._id, attempts: { $lt: 10 }, status: "processing",
        processingStartedAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      { $set: { processingStartedAt: new Date(), processingToken: newToken }, $inc: { attempts: 1 } },
      { new: true },
    ).select("+processingToken").lean();

    expect(reclaimed?.processingToken).toBe(newToken);
    const staleAck = await AuditOutbox.updateOne(
      { _id: record._id, status: "processing", processingToken: oldToken },
      { $set: { status: "delivered", deliveredAt: new Date() }, $unset: { processingStartedAt: 1, processingToken: 1 } },
    );
    expect(staleAck.modifiedCount).toBe(0);
    const current = await AuditOutbox.findById(record._id).select("+processingToken").lean();
    expect(current.status).toBe("processing");
    expect(current.processingToken).toBe(newToken);
    expect(current.attempts).toBe(2);
  }, 30000);
});
