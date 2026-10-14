
import { describe, it, expect, beforeEach, vi } from "vitest";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

describe("authorizeRoles middleware", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      auth: undefined,
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it("returns 401 when the request is unauthenticated", () => {
    const middleware = authorizeRoles("admin");

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Authentication required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the user's role is not allowed", () => {
    req.auth = { role: "teacher" };

    const middleware = authorizeRoles("admin");

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "You do not have permission to perform this action",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when the user's role is allowed", () => {
    req.auth = { role: "admin" };

    const middleware = authorizeRoles("admin");

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("allows any role included in the allowed roles list", () => {
    req.auth = { role: "teacher" };

    const middleware = authorizeRoles("admin", "teacher", "principal");

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when no roles are allowed", () => {
    req.auth = { role: "admin" };

    const middleware = authorizeRoles();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "You do not have permission to perform this action",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated role is missing", () => {
    req.auth = {};

    const middleware = authorizeRoles("admin");

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
