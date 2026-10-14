import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import env from "../config/env.js";
import app from "../app.js";
import { afterEach, describe, expect, it } from "vitest";
import app from "../app.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import Session from "../models/Session.js";
import { verifyRefreshToken } from "../utils/tokens.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
const baseUrl = `http://127.0.0.1:${process.env.TEST_API_PORT || 4317}`;

let server;
const createdSessionIds = new Set();
const EXPECTED_TEST_DATABASE = "school-erp-test";

beforeAll(async () => {
  if (env.nodeEnv !== "test") {
    throw new Error("Auth tests must run with NODE_ENV=test");
  }

  if (!env.mongoUri) {
    throw new Error("MONGO_TEST_URI is not configured");
  }

  const match = env.mongoUri.match(
    /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/
  );

  if (
    !match ||
    decodeURIComponent(match[1]) !== EXPECTED_TEST_DATABASE
  ) {
    throw new Error(
      `Refusing to run auth tests against a database other than ${EXPECTED_TEST_DATABASE}`
    );
  }

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
    await mongoose.disconnect();

    throw new Error(
      `Connected to unexpected database: ${mongoose.connection.name}`
    );
  }
}, 30000);



const startServer = async () => {
  if (server) return;

  server = app.listen(Number(new URL(baseUrl).port), "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
};


afterAll(async () => {
  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      server = undefined;
    }

    if (createdSessionIds.size > 0) {
      await Session.deleteMany({
        _id: { $in: [...createdSessionIds] },
      });
    }
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}, 30000);

describe("Authentication API tests", () => {

it("rejects login when email and password are missing", async () => {
  await startServer();

  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientType: "mobile",
    }),
  });

  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.success).toBe(false);
  expect(body.message).toBe("Email and password are required");
});

it("rejects login with invalid credentials", async () => {
  await startServer();
  expect(mongoose.connection.readyState).toBe(1);
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientType: "mobile",
      email: "nonexistent-user@example.test",
      password: "IncorrectPassword123!",
    }),
  });

  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.success).toBe(false);
  expect(body.message).toBe(
    "Invalid credentials or inactive account"
  );
});


it("logs in an active school user successfully on mobile", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  try {
    tenant = await Tenant.create({
      name: `Auth Test School ${suffix}`,
      slug: `auth-test-${suffix}`,
      status: "active",
    });

    const password = "ValidTestPassword123!";

    user = await User.create({
      tenantId: tenant._id,
      firstName: "Auth",
      lastName: "Test",
      email: `auth-test-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      role: "school_admin",
      status: "active",
    });

    const response = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password,
        }),
      }
    );

    const body = await response.json();

    const payload = verifyRefreshToken(body.refreshToken);
    createdSessionIds.add(payload.sid);
expect(response.status).toBe(200);
expect(body.success).toBe(true);

expect(typeof body.accessToken).toBe("string");
expect(body.accessToken.length).toBeGreaterThan(0);

expect(typeof body.refreshToken).toBe("string");
expect(body.refreshToken.length).toBeGreaterThan(0);

  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});

it("rejects login for a suspended school user", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  try {
    tenant = await Tenant.create({
      name: `Suspended Test School ${suffix}`,
      slug: `suspended-test-${suffix}`,
      status: "active",
    });

    const password = "ValidTestPassword123!";

    user = await User.create({
      tenantId: tenant._id,
      firstName: "Suspended",
      lastName: "User",
      email: `suspended-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      role: "school_admin",
      status: "suspended",
    });

    const response = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password,
        }),
      }
    );

    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toBe(
      "Invalid credentials or inactive account"
    );
  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});


