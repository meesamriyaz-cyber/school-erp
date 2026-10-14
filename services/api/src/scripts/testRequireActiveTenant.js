
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Tenant from "../models/Tenant.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";

const originalFindOne = Tenant.findOne;

const runMiddleware = async (auth) => {
  const req = { auth };
  const result = {
    statusCode: null,
    body: null,
    nextCalled: false,
    error: null,
  };

  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };

  await requireActiveTenant(req, res, (error) => {
    if (error) {
      result.error = error;
    } else {
      result.nextCalled = true;
    }
  });

  return { req, ...result };
};

const fakeTenantQuery = (tenant) => ({
  select() {
    return this;
  },
  lean: async () => tenant,
});

const runTests = async () => {
  try {
    // No authenticated user.
    const missingAuth = await runMiddleware(undefined);

    assert.equal(missingAuth.statusCode, 401);
    assert.equal(missingAuth.nextCalled, false);

    // Platform administrator cannot use a school-specific route.
    const platformAdmin = await runMiddleware({
      role: "platform_admin",
      tenantId: null,
    });

    assert.equal(platformAdmin.statusCode, 403);
    assert.equal(platformAdmin.nextCalled, false);

    // School user without a tenant is rejected.
    const missingTenant = await runMiddleware({
      role: "school_admin",
      tenantId: null,
    });

    assert.equal(missingTenant.statusCode, 403);
    assert.equal(missingTenant.nextCalled, false);

    // Malformed tenant ID is rejected before querying MongoDB.
    const invalidTenant = await runMiddleware({
      role: "teacher",
      tenantId: "not-an-object-id",
    });

    assert.equal(invalidTenant.statusCode, 403);
    assert.equal(invalidTenant.nextCalled, false);

    // Suspended or missing tenant is rejected.
    Tenant.findOne = () => fakeTenantQuery(null);

    const suspendedTenant = await runMiddleware({
      role: "teacher",
      tenantId: new mongoose.Types.ObjectId().toString(),
    });

    assert.equal(suspendedTenant.statusCode, 403);
    assert.equal(suspendedTenant.nextCalled, false);

    // Active tenant is attached to the request.
    const tenantId = new mongoose.Types.ObjectId();

    Tenant.findOne = () =>
      fakeTenantQuery({
        _id: tenantId,
        name: "Test School",
        slug: "test-school",
        status: "active",
        timezone: "Asia/Kolkata",
      });

    const activeTenant = await runMiddleware({
      role: "teacher",
      tenantId: tenantId.toString(),
    });

    assert.equal(activeTenant.nextCalled, true);
    assert.equal(activeTenant.statusCode, null);
    assert.equal(activeTenant.req.tenantId, tenantId.toString());
    assert.equal(activeTenant.req.tenant.status, "active");

    console.log("requireActiveTenant middleware tests passed.");
  } finally {
    Tenant.findOne = originalFindOne;
  }
};

try {
  await runTests();
} catch (error) {
  console.error("requireActiveTenant tests failed:", error);
  process.exitCode = 1;
}
