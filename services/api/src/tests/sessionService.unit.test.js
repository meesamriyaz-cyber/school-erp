
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionFindOne,
  sessionFindOneAndUpdate,
  sessionUpdateOne,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} = vi.hoisted(() => ({
  sessionFindOne: vi.fn(),
  sessionFindOneAndUpdate: vi.fn(),
  sessionUpdateOne: vi.fn(),
  createAccessToken: vi.fn(),
  createRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn(),
}));

vi.mock("../models/Session.js", () => ({
  default: {
    findOne: sessionFindOne,
    findOneAndUpdate: sessionFindOneAndUpdate,
    updateOne: sessionUpdateOne,
  },
}));

vi.mock("../utils/tokens.js", () => ({
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
}));

vi.mock("../utils/refreshTokenHash.js", () => ({
  hashRefreshToken,
}));

import {
  createSession,
  rotateRefreshToken,
} from "../services/sessionService.js";

describe("sessionService isolated unit tests", () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    role: "school_admin",
    tenantId: "507f1f77bcf86cd799439012",
    status: "active",
    authVersion: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    verifyRefreshToken.mockReturnValue({
      sub: user._id,
      sid: "507f1f77bcf86cd799439013",
    });

    hashRefreshToken.mockReturnValue("presented-hash");
    createAccessToken.mockReturnValue("new-access-token");
    createRefreshToken.mockReturnValue("new-refresh-token");

    sessionFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439013",
        userId: user._id,
        tenantId: user.tenantId,
        authVersion: "invalid",
        refreshTokenHash: "presented-hash",
        absoluteExpiresAt: new Date(Date.now() + 86400000),
      }),
    });

    sessionUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("treats a non-integer stored authVersion as zero", async () => {
    await expect(
      rotateRefreshToken("presented-refresh-token", user),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Session changed during refresh; please retry",
    });

    expect(sessionFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        authVersion: 0,
      }),
      expect.any(Object),
      { returnDocument: "after" },
    );

    expect(sessionUpdateOne).not.toHaveBeenCalled();
  });

  
it("rejects refresh when the session no longer exists", async () => {
  sessionFindOne.mockReturnValue({
    select: vi.fn().mockResolvedValue(null),
  });

  await expect(
    rotateRefreshToken("presented-refresh-token", user),
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Invalid or expired session",
  });

  expect(sessionFindOneAndUpdate).not.toHaveBeenCalled();
  expect(sessionUpdateOne).not.toHaveBeenCalled();
});

it("rejects a refresh token belonging to a different user", async () => {
  verifyRefreshToken.mockReturnValue({
    sub: "507f1f77bcf86cd799439099",
    sid: "507f1f77bcf86cd799439013",
  });

  await expect(
    rotateRefreshToken("presented-refresh-token", user),
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Invalid or expired session",
  });

  expect(sessionFindOne).not.toHaveBeenCalled();
});

it("rejects a refresh token with an invalid session ID", async () => {
  verifyRefreshToken.mockReturnValue({
    sub: user._id,
    sid: "not-a-valid-object-id",
  });

  await expect(
    rotateRefreshToken("presented-refresh-token", user),
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Invalid or expired session",
  });

  expect(sessionFindOne).not.toHaveBeenCalled();
});

it("rejects refresh when the refresh token verification fails", async () => {
  verifyRefreshToken.mockImplementation(() => {
    throw new Error("Invalid signature");
  });

  await expect(
    rotateRefreshToken("invalid-refresh-token", user),
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Invalid or expired session",
  });

  expect(sessionFindOne).not.toHaveBeenCalled();
  expect(sessionFindOneAndUpdate).not.toHaveBeenCalled();
});

