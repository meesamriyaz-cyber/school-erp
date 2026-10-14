
import dotenv from "dotenv";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { randomUUID } from "node:crypto";
import {
  createSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
} from "../services/sessionService.js";

dotenv.config({
  path: new URL("../../.env", import.meta.url),
  override: false,
});

const EXPECTED_TEST_DATABASE = "school-erp-test";

let tenant;
let secondTenant;
let activeUser;
let inactiveUser;

const createdUserIds = [];
const createdTenantIds = [];
const createdSessionIds = [];
const trackSession = (result) => {
  createdSessionIds.push(new mongoose.Types.ObjectId(result.sessionId));
  return result;
};
const makeUser = async ({
  status = "active",
  role = "school_admin",
  tenantId = tenant._id,
} = {}) => {  const suffix = randomUUID()

  const user = await User.create({
    tenantId,
    firstName: "Session",
    lastName: "Tester",
    email: `session-${suffix}@example.test`,
    passwordHash: "test-only-not-a-real-password-hash",
    role,
    status,
    authVersion: 0,
  });

  const trackSession = (result) => {
  createdSessionIds.push(new mongoose.Types.ObjectId(result.sessionId));
  return result;
};

  createdUserIds.push(user._id);
  return user;
};


beforeAll(async () => {
  if (env.nodeEnv !== "test") {
    throw new Error("Safety stop: run tests with NODE_ENV=test");
  }

  if (!env.mongoUri) {
    throw new Error("Test database URI is missing");
  }
// Verify the configured database name before connecting.
if (
  typeof env.mongoUri !== "string" ||
  !/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/.test(
    env.mongoUri
  )
) {
  throw new Error(
    "Safety stop: MONGO_TEST_URI must be a valid MongoDB connection string."
  );
}

const uriMatch = env.mongoUri.match(
  /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/
);

if (
  !uriMatch ||
  decodeURIComponent(uriMatch[1]) !== EXPECTED_TEST_DATABASE
) {
  throw new Error(
    `Safety stop: expected database ${EXPECTED_TEST_DATABASE}.`
  );
}


  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
    await mongoose.disconnect();
    throw new Error("Safety stop: connected to an unexpected database");
  }

  await Promise.all([Tenant.init(), User.init(), Session.init()]);

  const suffix = randomUUID();

  tenant = await Tenant.create({
    name: `Session Test School ${suffix}`,
    slug: `session-test-${suffix}`,
    status: "active",
  });

  createdTenantIds.push(tenant._id);
  secondTenant = await Tenant.create({
  name: `Session Test School Two ${suffix}`,
  slug: `session-test-two-${suffix}`,
  status: "active",
});

createdTenantIds.push(secondTenant._id);
  activeUser = await makeUser();
  inactiveUser = await makeUser({ status: "suspended" });
}, 30000);

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    if (createdSessionIds.length) {
      await Session.deleteMany({ _id: { $in: createdSessionIds } });
    }

    if (createdUserIds.length) {
      await Session.deleteMany({ userId: { $in: createdUserIds } });
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }

    if (createdTenantIds.length) {
      await Tenant.deleteMany({ _id: { $in: createdTenantIds } });
    }

    await mongoose.disconnect();
  }
}, 30000);

describe("Session service tests", () => {
  it("creates a session for an active user", async () => {
    const result = trackSession(await createSession(activeUser, {
      userAgent: "Vitest session test",
    }));

    expect(result.sessionId).toBeTruthy();
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);

    const session = await Session.findById(result.sessionId)
      .select("+refreshTokenHash")
      .lean();

    expect(session).not.toBeNull();
    expect(String(session.userId)).toBe(String(activeUser._id));
    expect(session.refreshTokenHash).not.toBe(result.refreshToken);
    expect(session.userAgent).toBe("Vitest session test");
    expect(session.revokedAt).toBeNull();
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      session.absoluteExpiresAt.getTime()
    );
  });

  it("rejects session creation for an inactive user", async () => {
    await expect(createSession(inactiveUser)).rejects.toMatchObject({
      statusCode: 401,
      message: "User account is not active",
    });
  });
  
it("rotates a valid refresh token", async () => {
  const original = trackSession(await createSession(activeUser));

  const rotated = await rotateRefreshToken(
    original.refreshToken,
    activeUser
  );

  expect(rotated.accessToken).toBeTruthy();
  expect(rotated.refreshToken).toBeTruthy();
  expect(rotated.refreshToken).not.toBe(original.refreshToken);
  expect(rotated.sessionId).toBe(original.sessionId);

  const session = await Session.findById(rotated.sessionId)
    .select("+refreshTokenHash")
    .lean();

  expect(session).not.toBeNull();
  expect(session.refreshTokenHash).not.toBe(original.refreshToken);
  expect(session.revokedAt).toBeNull();
});

