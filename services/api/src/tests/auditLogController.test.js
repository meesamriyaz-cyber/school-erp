import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditLogModel } = vi.hoisted(() => ({
  auditLogModel: { find: vi.fn(), countDocuments: vi.fn() },
}));

vi.mock("../models/AuditLog.js", () => ({
  default: auditLogModel,
  AUDIT_ACTIONS: ["USER_CREATED", "USER_PROFILE_UPDATED", "USER_STATUS_CHANGED", "USER_ROLE_CHANGED"],
}));

import { listAuditLogs } from "../controllers/auditLogController.js";

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});
const queryChain = (rows) => ({
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(rows),
});

describe("audit log controller", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actorUserId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { auth: { userId: actorUserId.toString(), tenantId: tenantId.toString(), role: "school_admin" }, query: {} };
    res = makeResponse();
    next = vi.fn();
    auditLogModel.find.mockReturnValue(queryChain([]));
    auditLogModel.countDocuments.mockResolvedValue(0);
  });

  it("restricts school audit queries to the authenticated tenant", async () => {
    await listAuditLogs(req, res, next);

    expect(auditLogModel.find).toHaveBeenCalledWith({
      targetTenantId: expect.any(mongoose.Types.ObjectId),
    });
    expect(String(auditLogModel.find.mock.calls[0][0].targetTenantId)).toBe(tenantId.toString());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("allows platform admins to filter audit records by school", async () => {
    req.auth = { userId: actorUserId.toString(), tenantId: null, role: "platform_admin" };
    req.query = { tenantId: tenantId.toString(), action: "USER_ROLE_CHANGED", page: "2", limit: "10" };

    await listAuditLogs(req, res, next);

    expect(auditLogModel.find).toHaveBeenCalledWith({
      targetTenantId: expect.any(mongoose.Types.ObjectId),
      action: "USER_ROLE_CHANGED",
    });
    expect(auditLogModel.find.mock.results[0].value.skip).toHaveBeenCalledWith(10);
    expect(auditLogModel.find.mock.results[0].value.limit).toHaveBeenCalledWith(10);
  });

  it("rejects invalid action and pagination filters without querying", async () => {
    req.query = { action: "DELETE_EVERYTHING", limit: "1000" };

    await listAuditLogs(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(auditLogModel.find).not.toHaveBeenCalled();
    expect(auditLogModel.countDocuments).not.toHaveBeenCalled();
  });

  it("rejects a school admin request without a valid tenant context", async () => {
    req.auth.tenantId = null;

    await listAuditLogs(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(auditLogModel.find).not.toHaveBeenCalled();
  });

  it("returns paginated audit records without exposing unselected fields", async () => {
    const createdAt = new Date("2026-10-29T10:00:00.000Z");
    auditLogModel.find.mockReturnValue(queryChain([{
      _id: new mongoose.Types.ObjectId(),
      actorUserId,
      actorRole: "school_admin",
      tenantId,
      targetUserId,
      targetTenantId: tenantId,
      action: "USER_STATUS_CHANGED",
      changedFields: ["status"],
      previousValue: "active",
      newValue: "suspended",
      createdAt,
      secret: "must-not-be-returned",
    }]));
    auditLogModel.countDocuments.mockResolvedValue(1);

    await listAuditLogs(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(response.data[0]).toMatchObject({
      actorUserId: actorUserId.toString(),
      targetUserId: targetUserId.toString(),
      action: "USER_STATUS_CHANGED",
      previousValue: "active",
      newValue: "suspended",
      createdAt,
    });
    expect(response.data[0]).not.toHaveProperty("secret");
  });
});