it("revokes the session when the stored authVersion differs from the user's version", async () => {
  sessionFindOne.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      _id: "507f1f77bcf86cd799439013",
      userId: user._id,
      tenantId: user.tenantId,
      authVersion: 1,
      refreshTokenHash: "presented-hash",
      absoluteExpiresAt: new Date(Date.now() + 86400000),
    }),
  });

  await expect(
    rotateRefreshToken("presented-refresh-token", user),
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Session invalidated; please sign in again",
  });

  expect(sessionUpdateOne).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: expect.anything(),
      userId: user._id,
      revokedAt: null,
    }),
    expect.objectContaining({
      $set: expect.objectContaining({
        revokedAt: expect.any(Date),
      }),
    }),
  );

  expect(sessionFindOneAndUpdate).not.toHaveBeenCalled();
});
  it("defaults a non-integer user authVersion to zero during refresh", async () => {
    const userWithInvalidAuthVersion = {
      ...user,
      authVersion: "invalid",
    };

    sessionFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439013",
        userId: user._id,
        tenantId: user.tenantId,
        authVersion: 0,
        refreshTokenHash: "presented-hash",
        absoluteExpiresAt: new Date(Date.now() + 86400000),
      }),
    });

    sessionFindOneAndUpdate.mockResolvedValue({
    _id: "507f1f77bcf86cd799439013",
    userId: user._id,
    tenantId: user.tenantId,
    authVersion: 0,
    refreshTokenHash: "new-refresh-hash",
    absoluteExpiresAt: new Date(Date.now() + 86400000),
  });
    await rotateRefreshToken(
      "presented-refresh-token",
      userWithInvalidAuthVersion,
    );

    expect(sessionFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ authVersion: 0 }),
      expect.any(Object),
      { returnDocument: "after" },
    );
  });
    it("creates a platform admin session with a null tenant ID", async () => {
    const platformAdmin = {
      _id: "507f1f77bcf86cd799439011",
      role: "platform_admin",
      tenantId: null,
      status: "active",
      authVersion: 0,
    };

    const createdSession = {
      _id: "507f1f77bcf86cd799439013",
      expiresAt: new Date(Date.now() + 86400000),
    };

    const { default: Session } = await import("../models/Session.js");

    Session.create = vi.fn().mockResolvedValue(createdSession);

    await createSession(platformAdmin);

    expect(Session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: platformAdmin._id,
        tenantId: null,
        authVersion: 0,
      }),
    );
  });
    it("rejects refresh when the session tenant differs from the user's tenant", async () => {
    sessionFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439013",
        userId: user._id,
        tenantId: "507f1f77bcf86cd799439099",
        authVersion: 0,
        refreshTokenHash: "presented-hash",
        absoluteExpiresAt: new Date(Date.now() + 86400000),
      }),
    });

    await expect(
      rotateRefreshToken("presented-refresh-token", user),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid or expired session",
    });

    expect(sessionUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        revokedAt: null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      }),
    );

    expect(sessionFindOneAndUpdate).not.toHaveBeenCalled();
  });
    it("rejects refresh when the session tenant is null but the user has a tenant", async () => {
    sessionFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439013",
        userId: user._id,
        tenantId: null,
        authVersion: 0,
        refreshTokenHash: "presented-hash",
        absoluteExpiresAt: new Date(Date.now() + 86400000),
      }),
    });

    await expect(
      rotateRefreshToken("presented-refresh-token", user),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid or expired session",
    });

    expect(sessionUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        revokedAt: null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      }),
    );

    expect(sessionFindOneAndUpdate).not.toHaveBeenCalled();
  });
    it("rejects refresh when the user tenant is null but the session tenant exists", async () => {
    const platformAdmin = {
      ...user,
      role: "platform_admin",
      tenantId: null,
    };

    sessionFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439013",
        userId: user._id,
        tenantId: user.tenantId,
        authVersion: 0,
        refreshTokenHash: "presented-hash",
        absoluteExpiresAt: new Date(Date.now() + 86400000),
      }),
    });

    await expect(
      rotateRefreshToken("presented-refresh-token", platformAdmin),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid or expired session",
    });

    expect(sessionUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        revokedAt: null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      }),
    );

    expect(sessionFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