it("refreshes tokens successfully for a mobile user", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  try {
    tenant = await Tenant.create({
      name: `Refresh Test School ${suffix}`,
      slug: `refresh-test-${suffix}`,
      status: "active",
    });

    const password = "ValidTestPassword123!";

    user = await User.create({
      tenantId: tenant._id,
      firstName: "Refresh",
      lastName: "Test",
      email: `refresh-test-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      role: "school_admin",
      status: "active",
    });

    // Log in to create a session and obtain its refresh token.
    const loginResponse = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password,
        }),
      }
    );

    const loginBody = await loginResponse.json();
   const loginPayload = verifyRefreshToken(loginBody.refreshToken);
    createdSessionIds.add(loginPayload.sid);
    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);
    expect(typeof loginBody.refreshToken).toBe("string");
    expect(loginBody.refreshToken.length).toBeGreaterThan(0);

    const originalRefreshToken = loginBody.refreshToken;

    // Exchange the refresh token for a new token pair.
    const refreshResponse = await fetch(
      `${baseUrl}/api/v1/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          refreshToken: originalRefreshToken,
        }),
      }
    );

    const refreshBody = await refreshResponse.json();
   const refreshPayload = verifyRefreshToken(refreshBody.refreshToken);
    createdSessionIds.add(refreshPayload.sid);
    expect(refreshResponse.status).toBe(200);
    expect(refreshBody.success).toBe(true);

    expect(typeof refreshBody.accessToken).toBe("string");
    expect(refreshBody.accessToken.length).toBeGreaterThan(0);

    expect(typeof refreshBody.refreshToken).toBe("string");
    expect(refreshBody.refreshToken.length).toBeGreaterThan(0);

    expect(refreshBody.refreshToken).not.toBe(originalRefreshToken);
    expect(refreshBody.user.email).toBe(user.email);
  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});

it("rejects an invalid mobile refresh token", async () => {
  await startServer();

  const response = await fetch(
    `${baseUrl}/api/v1/auth/refresh`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientType: "mobile",
        refreshToken: "invalid.refresh.token",
      }),
    }
  );

  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.success).toBe(false);
  expect(body.message).toBe(
    "Invalid or expired refresh token"
  );

  expect(body.accessToken).toBeUndefined();
  expect(body.refreshToken).toBeUndefined();
});

it("logs out a mobile user and revokes their session", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  try {
    tenant = await Tenant.create({
      name: `Logout Test School ${suffix}`,
      slug: `logout-test-${suffix}`,
      status: "active",
    });

    const password = "ValidTestPassword123!";

    user = await User.create({
      tenantId: tenant._id,
      firstName: "Logout",
      lastName: "Test",
      email: `logout-test-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      role: "school_admin",
      status: "active",
    });

    const loginResponse = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password,
        }),
      }
    );

    const loginBody = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);

    const payload = verifyRefreshToken(loginBody.refreshToken);
    createdSessionIds.add(payload.sid);

    const logoutResponse = await fetch(
      `${baseUrl}/api/v1/auth/logout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          refreshToken: loginBody.refreshToken,
        }),
      }
    );

    const logoutBody = await logoutResponse.json();

    expect(logoutResponse.status).toBe(200);
    expect(logoutBody.success).toBe(true);
    expect(logoutBody.message).toBe("Logged out");

    const session = await Session.findById(payload.sid).lean();

    expect(session).not.toBeNull();
    expect(session.revokedAt).toBeInstanceOf(Date);
  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});

it("rejects a password change when the current password is incorrect", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  try {
    tenant = await Tenant.create({
      name: `Password Test School ${suffix}`,
      slug: `password-test-${suffix}`,
      status: "active",
    });

    const password = "ValidTestPassword123!";

    user = await User.create({
      tenantId: tenant._id,
      firstName: "Password",
      lastName: "Test",
      email: `password-test-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      role: "school_admin",
      status: "active",
    });

    const loginResponse = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password,
        }),
      }
    );

    const loginBody = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);
    expect(loginBody.accessToken).toBeTruthy();

    const payload = verifyRefreshToken(loginBody.refreshToken);
    createdSessionIds.add(payload.sid);

    const response = await fetch(
      `${baseUrl}/api/v1/auth/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
       body: JSON.stringify({
        clientType: "mobile",
        currentPassword: "WrongCurrentPassword123!",
        newPassword: "NewValidPassword456!",
        }),
      }
    );

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Current password is incorrect");

    // Confirm the stored password was not changed.
    const storedUser = await User.findById(user._id)
      .select("+passwordHash")
      .lean();

    expect(
      await import("../utils/password.js").then(({ verifyPassword }) =>
        verifyPassword(password, storedUser.passwordHash)
      )
    ).toBe(true);
  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});
 
