
import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/Tenant.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import Tenant from "../models/Tenant.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";

describe("requireActiveTenant middleware", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      auth: {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "school_admin",
        tenantId: new mongoose.Types.ObjectId().toString(),
      },
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it("returns 401 when authentication is missing", async () => {
    req.auth = undefined;

    await requireActiveTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Authentication required",
    });
    expect(Tenant.findOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects platform administrators", async () => {
    req.auth.role = "platform_admin";

    await requireActiveTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "An active school context is required",
    });
    expect(Tenant.findOne).not.toHaveBeenCalled();
  });

  it("rejects a missing tenant ID", async () => {
    req.auth.tenantId = null;

    await requireActiveTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "An active school context is required",
    });
    expect(Tenant.findOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid tenant ID", async () => {
    req.auth.tenantId = "not-a-valid-object-id";

    await requireActiveTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "An active school context is required",
    });
    expect(Tenant.findOne).not.toHaveBeenCalled();
  });

  it("rejects when no active tenant is found", async () => {
    Tenant.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    await requireActiveTenant(req, res, next);

    expect(Tenant.findOne).toHaveBeenCalledWith({
      _id: req.auth.tenantId,
      status: "active",
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "School access is unavailable",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("sets the verified tenant context and calls next", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const tenant = {
      _id: tenantId,
      name: "Test School",
      slug: "test-school",
      status: "active",
      timezone: "Asia/Kolkata",
    };

    req.auth.tenantId = tenantId.toString();

    Tenant.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(tenant),
      }),
    });

    await requireActiveTenant(req, res, next);

    expect(Tenant.findOne).toHaveBeenCalledWith({
      _id: tenantId.toString(),
      status: "active",
    });
    expect(req.tenant).toEqual(tenant);
    expect(req.tenantId).toBe(tenantId.toString());
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes database errors to the error handler", async () => {
    const databaseError = new Error("Database unavailable");

    Tenant.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockRejectedValue(databaseError),
      }),
    });

    await requireActiveTenant(req, res, next);

    expect(next).toHaveBeenCalledWith(databaseError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
