import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  login,
  refresh,
  logout,
  changePassword,
} from "../controllers/authController.js";
const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  verifyRefreshToken: vi.fn(),
  createSession: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllUserSessions: vi.fn(),
}));

vi.mock("../models/User.js", () => ({
  default: {
    findOne: mocks.findOne,
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("../models/Tenant.js", () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("../config/env.js", () => ({
  default: { nodeEnv: "test" },
}));

vi.mock("../utils/password.js", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
}));

vi.mock("../utils/tokens.js", () => ({
  verifyRefreshToken: mocks.verifyRefreshToken,
}));

vi.mock("../services/sessionService.js", () => ({
  createSession: mocks.createSession,
  rotateRefreshToken: mocks.rotateRefreshToken,
  revokeSession: mocks.revokeSession,
  revokeAllUserSessions: mocks.revokeAllUserSessions,
}));

const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

describe("authController.login", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      body: {},
      get: vi.fn().mockReturnValue("test-agent"),
    };

    res = createResponse();
    next = vi.fn();
  });

  it("returns 400 when the request body is missing", async () => {
    req.body = undefined;

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Email and password are required",
    });
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["email is missing", { password: "ValidPassword123!" }],
    ["password is missing", { email: "user@example.test" }],
    ["email is empty", { email: "   ", password: "ValidPassword123!" }],
    ["email is not a string", { email: 123, password: "ValidPassword123!" }],
    ["password is not a string", { email: "user@example.test", password: 123 }],
    ["password is empty", { email: "user@example.test", password: "" }],
  ])("returns 400 when %s", async (_description, body) => {
    req.body = body;

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Email and password are required",
    });
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
  
  it("logs in a school user and normalizes email and tenant slug", async () => {
    const user = {
      _id: "user-123",
      firstName: "Test",
      lastName: "User",
      email: "user@example.test",
      role: "school_admin",
      tenantId: "tenant-123",
      status: "active",
      passwordHash: "hashed-password",
    };

    const tenantQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ _id: "tenant-123" }),
    };

    const userQuery = {
      select: vi.fn().mockResolvedValue(user),
    };

    const Tenant = (await import("../models/Tenant.js")).default;
    Tenant.findOne.mockReturnValue(tenantQuery);
    mocks.findOne.mockReturnValue(userQuery);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    req.body = {
      email: "  USER@EXAMPLE.TEST ",
      password: "ValidPassword123!",
      tenantSlug: "  TEST-SCHOOL ",
      clientType: "mobile",
    };

    await login(req, res, next);

    expect(Tenant.findOne).toHaveBeenCalledWith({
      slug: "test-school",
      status: "active",
    });
    expect(mocks.findOne).toHaveBeenCalledWith({
      tenantId: "tenant-123",
      email: "user@example.test",
      role: { $ne: "platform_admin" },
    });
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "ValidPassword123!",
      "hashed-password",
    );
    expect(mocks.createSession).toHaveBeenCalledWith(user, {
      userAgent: "test-agent",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      accessToken: "access-token",
      tokenType: "Bearer",
      expiresIn: 900,
      refreshToken: "refresh-token",
      user: {
        id: "user-123",
        firstName: "Test",
        lastName: "User",
        email: "user@example.test",
        role: "school_admin",
        tenantId: "tenant-123",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("logs in a platform administrator without a tenant slug", async () => {
    const user = {
      _id: "platform-user",
      firstName: "Platform",
      lastName: "Admin",
      email: "admin@example.test",
      role: "platform_admin",
      tenantId: null,
      status: "active",
      passwordHash: "hashed-password",
    };

    const userQuery = {
      select: vi.fn().mockResolvedValue(user),
    };

    mocks.findOne.mockReturnValue(userQuery);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue({
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
    });

    req.body = {
      email: "admin@example.test",
      password: "ValidPassword123!",
    };

    await login(req, res, next);

    expect(mocks.findOne).toHaveBeenCalledWith({
      email: "admin@example.test",
      role: "platform_admin",
      tenantId: null,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith(
      "school_erp_refresh",
      "admin-refresh",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          id: "platform-user",
          role: "platform_admin",
          tenantId: null,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects login when the tenant does not exist", async () => {
    const Tenant = (await import("../models/Tenant.js")).default;

    Tenant.findOne.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    req.body = {
      email: "user@example.test",
      password: "ValidPassword123!",
      tenantSlug: "missing-school",
    };

    await login(req, res, next);

    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid credentials or inactive account",
    });
  });

  it("rejects login when the password is incorrect", async () => {
    const user = {
      _id: "user-123",
      status: "active",
      passwordHash: "hashed-password",
    };

    mocks.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(user),
    });
    mocks.verifyPassword.mockResolvedValue(false);

    req.body = {
      email: "admin@example.test",
      password: "WrongPassword123!",
    };

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid credentials or inactive account",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("forwards unexpected login errors to next", async () => {
    const error = new Error("Database unavailable");

    mocks.findOne.mockImplementation(() => {
      throw error;
    });

    req.body = {
      email: "admin@example.test",
      password: "ValidPassword123!",
    };

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  });
describe("authController.refresh", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = { body: {}, cookies: {} };
    res = createResponse();
    next = vi.fn();
  });

  it("returns 401 when the refresh token is missing", async () => {
    await refresh(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith(
      "school_erp_refresh",
      expect.objectContaining({
        httpOnly: true,
        path: "/api/v1/auth",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Refresh token required",
    });
    expect(mocks.verifyRefreshToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the refresh token is invalid", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "invalid-token",
    };

    mocks.verifyRefreshToken.mockImplementation(() => {
      throw new Error("Invalid token");
    });

    await refresh(req, res, next);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid or expired refresh token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the user no longer exists", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "valid-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "missing-user",
      sid: "session-123",
    });

    const User = (await import("../models/User.js")).default;
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    await refresh(req, res, next);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid credentials or inactive account",
    });
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when refresh-token rotation rejects the session", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "valid-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
      sid: "session-123",
    });

    const User = (await import("../models/User.js")).default;
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "user-123",
          status: "active",
          role: "school_admin",
          tenantId: "tenant-123",
          firstName: "Test",
          lastName: "User",
          email: "user@example.test",
        }),
      }),
    });

    mocks.rotateRefreshToken.mockRejectedValue(
      Object.assign(new Error("Session expired"), { statusCode: 401 }),
    );

    await refresh(req, res, next);

    expect(mocks.rotateRefreshToken).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Session expired or invalid; please sign in again",
    });
    expect(next).not.toHaveBeenCalled();
  });
  
  it("rejects refresh when the user is inactive", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "valid-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
      sid: "session-123",
    });

    const User = (await import("../models/User.js")).default;

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "user-123",
          status: "suspended",
        }),
      }),
    });

    await refresh(req, res, next);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid credentials or inactive account",
    });
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards unexpected database errors to next", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "valid-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
      sid: "session-123",
    });

    const error = new Error("Database unavailable");
    const User = (await import("../models/User.js")).default;

    User.findById.mockImplementation(() => {
      throw error;
    });

    await refresh(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("forwards unexpected session-rotation errors to next", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "valid-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
      sid: "session-123",
    });

    const User = (await import("../models/User.js")).default;

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "user-123",
          status: "active",
          role: "school_admin",
          tenantId: "tenant-123",
          firstName: "Test",
          lastName: "User",
          email: "user@example.test",
        }),
      }),
    });

    const error = new Error("Session service unavailable");
    mocks.rotateRefreshToken.mockRejectedValue(error);

    await refresh(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });



  
  it("blocks refresh when the school is suspended", async () => {
    req.body = { clientType: "mobile", refreshToken: "old-refresh-token" };
    mocks.verifyRefreshToken.mockReturnValue({ sub: "user-123", sid: "session-123" });
    const User = (await import("../models/User.js")).default;
    const Tenant = (await import("../models/Tenant.js")).default;
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
        _id: "user-123", status: "active", role: "school_admin",
        tenantId: "tenant-123", firstName: "Test", lastName: "User", email: "user@example.test",
      }) }),
    });
    Tenant.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "tenant-123", status: "suspended" }) }),
    });

    await refresh(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "School is inactive; access is not available" });
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks refresh when the school record is missing", async () => {
    req.body = { clientType: "mobile", refreshToken: "old-refresh-token" };
    mocks.verifyRefreshToken.mockReturnValue({ sub: "user-123", sid: "session-123" });
    const User = (await import("../models/User.js")).default;
    const Tenant = (await import("../models/Tenant.js")).default;
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
        _id: "user-123", status: "active", role: "school_admin", tenantId: "tenant-123",
        firstName: "Test", lastName: "User", email: "user@example.test",
      }) }),
    });
    Tenant.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });

    await refresh(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("does not look up a tenant when refreshing a platform administrator session", async () => {
    req.body = { clientType: "mobile", refreshToken: "old-refresh-token" };
    mocks.verifyRefreshToken.mockReturnValue({ sub: "admin-123", sid: "session-123" });
    const User = (await import("../models/User.js")).default;
    const Tenant = (await import("../models/Tenant.js")).default;
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
        _id: "admin-123", status: "active", role: "platform_admin", tenantId: null,
        firstName: "Platform", lastName: "Admin", email: "admin@example.test",
      }) }),
    });
    mocks.rotateRefreshToken.mockResolvedValue({ accessToken: "new-access-token", refreshToken: "new-refresh-token" });

    await refresh(req, res, next);

    expect(Tenant.findById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.rotateRefreshToken).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("refreshes tokens successfully for a mobile client", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "old-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
      sid: "session-123",
    });

    const User = (await import("../models/User.js")).default;

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "user-123",
          status: "active",
          role: "school_admin",
          tenantId: "tenant-123",
          firstName: "Test",
          lastName: "User",
          email: "user@example.test",
        }),
      }),
    });

    mocks.rotateRefreshToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });

    await refresh(req, res, next);

    expect(mocks.rotateRefreshToken).toHaveBeenCalledWith(
      "old-refresh-token",
      expect.objectContaining({
        _id: "user-123",
        status: "active",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      accessToken: "new-access-token",
      tokenType: "Bearer",
      expiresIn: 900,
      refreshToken: "new-refresh-token",
      user: {
        id: "user-123",
        firstName: "Test",
        lastName: "User",
        email: "user@example.test",
        role: "school_admin",
        tenantId: "tenant-123",
      },
    });
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("refreshes tokens successfully for a web client using a cookie", async () => {
    req.cookies = {
      school_erp_refresh: "cookie-refresh-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
      sid: "session-123",
    });

    const User = (await import("../models/User.js")).default;

    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "user-123",
          status: "active",
          role: "school_admin",
          tenantId: "tenant-123",
          firstName: "Test",
          lastName: "User",
          email: "user@example.test",
        }),
      }),
    });

    mocks.rotateRefreshToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "rotated-cookie-token",
    });

    await refresh(req, res, next);

    expect(mocks.verifyRefreshToken).toHaveBeenCalledWith(
      "cookie-refresh-token",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith(
      "school_erp_refresh",
      "rotated-cookie-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({
        refreshToken: "rotated-cookie-token",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

describe("authController.logout", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = { body: {}, cookies: {} };
    res = createResponse();
    next = vi.fn();
  });

  it("logs out successfully when no refresh token is supplied", async () => {
    await logout(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith(
      "school_erp_refresh",
      expect.objectContaining({ path: "/api/v1/auth" }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Logged out",
    });
    expect(mocks.revokeSession).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("remains successful when the refresh token is invalid", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "invalid-token",
    };

    mocks.verifyRefreshToken.mockImplementation(() => {
      throw new Error("Invalid token");
    });

    await logout(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Logged out",
    });
    expect(mocks.revokeSession).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("does not revoke a session when token identifiers are missing", async () => {
    req.body = {
      clientType: "mobile",
      refreshToken: "valid-token",
    };

    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-123",
    });

    await logout(req, res, next);

    expect(mocks.revokeSession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Logged out",
    });
    expect(next).not.toHaveBeenCalled();
  });

 
