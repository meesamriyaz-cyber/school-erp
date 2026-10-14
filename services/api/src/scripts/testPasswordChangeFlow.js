
import "dotenv/config";

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { hashPassword } from "../utils/password.js";

const API_BASE_URL =
  process.env.TEST_API_BASE_URL ||
  "http://localhost:5000/api/v1/auth";

const ORIGINAL_PASSWORD = "TestPass!2026A";
const NEW_PASSWORD = "TestPass!2026B";
const ANOTHER_PASSWORD = "TestPass!2026C";
const TRUSTED_ORIGIN = "http://localhost:5173";

let tenantId = null;
let userId = null;

const request = async (path, { body = {}, token, origin } = {}) => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (origin) {
    headers.Origin = origin;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    // Preserve the HTTP status if the response isn't JSON.
  }

  return {
    status: response.status,
    data,
  };
};

const testPasswordChangeFlow = async () => {
  assert.ok(process.env.MONGO_URI, "MONGO_URI must be configured");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    // 1. Create a disposable active school tenant and teacher.
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const email = `auth-test-${suffix}@example.test`;
    const slug = `auth-test-${suffix}`;

    const tenant = await Tenant.create({
      name: `Temporary Auth Test ${suffix}`,
      slug,
      status: "active",
      contactEmail: email,
      timezone: "Asia/Kolkata",
    });

    tenantId = tenant._id;

    const user = await User.create({
      tenantId,
      firstName: "Temporary",
      lastName: "Tester",
      email,
      passwordHash: await hashPassword(ORIGINAL_PASSWORD),
      role: "teacher",
      status: "active",
    });

    userId = user._id;

    console.log("PASS: Temporary tenant and teacher created");

    // 2. Log in with the original password.
    const login = await request("/login", {
      body: {
        email,
        password: ORIGINAL_PASSWORD,
        tenantSlug: slug,
        clientType: "mobile",
      },
    });

    assert.equal(login.status, 200);
    assert.ok(login.data.accessToken);
    assert.ok(login.data.refreshToken);

    console.log("PASS: Original password accepted");

    // 3. Change the password through the real API.
    const change = await request("/change-password", {
      body: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
      },
      token: login.data.accessToken,
      origin: TRUSTED_ORIGIN,
    });

    assert.equal(change.status, 200);

    console.log("PASS: Password change succeeded");

    // 4. Verify that authVersion was persisted and incremented.
    const updatedUser = await User.findById(userId)
      .select("authVersion")
      .lean();

    assert.equal(updatedUser.authVersion, 1);

    console.log("PASS: authVersion incremented in MongoDB");

    // 5. Verify that the old access token is invalid.
    const staleAccess = await request("/change-password", {
      body: {
        currentPassword: NEW_PASSWORD,
        newPassword: ANOTHER_PASSWORD,
      },
      token: login.data.accessToken,
      origin: TRUSTED_ORIGIN,
    });

    assert.equal(staleAccess.status, 401);

    console.log("PASS: Old access token rejected");

    // 6. Verify that the original refresh token is invalid.
    const staleRefresh = await request("/refresh", {
      body: {
        clientType: "mobile",
        refreshToken: login.data.refreshToken,
      },
    });

    assert.equal(staleRefresh.status, 401);

    console.log("PASS: Old refresh token rejected");

    // 7. Verify that the old password no longer works.
    const oldPasswordLogin = await request("/login", {
      body: {
        email,
        password: ORIGINAL_PASSWORD,
        tenantSlug: slug,
        clientType: "mobile",
      },
    });

    assert.equal(oldPasswordLogin.status, 401);

    console.log("PASS: Old password rejected");

    // 8. Verify that the new password works.
    const newPasswordLogin = await request("/login", {
      body: {
        email,
        password: NEW_PASSWORD,
        tenantSlug: slug,
        clientType: "mobile",
      },
    });

    assert.equal(newPasswordLogin.status, 200);
    assert.ok(newPasswordLogin.data.accessToken);
    assert.ok(newPasswordLogin.data.refreshToken);

    console.log("PASS: New password accepted");
    console.log("All password-change integration tests passed.");
  } finally {
    // Remove only the records created by this test.
    try {
      if (userId) {
        await Session.deleteMany({ userId });
        await User.deleteOne({ _id: userId });
      }

      if (tenantId) {
        await Tenant.deleteOne({ _id: tenantId });
      }
    } finally {
      await mongoose.disconnect();
    }
  }
};

try {
  await testPasswordChangeFlow();
} catch (error) {
  console.error("Password-change integration test failed:", error.message);
  process.exitCode = 1;
}
