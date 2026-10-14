
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../models/User.js";
import authenticate from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { createAccessToken } from "../utils/tokens.js";

const createResponse = () => ({
  statusCode: 200,
  body: null,

  status(code) {
    this.statusCode = code;
    return this;
  },

  json(body) {
    this.body = body;
    return this;
  },
});

const runMiddleware = async (middleware, req) => {
  const res = createResponse();
  let nextCalled = false;
  let nextError;

  await middleware(req, res, (error) => {
    nextCalled = true;
    nextError = error;
  });

  return { req, res, nextCalled, nextError };
};

const testAuthMiddleware = async () => {
  // Missing credentials should be rejected without a DB query.
  const missingAuth = await runMiddleware(
    authenticate,
    { headers: {} }
  );

  assert.equal(missingAuth.res.statusCode, 401);
  assert.equal(missingAuth.nextCalled, false);

  console.log("PASS: Missing access token rejected");

  // Role authorization must reject unauthenticated requests.
  const unauthenticatedRole = await runMiddleware(
    authorizeRoles("school_admin"),
    {}
  );

  assert.equal(unauthenticatedRole.res.statusCode, 401);

  console.log("PASS: Role check requires authentication");

  // A valid authentication context with a disallowed role
  // must be rejected.
  const forbiddenRole = await runMiddleware(
    authorizeRoles("school_admin"),
    {
      auth: {
        userId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        role: "teacher",
      },
    }
  );

  assert.equal(forbiddenRole.res.statusCode, 403);

  console.log("PASS: Disallowed role rejected");

  // An allowed role should continue to the route handler.
  const allowedRole = await runMiddleware(
    authorizeRoles("teacher", "school_admin"),
    {
      auth: {
        userId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        role: "teacher",
      },
    }
  );

  assert.equal(allowedRole.nextCalled, true);
  assert.equal(allowedRole.res.statusCode, 200);

  console.log("PASS: Allowed role accepted");

  // A signed token for a nonexistent user must not authenticate.
  const fakeUser = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: new mongoose.Types.ObjectId(),
    role: "teacher",
  };

  const token = createAccessToken(fakeUser);
  const originalFindById = User.findById;

  User.findById = () => ({
    select: async () => null,
  });

  try {
    const nonexistentUser = await runMiddleware(
      authenticate,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }
    );

    assert.equal(nonexistentUser.res.statusCode, 401);
    assert.equal(nonexistentUser.nextCalled, false);

    console.log("PASS: Token for nonexistent user rejected");
  } finally {
    User.findById = originalFindById;
  }
 
  // An old access token must be rejected after authVersion changes.
  const versionedUser = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: new mongoose.Types.ObjectId(),
    role: "teacher",
    authVersion: 0,
  };

  const oldToken = createAccessToken(versionedUser);
  const originalFindByIdForVersionTest = User.findById;

 
User.findById = () => ({
  select() {
    return {
      lean: async () => ({
        _id: versionedUser._id,
        tenantId: versionedUser.tenantId,
        role: versionedUser.role,
        status: "active",
        authVersion: 1,
      }),
    };
  },
});


  try {
    const staleTokenResult = await runMiddleware(
      authenticate,
      {
        headers: {
          authorization: `Bearer ${oldToken}`,
        },
      }
    );

    assert.equal(staleTokenResult.res.statusCode, 401);
    assert.equal(staleTokenResult.nextCalled, false);
    assert.equal(
      staleTokenResult.res.body.message,
      "Session invalidated; please sign in again"
    );

    console.log("PASS: Old access token rejected after authVersion change");
  } finally {
    User.findById = originalFindByIdForVersionTest;
  }

  console.log("All authentication middleware tests passed.");
};

try {
  await testAuthMiddleware();
} catch (error) {
  console.error("Authentication middleware test failed:", error);
  process.exitCode = 1;
}