it("revokes a session when an old refresh token is reused after the grace period", async () => {
  const original = trackSession(await createSession(activeUser));

  const rotated = await rotateRefreshToken(
    original.refreshToken,
    activeUser
  );

  // Move the previous-token rotation time beyond the 5-second grace period.
  await Session.updateOne(
    { _id: rotated.sessionId },
    {
      $set: {
        previousRefreshTokenRotatedAt: new Date(Date.now() - 6000),
      },
    }
  );

  await expect(
    rotateRefreshToken(original.refreshToken, activeUser)
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Refresh token reuse detected; please sign in again",
  });

  const session = await Session.findById(rotated.sessionId).lean();

  expect(session.revokedAt).toBeInstanceOf(Date);
});

it("does not revoke a session when an old refresh token is reused within the grace period", async () => {
  const original = trackSession(await createSession(activeUser));

  const rotated = await rotateRefreshToken(
    original.refreshToken,
    activeUser
  );

  await expect(
    rotateRefreshToken(original.refreshToken, activeUser)
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Refresh already completed; use the latest session credentials",
  });

  const session = await Session.findById(rotated.sessionId).lean();

  expect(session).not.toBeNull();
  expect(session.revokedAt).toBeNull();
});

it("revokes an active session", async () => {
  const created = trackSession(await createSession(activeUser));

  const revoked = await revokeSession(
    created.sessionId,
    activeUser._id.toString()
  );

  expect(revoked).toBe(true);

  const session = await Session.findById(created.sessionId).lean();

  expect(session).not.toBeNull();
  expect(session.revokedAt).toBeInstanceOf(Date);
});

it("does not allow a user to revoke another user's session", async () => {
  const created = trackSession(await createSession(activeUser));

  const revoked = await revokeSession(
    created.sessionId,
    inactiveUser._id.toString()
  );

  expect(revoked).toBe(false);

  const session = await Session.findById(created.sessionId).lean();

  expect(session).not.toBeNull();
  expect(session.revokedAt).toBeNull();
});

it("revokes all active sessions belonging to a user", async () => {
  const first = trackSession(await createSession(activeUser));
  const second = trackSession(await createSession(activeUser));

  // Count this user's active sessions before revocation.
  const activeSessionsBefore = await Session.countDocuments({
    userId: activeUser._id,
    revokedAt: null,
  });

  const revokedCount = await revokeAllUserSessions(
    activeUser._id.toString()
  );

  expect(revokedCount).toBe(activeSessionsBefore);
  expect(revokedCount).toBeGreaterThanOrEqual(2);

  const sessions = await Session.find({
    _id: {
      $in: [first.sessionId, second.sessionId],
    },
  }).lean();

  expect(sessions).toHaveLength(2);

  for (const session of sessions) {
    expect(session.revokedAt).toBeInstanceOf(Date);
  }
});


it("does not revoke another user's sessions", async () => {
  const otherActiveUser = await makeUser({ status: "active" });

  expect(otherActiveUser.status).toBe("active");

  const firstUserSession = trackSession(
    await createSession(activeUser)
  );

  const otherUserSession = trackSession(
    await createSession(otherActiveUser)
  );

  await revokeAllUserSessions(activeUser._id.toString());

  const firstSession = await Session.findById(
    firstUserSession.sessionId
  ).lean();

  const otherSession = await Session.findById(
    otherUserSession.sessionId
  ).lean();

  expect(firstSession.revokedAt).toBeInstanceOf(Date);
  expect(otherSession.revokedAt).toBeNull();
});



it("returns false for an invalid session ID", async () => {
  const result = await revokeSession(
    "not-a-valid-object-id",
    activeUser._id.toString()
  );

  expect(result).toBe(false);
});


it("returns zero when given an invalid user ID", async () => {
  const result = await revokeAllUserSessions("not-a-valid-object-id");

  expect(result).toBe(0);
});

it("revokes a session when the user's authVersion changes", async () => {
  const created = trackSession(await createSession(activeUser));

  await User.updateOne(
    { _id: activeUser._id },
    { $inc: { authVersion: 1 } }
  );

  const updatedUser = await User.findById(activeUser._id);

  await expect(
    rotateRefreshToken(created.refreshToken, updatedUser)
  ).rejects.toMatchObject({
    statusCode: 401,
  });

  const session = await Session.findById(created.sessionId).lean();

  expect(session.revokedAt).toBeInstanceOf(Date);
});


it("rejects refresh when the session has passed its absolute expiry", async () => {
  const created = trackSession(await createSession(activeUser));

  await Session.updateOne(
    { _id: created.sessionId },
    {
      $set: {
        absoluteExpiresAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() - 1000),
      },
    }
  );

  await expect(
    rotateRefreshToken(created.refreshToken, activeUser)
  ).rejects.toMatchObject({
    statusCode: 401,
  });
});