it("changes the password and revokes existing sessions", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  const originalPassword = "ValidTestPassword123!";
  const newPassword = "NewSecurePassword456!";

  try {
    tenant = await Tenant.create({
      name: `Change Password School ${suffix}`,
      slug: `change-password-${suffix}`,
      status: "active",
    });

    user = await User.create({
      tenantId: tenant._id,
      firstName: "Change",
      lastName: "Password",
      email: `change-password-${suffix}@example.test`,
      passwordHash: await hashPassword(originalPassword),
      role: "school_admin",
      status: "active",
    });

    // Log in with the original password.
    const loginResponse = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password: originalPassword,
        }),
      }
    );

    const loginBody = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);

    const payload = verifyRefreshToken(loginBody.refreshToken);
    createdSessionIds.add(payload.sid);

    const originalAuthVersion = user.authVersion;

    // Change the password using the valid access token.
    const response = await fetch(
      `${baseUrl}/api/v1/auth/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
        body: JSON.stringify({
          clientType: "mobile",
          currentPassword: originalPassword,
          newPassword,
        }),
      }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe(
      "Password changed. Please sign in again."
    );

    // Verify the new password hash and authVersion in MongoDB.
    const updatedUser = await User.findById(user._id)
      .select("+passwordHash authVersion")
      .lean();

    expect(
      await verifyPassword(newPassword, updatedUser.passwordHash)
    ).toBe(true);

    expect(
      await verifyPassword(originalPassword, updatedUser.passwordHash)
    ).toBe(false);

    expect(updatedUser.authVersion).toBe(originalAuthVersion + 1);

    // Verify the previous session was revoked.
    const session = await Session.findById(payload.sid).lean();

    expect(session).not.toBeNull();
    expect(session.revokedAt).toBeInstanceOf(Date);
  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});


it("rejects an old access token after a password change", async () => {
  await startServer();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tenant;
  let user;

  const originalPassword = "ValidTestPassword123!";
  const newPassword = "NewSecurePassword456!";

  try {
    tenant = await Tenant.create({
      name: `Old Token Test School ${suffix}`,
      slug: `old-token-test-${suffix}`,
      status: "active",
    });

    user = await User.create({
      tenantId: tenant._id,
      firstName: "OldToken",
      lastName: "Test",
      email: `old-token-${suffix}@example.test`,
      passwordHash: await hashPassword(originalPassword),
      role: "school_admin",
      status: "active",
    });

    // Log in and retain the original access token.
    const loginResponse = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: "mobile",
          tenantSlug: tenant.slug,
          email: user.email,
          password: originalPassword,
        }),
      }
    );

    const loginBody = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);

    const payload = verifyRefreshToken(loginBody.refreshToken);
    createdSessionIds.add(payload.sid);

    // Change the password using the original access token.
    const changeResponse = await fetch(
      `${baseUrl}/api/v1/auth/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
        body: JSON.stringify({
          clientType: "mobile",
          currentPassword: originalPassword,
          newPassword,
        }),
      }
    );

    expect(changeResponse.status).toBe(200);

    // The old access token must now be rejected.
    const oldTokenResponse = await fetch(
      `${baseUrl}/api/v1/auth/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
        body: JSON.stringify({
          clientType: "mobile",
          currentPassword: newPassword,
          newPassword: "AnotherSecurePassword789!",
        }),
      }
    );

    const oldTokenBody = await oldTokenResponse.json();

    expect(oldTokenResponse.status).toBe(401);
    expect(oldTokenBody.success).toBe(false);
    expect(oldTokenBody.message).toBe(
      "Session invalidated; please sign in again"
    );
  } finally {
    if (user) {
      await User.deleteOne({ _id: user._id });
    }

    if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
  }
});

});
