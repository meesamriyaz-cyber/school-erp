import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { userModel, tenantModel, sessionModel, hashPassword, auditWrite, auditTransaction } = vi.hoisted(() => ({
  userModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
  tenantModel: { findById: vi.fn() },
  sessionModel: { updateMany: vi.fn() },
  hashPassword: vi.fn(),
  auditWrite: vi.fn().mockResolvedValue(true),
  auditTransaction: vi.fn(async (work) => work({})),
}));

vi.mock("../models/User.js", () => ({
  default: userModel,
  USER_ROLES: ["platform_admin", "school_admin", "principal", "teacher", "accountant", "librarian", "transport_manager", "student", "parent"],
}));
vi.mock("../models/Tenant.js", () => ({ default: tenantModel }));
vi.mock("../models/Session.js", () => ({ default: sessionModel }));
vi.mock("../utils/password.js", () => ({ hashPassword }));
vi.mock("../services/auditLogService.js", () => ({ writeUserAudit: auditWrite, withAuditTransaction: auditTransaction }));

import { createUser, listUsers, updateUser, updateUserStatus, updateUserRole } from "../controllers/userManagementController.js";

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});
const findChain = (resolved) => ({
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(resolved),
});

describe("user management controller", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    auditWrite.mockResolvedValue(true);
    req = {
      auth: { userId: new mongoose.Types.ObjectId().toString(), tenantId: tenantId.toString(), role: "school_admin" },
      params: { userId: userId.toString() },
      query: {},
      body: {
        firstName: "Sam",
        lastName: "Teacher",
        email: " SAM@EXAMPLE.COM ",
        role: "teacher",
        password: "StrongPassword123",
      },
    };
    res = makeResponse();
    next = vi.fn();
    tenantModel.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: tenantId, status: "active" }) }) });
    hashPassword.mockResolvedValue("hashed-password");
    userModel.create.mockImplementation(async (input) => {
      const makeUser = (user) => ({ _id: userId, ...user, createdAt: new Date(), updatedAt: new Date() });
      return Array.isArray(input) ? input.map(makeUser) : makeUser(input);
    });
    sessionModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it("creates school users as pending and ignores client-supplied activation status", async () => {
    req.body.status = "active";
    req.body.tenantId = tenantId.toString();
    await createUser(req, res, next);

    expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: expect.any(mongoose.Types.ObjectId),
      firstName: "Sam",
      email: "sam@example.com",
      passwordHash: "hashed-password",
      role: "teacher",
      status: "pending",
      authVersion: 0,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: req.auth.userId,
      actorRole: "school_admin",
      targetUserId: userId,
      action: "USER_CREATED",
      changedFields: ["firstName", "lastName", "email", "phone", "role", "status"],
    }));
    expect(auditWrite.mock.calls[0][0]).not.toHaveProperty("password");
    expect(auditWrite.mock.calls[0][0]).not.toHaveProperty("passwordHash");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { user: expect.objectContaining({ status: "pending", role: "teacher" }) },
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it("does not let school admins create school_admin accounts", async () => {
    req.body.role = "school_admin";
    await createUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(userModel.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("does not let school admins supply a different tenant ID", async () => {
    req.body.tenantId = new mongoose.Types.ObjectId().toString();
    await createUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it("scopes school-admin user listings to the authenticated tenant", async () => {
    userModel.find.mockReturnValue(findChain([]));
    userModel.countDocuments.mockResolvedValue(0);
    await listUsers(req, res, next);
    expect(userModel.find).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: tenantId.toString(),
      role: { $nin: ["platform_admin", "school_admin"] },
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("records changed profile field names without copying profile values into the audit event", async () => {
    const existing = { _id: userId, tenantId, firstName: "Sam", lastName: "Teacher", email: "sam@example.com", role: "teacher", status: "active" };
    userModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) }),
    });
    userModel.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...existing, firstName: "Samuel" }) }),
    });
    req.body = { firstName: "Samuel" };

    await updateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      action: "USER_PROFILE_UPDATED",
      targetUserId: userId,
      changedFields: ["firstName"],
    }));
    expect(auditWrite.mock.calls[0][0]).not.toHaveProperty("email");
    expect(auditWrite.mock.calls[0][0]).not.toHaveProperty("passwordHash");
  });

  it("increments authVersion and revokes sessions when a user is suspended", async () => {
    const existing = { _id: userId, tenantId, role: "teacher", status: "active", authVersion: 2 };
    userModel.findOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) }) });
    userModel.findOneAndUpdate.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...existing, status: "suspended", firstName: "Sam", lastName: "Teacher", email: "sam@example.com" }) }) });
    req.body = { status: "suspended" };

    await updateUserStatus(req, res, next);

    expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", $or: [{ authVersion: 2 }, { authVersion: { $exists: false } }] }),
      { $set: { status: "suspended" }, $inc: { authVersion: 1 } },
      expect.objectContaining({ new: true, runValidators: true }),
    );
    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { userId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      action: "USER_STATUS_CHANGED", previousValue: "active", newValue: "suspended",
      changedFields: ["status"],
    }));
  });

  it("prevents school admins from assigning roles through the role endpoint", async () => {
    req.body = { role: "principal" };
    await updateUserRole(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(userModel.findOne).not.toHaveBeenCalled();
  });

  it("does not expose password hashes in user responses", async () => {
    userModel.find.mockReturnValue(findChain([{
      _id: userId, tenantId, firstName: "Sam", lastName: "Teacher", email: "sam@example.com",
      passwordHash: "must-not-leak", role: "teacher", status: "active",
    }]));
    userModel.countDocuments.mockResolvedValue(1);
    await listUsers(req, res, next);
    const responseUser = res.json.mock.calls[0][0].data[0];
    expect(responseUser).not.toHaveProperty("passwordHash");
  });

  it("rejects school-admin status changes for users outside the authenticated tenant", async () => {
    const otherTenantId = new mongoose.Types.ObjectId();
    // A properly scoped Mongo query cannot return this other-tenant user.
    // Model that behavior by returning no matching user.
    userModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    req.body = { status: "suspended" };

    await updateUserStatus(req, res, next);

    expect(userModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: tenantId.toString(),
      role: { $nin: ["platform_admin", "school_admin"] },
    }));
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns a conflict and does not revoke sessions when a concurrent status update wins", async () => {
    const existing = { _id: userId, tenantId, role: "teacher", status: "active", authVersion: 2 };
    userModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) }),
    });
    userModel.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    req.body = { status: "suspended" };

    await updateUserStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps a committed status change successful when session cleanup fails", async () => {
    const existing = { _id: userId, tenantId, role: "teacher", status: "active", authVersion: 2 };
    const updated = { ...existing, status: "suspended", authVersion: 3, firstName: "Sam", lastName: "Teacher", email: "sam@example.com" };
    userModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) }),
    });
    userModel.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) }),
    });
    sessionModel.updateMany.mockRejectedValue(new Error("session store unavailable"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    req.body = { status: "suspended" };

    try {
      await updateUserStatus(req, res, next);

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { status: "suspended" }, $inc: { authVersion: 1 } },
        expect.objectContaining({ new: true, runValidators: true }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "Failed to revoke sessions after user authorization change",
        expect.objectContaining({ userId: String(userId) }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("prevents an administrator from changing their own status", async () => {
    req.params.userId = req.auth.userId;
    req.body = { status: "suspended" };

    await updateUserStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not allow platform administrators to assign the platform_admin role through school-user management", async () => {
    req.auth = { userId: new mongoose.Types.ObjectId().toString(), tenantId: null, role: "platform_admin" };
    req.body = { role: "platform_admin" };

    await updateUserRole(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps a committed role change successful when session cleanup fails", async () => {
    req.auth = { userId: new mongoose.Types.ObjectId().toString(), tenantId: null, role: "platform_admin" };
    const existing = { _id: userId, tenantId, role: "teacher", status: "active", authVersion: 4 };
    const updated = {
      ...existing, firstName: "Sam", lastName: "Teacher", email: "sam@example.com",
      phone: null, role: "principal",
    };
    userModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) }),
    });
    userModel.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) }),
    });
    sessionModel.updateMany.mockRejectedValue(new Error("session store unavailable"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    req.body = { role: "principal" };

    try {
      await updateUserRole(req, res, next);

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { role: "principal" }, $inc: { authVersion: 1 } },
        expect.objectContaining({ new: true, runValidators: true }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "Failed to revoke sessions after user authorization change",
        expect.objectContaining({ userId: String(userId) }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects invalid pagination instead of issuing an unbounded query", async () => {
    req.query = { page: "1", limit: "1000" };

    await listUsers(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(userModel.find).not.toHaveBeenCalled();
    expect(userModel.countDocuments).not.toHaveBeenCalled();
  });


  it("increments authVersion and revokes sessions when a platform admin changes a user's role", async () => {
    req.auth = { userId: new mongoose.Types.ObjectId().toString(), tenantId: null, role: "platform_admin" };
    const existing = { _id: userId, tenantId, role: "teacher", status: "active", authVersion: 4 };
    userModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) }),
    });
    userModel.findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...existing, firstName: "Sam", lastName: "Teacher", email: "sam@example.com",
          phone: null, role: "principal", status: "active",
        }),
      }),
    });
    req.body = { role: "principal" };

    await updateUserRole(req, res, next);

    expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", $or: [{ authVersion: 4 }, { authVersion: { $exists: false } }] }),
      { $set: { role: "principal" }, $inc: { authVersion: 1 } },
      expect.objectContaining({ new: true, runValidators: true }),
    );
    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { userId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      action: "USER_ROLE_CHANGED", previousValue: "teacher", newValue: "principal",
      changedFields: ["role"],
    }));
  });

});