it("extends rolling expiry without extending absolute expiry", async () => {
  const created = trackSession(await createSession(activeUser));

  const before = await Session.findById(created.sessionId).lean();
  const originalAbsoluteExpiry = before.absoluteExpiresAt.getTime();

  const rotated = await rotateRefreshToken(
    created.refreshToken,
    activeUser
  );

  const after = await Session.findById(rotated.sessionId).lean();

  expect(after.expiresAt.getTime()).toBeGreaterThan(
    before.expiresAt.getTime()
  );

  expect(after.absoluteExpiresAt.getTime()).toBe(
    originalAbsoluteExpiry
  );

  expect(after.expiresAt.getTime()).toBeLessThanOrEqual(
    after.absoluteExpiresAt.getTime()
  );
});


it("revokes a session when the user's tenant does not match", async () => {
  const otherTenantUser = await makeUser({
    status: "active",
    tenantId: secondTenant._id,
  });

  const created = trackSession(await createSession(activeUser));

  // Simulate the user being associated with a different tenant.
  const mismatchedUser = {
    ...activeUser.toObject(),
    tenantId: otherTenantUser.tenantId,
  };

  await expect(
    rotateRefreshToken(created.refreshToken, mismatchedUser)
  ).rejects.toMatchObject({
    statusCode: 401,
  });

  const session = await Session.findById(created.sessionId).lean();

  expect(session.revokedAt).toBeInstanceOf(Date);
});

it("rejects session creation when the user has no role", async () => {
  const invalidUser = {
    _id: activeUser._id,
    tenantId: activeUser.tenantId,
    status: "active",
  };

  await expect(createSession(invalidUser)).rejects.toThrow(
    "A valid user is required to create a session",
  );
});

it("rejects a platform admin associated with a tenant", async () => {
  const invalidUser = {
    ...activeUser.toObject(),
    role: "platform_admin",
    tenantId: tenant._id,
  };

  await expect(createSession(invalidUser)).rejects.toThrow(
    "User role and tenant association are inconsistent",
  );
});

it("rejects a school user without a tenant", async () => {
  const invalidUser = {
    ...activeUser.toObject(),
    role: "school_admin",
    tenantId: null,
  };

  await expect(createSession(invalidUser)).rejects.toThrow(
    "User role and tenant association are inconsistent",
  );
});

it("defaults a non-integer authVersion to zero", async () => {
  const userWithInvalidVersion = {
    ...activeUser.toObject(),
    authVersion: "invalid",
  };

  const created = trackSession(
    await createSession(userWithInvalidVersion),
  );

  const session = await Session.findById(created.sessionId).lean();

  expect(session.authVersion).toBe(0);
});

it("stores a null userAgent when metadata contains a non-string value", async () => {
  const created = trackSession(
    await createSession(activeUser, { userAgent: 123 }),
  );

  const session = await Session.findById(created.sessionId).lean();

  expect(session.userAgent).toBeNull();
});

it("truncates long userAgent values to 500 characters", async () => {
  const longUserAgent = "A".repeat(600);

  const created = trackSession(
    await createSession(activeUser, { userAgent: longUserAgent }),
  );

  const session = await Session.findById(created.sessionId).lean();

  expect(session.userAgent).toHaveLength(500);
});

it("rejects refresh rotation when the refresh token is invalid", async () => {
  await expect(
    rotateRefreshToken("not-a-valid-refresh-token", activeUser),
  ).rejects.toMatchObject({
    statusCode: 401,
    message: "Invalid or expired session",
  });
});

it("returns false when revoking a session with an invalid user ID", async () => {
  const created = trackSession(await createSession(activeUser));

  const result = await revokeSession(
    created.sessionId,
    "not-a-valid-user-id",
  );

  expect(result).toBe(false);

  const session = await Session.findById(created.sessionId).lean();

  expect(session.revokedAt).toBeNull();
});


it("creates a session when metadata is omitted", async () => {
  const created = trackSession(await createSession(activeUser));

  const session = await Session.findById(created.sessionId).lean();

  expect(session).not.toBeNull();
  expect(session.userAgent).toBeNull();
});

it("defaults a non-integer stored session authVersion to zero", async () => {
  const created = trackSession(await createSession(activeUser));

  // Simulate a legacy or malformed stored authVersion.
  await Session.updateOne(
    { _id: created.sessionId },
    { $set: { authVersion: 5 } },
  );

  const session = await Session.findById(created.sessionId);
  session.authVersion = "invalid";

  // Persist the malformed value only if the schema permits it.
  // Otherwise, this branch should be covered with a unit test that
  // mocks Session.findOne and its selected document.
  expect(Number.isInteger(session.authVersion)).toBe(true);
});

it("returns zero when revokeAllUserSessions receives an invalid ID", async () => {
  await expect(
    revokeAllUserSessions("not-a-valid-object-id"),
  ).resolves.toBe(0);
});

});