it("forwards unexpected session-revocation errors to next", async () => {
  req.body = {
    clientType: "mobile",
    refreshToken: "valid-token",
  };

  const error = new Error("Session service unavailable");

  mocks.verifyRefreshToken.mockReturnValue({
    sub: "user-123",
    sid: "session-123",
  });

  mocks.revokeSession.mockRejectedValue(error);

  await logout(req, res, next);

  console.log("verifyRefreshToken calls:", mocks.verifyRefreshToken.mock.calls);
  console.log("revokeSession calls:", mocks.revokeSession.mock.calls);
  console.log("next calls:", next.mock.calls);
  console.log("response status calls:", res.status.mock.calls);

  expect(mocks.revokeSession).toHaveBeenCalledWith(
    "session-123",
    "user-123",
  );
  expect(next).toHaveBeenCalledWith(error);
});

});

it("returns 409 when account credentials change concurrently", async () => {
  const User = (await import("../models/User.js")).default;

  const user = {
    _id: "507f1f77bcf86cd799439011",
    passwordHash: "old-hash",
    authVersion: 0,
  };

  User.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  });

  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("new-hash");

  User.findOneAndUpdate.mockReturnValue({
    select: vi.fn().mockResolvedValue(null),
  });

  req.body = {
    currentPassword: "CurrentPassword123!",
    newPassword: "NewPassword456!",
  };

  req.auth = {
    userId: user._id,
    tenantId: "507f1f77bcf86cd799439012",
    role: "school_admin",
  };

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "Account credentials changed; please sign in again",
  });

  expect(mocks.revokeAllUserSessions).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});


