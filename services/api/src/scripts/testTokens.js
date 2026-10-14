
import assert from "node:assert/strict";

import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/tokens.js";

const user = {
  _id: "68f123456789abcdef123456",
  tenantId: "68f123456789abcdef654321",
  role: "teacher",
};

const accessToken = createAccessToken(user);
const refreshToken = createRefreshToken(
  user,
  "test-session-001"
);

const accessPayload = verifyAccessToken(accessToken);

assert.equal(accessPayload.sub, user._id);
assert.equal(accessPayload.tenantId, user.tenantId);
assert.equal(accessPayload.role, "teacher");
assert.equal(accessPayload.tokenType, "access");

console.log("PASS: Access token creation and verification");

const refreshPayload = verifyRefreshToken(refreshToken);

assert.equal(refreshPayload.sub, user._id);
assert.equal(refreshPayload.sid, "test-session-001");
assert.equal(refreshPayload.tokenType, "refresh");

console.log("PASS: Refresh token creation and verification");

assert.throws(() => verifyAccessToken(refreshToken));

console.log("PASS: Refresh token rejected as access token");

assert.throws(() => verifyRefreshToken(accessToken));

console.log("PASS: Access token rejected as refresh token");

assert.throws(() => createRefreshToken(user, ""));

console.log("PASS: Refresh token requires a session ID");

console.log("All token utility tests passed.");
