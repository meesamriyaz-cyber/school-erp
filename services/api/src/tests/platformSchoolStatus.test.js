import { beforeEach, describe, expect, it, vi } from "vitest";

const { findById, findOneAndUpdate, updateMany } = vi.hoisted(() => ({
  findById: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({
  default: { findById, findOneAndUpdate, create: vi.fn() },
}));
vi.mock("../models/User.js", () => ({ default: { create: vi.fn() } }));
vi.mock("../models/Session.js", () => ({ default: { updateMany } }));
vi.mock("../utils/password.js", () => ({ hashPassword: vi.fn() }));

import { updateSchoolStatus } from "../controllers/platformController.js";

describe("updateSchoolStatus", () => {
  let req;
  let res;
  let next;
  let schoolQuery;
  let updateQuery;

  const schoolId = "507f1f77bcf86cd799439011";
  const activeSchool = {
    _id: schoolId,
    name: "North School",
    slug: "north-school",
    status: "active",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    req = { params: { schoolId }, body: { status: "suspended" } };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();

    schoolQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ ...activeSchool }),
    };
    updateQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ ...activeSchool, status: "suspended" }),
    };
    findById.mockReturnValue(schoolQuery);
    findOneAndUpdate.mockReturnValue(updateQuery);
  });

  it("suspends an active school and uses the previous status in the update filter", async () => {
    await updateSchoolStatus(req, res, next);

    expect(findById).toHaveBeenCalledWith(schoolId);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: schoolId, status: "active" },
      { $set: { status: "suspended" } },
      { new: true, runValidators: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        school: expect.objectContaining({ id: schoolId, status: "suspended" }),
      },
    }));
    expect(updateMany).toHaveBeenCalledWith(
      { tenantId: schoolId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("does not revoke sessions when activating a pending school", async () => {
    req.body.status = "active";
    schoolQuery.lean.mockResolvedValue({ ...activeSchool, status: "pending" });
    updateQuery.lean.mockResolvedValue({ ...activeSchool, status: "active" });

    await updateSchoolStatus(req, res, next);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("revokes any lingering sessions before reactivating a suspended school", async () => {
    req.body.status = "active";
    schoolQuery.lean.mockResolvedValue({ ...activeSchool, status: "suspended" });
    updateQuery.lean.mockResolvedValue({ ...activeSchool, status: "active" });

    await updateSchoolStatus(req, res, next);

    expect(updateMany).toHaveBeenCalledWith(
      { tenantId: schoolId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      findOneAndUpdate.mock.invocationCallOrder[0],
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps a suspended school suspended if session revocation fails during reactivation", async () => {
    const error = new Error("Session store unavailable");
    req.body.status = "active";
    schoolQuery.lean.mockResolvedValue({ ...activeSchool, status: "suspended" });
    updateMany.mockRejectedValue(error);

    await updateSchoolStatus(req, res, next);

    expect(updateMany).toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error);
  });

  it("activates a pending school", async () => {
    req.body.status = "active";
    schoolQuery.lean.mockResolvedValue({ ...activeSchool, status: "pending" });
    updateQuery.lean.mockResolvedValue({ ...activeSchool, status: "active" });

    await updateSchoolStatus(req, res, next);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: schoolId, status: "pending" },
      { $set: { status: "active" } },
      { new: true, runValidators: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns success without writing when the school already has the requested status", async () => {
    req.body.status = "active";

    await updateSchoolStatus(req, res, next);

    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "School already has the requested status",
    }));
  });

  it("rejects malformed school IDs", async () => {
    req.params.schoolId = "bad-id";

    await updateSchoolStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(findById).not.toHaveBeenCalled();
  });

  it("rejects unsupported statuses", async () => {
    req.body.status = "deleted";

    await updateSchoolStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Status must be pending, active, or suspended",
    });
    expect(findById).not.toHaveBeenCalled();
  });

  it("returns 404 when the school does not exist", async () => {
    schoolQuery.lean.mockResolvedValue(null);

    await updateSchoolStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a disallowed status transition", async () => {
    req.body.status = "suspended";
    schoolQuery.lean.mockResolvedValue({ ...activeSchool, status: "pending" });

    await updateSchoolStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Cannot change school status from pending to suspended",
    });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 if the status changes before the conditional update", async () => {
    findOneAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    await updateSchoolStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("forwards unexpected database errors", async () => {
    const error = new Error("Database unavailable");
    findById.mockImplementation(() => { throw error; });

    await updateSchoolStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