it("returns 400 when the new password violates password policy", async () => {
  const User = (await import("../models/User.js")).default;

  const user = {
    _id: "507f1f77bcf86cd799439011",
    passwordHash: "old-hash",
    authVersion: 0,
  };

  User.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  });

  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockRejectedValue(
    new Error("Password must meet the configured length requirements"),
  );

  req.body = {
    currentPassword: "CurrentPassword123!",
    newPassword: "short",
  };

  req.auth = {
    userId: user._id,
    tenantId: "507f1f77bcf86cd799439012",
    role: "school_admin",
  };

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "Password must meet the configured length requirements",
  });

  expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  expect(mocks.revokeAllUserSessions).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

it("forwards unexpected session revocation errors to next", async () => {
  const User = (await import("../models/User.js")).default;

  const user = {
    _id: "507f1f77bcf86cd799439011",
    passwordHash: "old-hash",
    authVersion: 0,
  };

  User.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  });

  User.findOneAndUpdate.mockReturnValue({
    select: vi.fn().mockResolvedValue({ _id: user._id }),
  });

  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("new-hash");

  const error = new Error("Session revocation failed");
  mocks.revokeAllUserSessions.mockRejectedValue(error);

  req.body = {
    currentPassword: "CurrentPassword123!",
    newPassword: "NewPassword456!",
  };

  req.auth = {
    userId: user._id,
    tenantId: "507f1f77bcf86cd799439012",
    role: "school_admin",
  };

  await changePassword(req, res, next);

  expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith(user._id);
  expect(next).toHaveBeenCalledWith(error);
  expect(res.status).not.toHaveBeenCalled();
});


