import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { userModel, tenantModel, sessionModel, hashPassword } = vi.hoisted(() => ({
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
}));

vi.mock("../models/User.js", () => ({
  default: userModel,
  USER_ROLES: ["platform_admin", "school_admin", "principal", "teacher", "accountant", "librarian", "transport_manager", "student", "parent"],
}));
vi.mock("../models/Tenant.js", () => ({ default: tenantModel }));
vi.mock("../models/Session.js", () => ({ default: sessionModel }));
vi.mock("../utils/password.js", () => ({ hashPassword }));

import { createUser, listUsers, updateUserStatus, updateUserRole } from "../controllers/userManagementController.js";

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
    userModel.create.mockImplementation(async (user) => ({ _id: userId, ...user, createdAt: new Date(), updatedAt: new Date() }));
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
});
