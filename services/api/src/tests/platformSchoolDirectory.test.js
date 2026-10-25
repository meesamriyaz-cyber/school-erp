import { beforeEach, describe, expect, it, vi } from "vitest";

const { find, countDocuments } = vi.hoisted(() => ({
  find: vi.fn(),
  countDocuments: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({
  default: { find, countDocuments, create: vi.fn() },
}));
vi.mock("../models/User.js", () => ({ default: { create: vi.fn() } }));
vi.mock("../utils/password.js", () => ({ hashPassword: vi.fn() }));

import { listSchools } from "../controllers/platformController.js";

describe("listSchools", () => {
  let req;
  let res;
  let next;
  let query;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { query: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
    query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: "school1", name: "North School", slug: "north-school", status: "active" }]),
    };
    find.mockReturnValue(query);
    countDocuments.mockResolvedValue(1);
  });

  it("returns paginated schools", async () => {
    await listSchools(req, res, next);
    expect(find).toHaveBeenCalledWith({});
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it("filters by status and search and applies pagination", async () => {
    req.query = { page: "2", limit: "10", status: "active", search: "North" };
    await listSchools(req, res, next);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      status: "active",
      $or: expect.any(Array),
    }));
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(10);
  });

  it.each([
    [{ page: "0" }, "Page must be positive and limit must be between 1 and 100"],
    [{ limit: "101" }, "Page must be positive and limit must be between 1 and 100"],
    [{ status: "deleted" }, "Invalid school status filter"],
    [{ search: "x".repeat(101) }, "Search must not exceed 100 characters"],
  ])("rejects invalid query parameters", async (params, message) => {
    req.query = params;
    await listSchools(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message });
    expect(find).not.toHaveBeenCalled();
  });

  it("forwards unexpected database errors", async () => {
    const error = new Error("Database unavailable");
    find.mockImplementation(() => { throw error; });
    await listSchools(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