it("returns 400 when the authenticated account is not found", async () => {
  mocks.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(null),
  });

  const req = {
    body: {
      currentPassword: "CurrentPassword123!",
      newPassword: "NewPassword123!",
    },
    auth: {
      userId: "user-123",
      tenantId: "tenant-123",
      role: "school_admin",
    },
  };

  const res = createResponse();
  const next = vi.fn();

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "Current password is incorrect",
  });
  expect(mocks.verifyPassword).not.toHaveBeenCalled();
  expect(mocks.hashPassword).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

it("returns 400 when the current password is incorrect", async () => {
  mocks.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      _id: "user-123",
      passwordHash: "stored-password-hash",
      authVersion: 0,
    }),
  });
  mocks.verifyPassword.mockResolvedValue(false);

  const req = {
    body: {
      currentPassword: "WrongPassword123!",
      newPassword: "NewPassword123!",
    },
    auth: {
      userId: "user-123",
      tenantId: "tenant-123",
      role: "school_admin",
    },
  };

  const res = createResponse();
  const next = vi.fn();

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "Current password is incorrect",
  });
  expect(mocks.hashPassword).not.toHaveBeenCalled();
  expect(mocks.revokeAllUserSessions).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

it("returns 400 when current or new password is missing", async () => {
  const req = {
    body: {
      currentPassword: "",
      newPassword: "NewPassword123!",
    },
    auth: {
      userId: "user-123",
      tenantId: "tenant-123",
      role: "school_admin",
    },
  };

  const res = createResponse();
  const next = vi.fn();

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "Current password and new password are required",
  });
  expect(mocks.findOne).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});
