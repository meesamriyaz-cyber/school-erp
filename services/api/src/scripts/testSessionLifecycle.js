
import "dotenv/config";

import assert from "node:assert/strict";
import mongoose from "mongoose";

import Session from "../models/Session.js";
import {
  createSession,
  rotateRefreshToken,
  revokeSession,
} from "../services/sessionService.js";

const sessionIds = [];

const testSessionLifecycle = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const user = {
      _id: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      role: "teacher",
      status: "active",
    };

    // 1. Create a session.
    const original = await createSession(user, {
      userAgent: "School ERP integration test",
    });

    sessionIds.push(original.sessionId);

    assert.ok(original.accessToken);
    assert.ok(original.refreshToken);
    assert.ok(original.expiresAt instanceof Date);

    console.log("PASS: Session creation");

    // 2. Rotate the refresh token.
    const rotated = await rotateRefreshToken(
      original.refreshToken,
      user
    );

    assert.ok(rotated.accessToken);
    assert.ok(rotated.refreshToken);
    assert.notEqual(rotated.refreshToken, original.refreshToken);

    console.log("PASS: Refresh-token rotation");

    // 3. Reusing the old token must fail and revoke the session.
    
    // 3. A duplicate request inside the grace window must not revoke
    // the session, although the old token must still be rejected.
    await assert.rejects(
      () => rotateRefreshToken(original.refreshToken, user),
      /refresh already completed/i
    );

    console.log("PASS: Recent duplicate refresh rejected");

    let replayedSession = await Session.findById(
      original.sessionId
    );

    assert.equal(replayedSession.revokedAt, null);

    console.log("PASS: Recent duplicate does not revoke session");

    // Simulate the same old token being presented outside the
    // five-second grace window.
    await Session.updateOne(
      { _id: original.sessionId },
      {
        $set: {
          previousRefreshTokenRotatedAt: new Date(
            Date.now() - 6000
          ),
        },
      }
    );

    await assert.rejects(
      () => rotateRefreshToken(original.refreshToken, user),
      /reuse detected/i
    );

    console.log("PASS: Old refresh-token reuse rejected");

    replayedSession = await Session.findById(
      original.sessionId
    );

    assert.ok(replayedSession.revokedAt);

    console.log("PASS: Replay outside grace window revokes session");


    // 4. The rotated token must no longer work after revocation.
    await assert.rejects(
      () => rotateRefreshToken(rotated.refreshToken, user),
      /invalid or expired session/i
    );

    console.log("PASS: Revoked session cannot be refreshed");

    // 5. A separate session should be revocable by logout.
    const logoutSession = await createSession(user);

    sessionIds.push(logoutSession.sessionId);

    const revoked = await revokeSession(
      logoutSession.sessionId,
      String(user._id)
    );

    assert.equal(revoked, true);

    console.log("PASS: Logout revokes the session");

    await assert.rejects(
      () => rotateRefreshToken(logoutSession.refreshToken, user),
      /invalid or expired session/i
    );

    console.log("PASS: Logged-out session cannot be refreshed");
    
    // 6. Changing authVersion must invalidate an existing refresh session.
    const versionedUser = {
      ...user,
      authVersion: 0,
    };

    const versionedSession = await createSession(versionedUser);

    sessionIds.push(versionedSession.sessionId);

    const storedSession = await Session.findById(
      versionedSession.sessionId
    );

    assert.equal(storedSession.authVersion, 0);

    // Simulate a password reset or other security-related change.
    versionedUser.authVersion = 1;

    await assert.rejects(
      () =>
        rotateRefreshToken(
          versionedSession.refreshToken,
          versionedUser
        ),
      /session invalidated/i
    );

    console.log("PASS: Refresh token rejected after authVersion change");

    const invalidatedSession = await Session.findById(
      versionedSession.sessionId
    );

    assert.ok(invalidatedSession.revokedAt);

    console.log("PASS: Outdated refresh session revoked");


    console.log("All session lifecycle tests passed.");
  } finally {
    try {
      if (sessionIds.length > 0) {
        await Session.deleteMany({
          _id: {
            $in: sessionIds.map(
              (id) => new mongoose.Types.ObjectId(id)
            ),
          },
        });
      }
    } finally {
      await mongoose.disconnect();
    }
  }
};

try {
  await testSessionLifecycle();
} catch (error) {
  console.error("Session lifecycle test failed:", error.message);
  process.exitCode = 1;
}
