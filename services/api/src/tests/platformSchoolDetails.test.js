import { beforeEach, describe, expect, it, vi } from "vitest";

const { find, findById } = vi.hoisted(() => ({
  find: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({
  default: { find, findById, create: vi.fn() },
}));
vi.mock("../models/User.js", () => ({
  default: { find, create: vi.fn() },
}));
vi.mock("../utils/password.js", () => ({ hashPassword: vi.fn() }));

import { getSchoolDetails } from "../controllers/platformController.js";

describe("getSchoolDetails", () => {
  let req;
  let res;
  let next;
  let schoolQuery;
  let administratorsQuery;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { params: { schoolId: "507f1f77bcf86cd799439011" } };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();

    schoolQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "North School",
        slug: "north-school",
        status: "active",
      }),
    };
    administratorsQuery = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: "507f1f77bcf86cd799439012",
          firstName: "School",
          lastName: "Admin",
          email: "admin@example.com",
          role: "school_admin",
          status: "active",
        },
      ]),
    };
    findById.mockReturnValue(schoolQuery);
    find.mockReturnValue(administratorsQuery);
  });

  it("returns school details and sanitized school administrator records", async () => {
    await getSchoolDetails(req, res, next);

    expect(findById).toHaveBeenCalledWith(req.params.schoolId);
    expect(schoolQuery.select).toHaveBeenCalledWith(
      "_id name slug status contactEmail timezone createdAt updatedAt",
    );
    expect(find).toHaveBeenCalledWith({
      tenantId: "507f1f77bcf86cd799439011",
      role: "school_admin",
    });
    expect(administratorsQuery.select).toHaveBeenCalledWith(
      "_id firstName lastName email status lastLoginAt createdAt",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        school: expect.objectContaining({ id: "507f1f77bcf86cd799439011" }),
        administrators: [
          expect.objectContaining({
            id: "507f1f77bcf86cd799439012",
            email: "admin@example.com",
          }),
        ],
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed school IDs without querying the database", async () => {
    req.params.schoolId = "not-an-object-id";

    await getSchoolDetails(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid school ID",
    });
    expect(findById).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("returns 404 when the school does not exist", async () => {
    schoolQuery.lean.mockResolvedValue(null);

    await getSchoolDetails(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "School not found",
    });
    expect(find).not.toHaveBeenCalled();
  });

  it("forwards unexpected database errors", async () => {
    const error = new Error("Database unavailable");
    findById.mockImplementation(() => { throw error; });

    await getSchoolDetails(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