it("returns 400 when the new password matches the current password", async () => {
  const req = {
    body: {
      currentPassword: "SamePassword123!",
      newPassword: "SamePassword123!",
    },
    auth: {
      userId: "user-123",
      tenantId: "tenant-123",
      role: "school_admin",
    },
  };

  const res = createResponse();
  const next = vi.fn();

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "New password must differ from the current password",
  });
  expect(mocks.findOne).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});


it("defaults authVersion to zero when it is missing", async () => {
  const User = (await import("../models/User.js")).default;

  const user = {
    _id: "507f1f77bcf86cd799439011",
    passwordHash: "old-hash",
  };

  const req = {
    body: {
      currentPassword: "CurrentPassword123!",
      newPassword: "NewPassword456!",
    },
    auth: {
      userId: user._id,
      tenantId: "507f1f77bcf86cd799439012",
      role: "school_admin",
    },
  };

  const res = createResponse();
  const next = vi.fn();

  User.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  });

  User.findOneAndUpdate.mockReturnValue({
    select: vi.fn().mockResolvedValue({ _id: user._id }),
  });

  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("new-hash");
  mocks.revokeAllUserSessions.mockResolvedValue(undefined);
  await changePassword(req, res, next);

  expect(User.findOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      authVersion: 0,
    }),
    expect.objectContaining({
      $inc: { authVersion: 1 },
    }),
    { new: true, runValidators: true },
  );

  expect(res.status).toHaveBeenCalledWith(200);
  expect(next).not.toHaveBeenCalled();
});


it("forwards errors without a message to next", async () => {
  const User = (await import("../models/User.js")).default;

  const user = {
    _id: "507f1f77bcf86cd799439011",
    passwordHash: "old-hash",
    
  };

  User.findOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  });

  mocks.verifyPassword.mockResolvedValue(true);

  const error = {};
  mocks.hashPassword.mockRejectedValue(error);

  req.body = {
    currentPassword: "CurrentPassword123!",
    newPassword: "NewPassword456!",
  };

  req.auth = {
    userId: user._id,
    tenantId: "507f1f77bcf86cd799439012",
    role: "school_admin",
  };

  await changePassword(req, res, next);

  expect(next).toHaveBeenCalledWith(error);
  expect(res.status).not.toHaveBeenCalled();
});

it("returns 400 when the request body is missing", async () => {
  req.body = undefined;

  await changePassword(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "Current password and new password are required",
  });
  expect(next).not.toHaveBeenCalled();
});

});