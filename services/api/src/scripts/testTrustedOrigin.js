
import assert from "node:assert/strict";

import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";

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

const runMiddleware = (req) => {
  const res = createResponse();
  let nextCalled = false;

  requireTrustedOrigin(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
};

const testTrustedOrigin = () => {
  const trusted = runMiddleware({
    body: { clientType: "web" },
    get: (header) =>
      header === "origin" ? "http://localhost:5173" : undefined,
  });

  assert.equal(trusted.nextCalled, true);
  console.log("PASS: Trusted web origin accepted");

  const untrusted = runMiddleware({
    body: { clientType: "web" },
    get: (header) =>
      header === "origin" ? "https://untrusted.example" : undefined,
  });

  assert.equal(untrusted.res.statusCode, 403);
  assert.equal(untrusted.nextCalled, false);
  console.log("PASS: Untrusted web origin rejected");

  const missingOrigin = runMiddleware({
    body: { clientType: "web" },
    get: () => undefined,
  });

  assert.equal(missingOrigin.res.statusCode, 403);
  console.log("PASS: Missing web origin rejected");

  const mobile = runMiddleware({
    body: { clientType: "mobile" },
    get: () => undefined,
  });

  assert.equal(mobile.nextCalled, true);
  console.log("PASS: Explicit mobile flow accepted without Origin");
  
  // A mobile clientType must not bypass an untrusted Origin.
  const untrustedMobileOrigin = runMiddleware({
    body: { clientType: "mobile" },
    cookies: {},
    get: (header) =>
      header === "origin"
        ? "https://untrusted.example"
        : undefined,
  });

  assert.equal(untrustedMobileOrigin.res.statusCode, 403);
  assert.equal(untrustedMobileOrigin.nextCalled, false);

  console.log("PASS: Mobile clientType cannot bypass untrusted Origin");

  // An originless request with a refresh cookie must be rejected,
  // even if clientType is set to mobile.
  const mobileWithRefreshCookie = runMiddleware({
    body: { clientType: "mobile" },
    cookies: {
      school_erp_refresh: "test-cookie-value",
    },
    get: () => undefined,
  });

  assert.equal(mobileWithRefreshCookie.res.statusCode, 403);
  assert.equal(mobileWithRefreshCookie.nextCalled, false);

  console.log("PASS: Originless refresh-cookie request rejected");


  console.log("All trusted-origin tests passed.");
};

try {
  testTrustedOrigin();
} catch (error) {
  console.error("Trusted-origin test failed:", error.message);
  process.exitCode = 1;
}
