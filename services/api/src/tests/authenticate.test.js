
import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/User.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../utils/tokens.js", () => ({
  verifyAccessToken: vi.fn(),
}));

import User from "../models/User.js";
import { verifyAccessToken } from "../utils/tokens.js";
import authenticate from "../middleware/authenticate.js";

describe("authenticate middleware", () => {
  let req;
  let res;
  let next;

  const userId = new mongoose.Types.ObjectId().toString();
  const tenantId = new mongoose.Types.ObjectId().toString();

  const activeUser = {
    _id: userId,
    tenantId,
    role: "school_admin",
    status: "active",
    authVersion: 0,
  };

  const validPayload = {
    sub: userId,
    tenantId,
    role: "school_admin",
    authVersion: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      headers: {
        authorization: "Bearer valid-access-token",
      },
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();

    verifyAccessToken.mockReturnValue({ ...validPayload });

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...activeUser }),
      }),
    });
  });

  it("rejects a missing authorization header", async () => {
    req.headers.authorization = undefined;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Authentication required",
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a non-Bearer authorization header", async () => {
    req.headers.authorization = "Basic some-token";

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Authentication required",
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects an empty Bearer token", async () => {
    req.headers.authorization = "Bearer    ";

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Authentication required",
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a token without a valid subject", async () => {
    verifyAccessToken.mockReturnValue({
      ...validPayload,
      sub: "",
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or expired access token",
    });
    expect(User.findById).not.toHaveBeenCalled();
  });

  it("rejects when token verification throws", async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error("Invalid token");
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or expired access token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a user who does not exist", async () => {
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or inactive account",
    });
  });

  it("rejects an inactive user", async () => {
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...activeUser,
          status: "suspended",
        }),
      }),
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or inactive account",
    });
  });

  it("rejects an outdated authVersion", async () => {
    verifyAccessToken.mockReturnValue({
      ...validPayload,
      authVersion: 1,
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Session invalidated; please sign in again",
    });
  });

  it("rejects a token with a missing authVersion", async () => {
    const payload = { ...validPayload };
    delete payload.authVersion;
    verifyAccessToken.mockReturnValue(payload);

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Session invalidated; please sign in again",
    });
  });

  it("rejects when the user's role has changed", async () => {
    verifyAccessToken.mockReturnValue({
      ...validPayload,
      role: "teacher",
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Account permissions have changed; sign in again",
    });
  });

  it("rejects when the user's tenant does not match the token", async () => {
    verifyAccessToken.mockReturnValue({
      ...validPayload,
      tenantId: new mongoose.Types.ObjectId().toString(),
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Account permissions have changed; sign in again",
    });
  });

  it("sets authentication context for a valid school user", async () => {
    await authenticate(req, res, next);

    expect(User.findById).toHaveBeenCalledWith(userId);
    expect(req.auth).toEqual({
      userId,
      tenantId,
      role: "school_admin",
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows a platform administrator without a tenant", async () => {
    verifyAccessToken.mockReturnValue({
      sub: userId,
      tenantId: null,
      role: "platform_admin",
      authVersion: 0,
    });

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: userId,
          tenantId: null,
          role: "platform_admin",
          status: "active",
          authVersion: 0,
        }),
      }),
    });

    await authenticate(req, res, next);

    expect(req.auth).toEqual({
      userId,
      tenantId: null,
      role: "platform_admin",
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a platform administrator incorrectly assigned to a tenant", async () => {
    verifyAccessToken.mockReturnValue({
      ...validPayload,
      role: "platform_admin",
    });

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...activeUser,
          role: "platform_admin",
        }),
      }),
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Account permissions have changed; sign in again",
    });
  });

  it("rejects a school user with no tenant", async () => {
    verifyAccessToken.mockReturnValue({
      ...validPayload,
      tenantId: null,
    });

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          ...activeUser,
          tenantId: null,
        }),
      }),
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Account permissions have changed; sign in again",
    });
  });

  it("defaults a missing database authVersion to zero", async () => {
    const user = { ...activeUser };
    delete user.authVersion;

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(user),
      }),
    });

    verifyAccessToken.mockReturnValue({
      ...validPayload,
      authVersion: 0,
    });

    await authenticate(req, res, next);

    expect(req.auth).toEqual({
      userId,
      tenantId,
      role: "school_admin",
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects database lookup errors with a 401 response", async () => {
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error("Database unavailable")),
      }),
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or expired access token",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
