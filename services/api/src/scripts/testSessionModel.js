
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Session from "../models/Session.js";
import { hashRefreshToken } from "../utils/refreshTokenHash.js";

const testSessionModel = async () => {
  const userId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();

  const rawToken = "example-refresh-token-for-testing";
  const tokenHash = hashRefreshToken(rawToken);

  assert.notEqual(tokenHash, rawToken);
  assert.equal(tokenHash.length, 64);
  assert.equal(hashRefreshToken(rawToken), tokenHash);

  console.log("PASS: Refresh token hashing");

  
const session = new Session({
  userId,
  tenantId,
  refreshTokenHash: tokenHash,
  expiresAt: new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ),
  absoluteExpiresAt: new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ),
});


  await session.validate();

  assert.equal(String(session.userId), String(userId));
  assert.equal(String(session.tenantId), String(tenantId));
  assert.equal(session.revokedAt, null);

  console.log("PASS: School session validation");

  
const platformSession = new Session({
  userId,
  tenantId: null,
  refreshTokenHash: hashRefreshToken("platform-test-token"),
  expiresAt: new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ),
  absoluteExpiresAt: new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ),
});


  await platformSession.validate();

  assert.equal(platformSession.tenantId, null);

  console.log("PASS: Platform session validation");

  const invalidSession = new Session({
    userId,
    refreshTokenHash: tokenHash,
  });

  await assert.rejects(
    invalidSession.validate(),
    (error) => error.name === "ValidationError"
  );

  console.log("PASS: Missing expiration is rejected");
  console.log("All Session model validation tests passed.");
};

try {
  await testSessionModel();
} catch (error) {
  console.error("Session model test failed:", error.message);
  process.exitCode = 1;
}
