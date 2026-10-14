
import mongoose from "mongoose";

import Session from "../models/Session.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import { hashRefreshToken } from "../utils/refreshTokenHash.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_CONCURRENCY_GRACE_MS = 5 * 1000;
const createSessionError = (message = "Invalid or expired session") => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};


const assertValidUser = (user) => {
  if (!user?._id || !user.role) {
    throw new Error("A valid user is required to create a session");
  }

  if (
    user.role === "platform_admin"
      ? user.tenantId != null
      : user.tenantId == null
  ) {
    throw new Error("User role and tenant association are inconsistent");
  }

  if (user.status !== "active") {
    throw createSessionError("User account is not active");
  }
};

const createTokenPair = (user, sessionId) => ({
  accessToken: createAccessToken(user),
  refreshToken: createRefreshToken(user, String(sessionId)),
});


export const createSession = async (user, metadata = {}) => {
  assertValidUser(user);

  const sessionId = new mongoose.Types.ObjectId();

  const authVersion = Number.isInteger(user.authVersion)
  ? user.authVersion
  : 0;

  const tokens = createTokenPair(user, sessionId);

  // Define now before using it.
  const now = new Date();

  const absoluteExpiresAt = new Date(
    now.getTime() + ABSOLUTE_SESSION_DURATION_MS
  );

  const expiresAt = new Date(
    Math.min(
      now.getTime() + SESSION_DURATION_MS,
      absoluteExpiresAt.getTime()
    )
  );

  const session = await Session.create({
    _id: sessionId,
   userId: user._id,
          authVersion,
  tenantId: user.tenantId ?? null,
    refreshTokenHash: hashRefreshToken(tokens.refreshToken),
    expiresAt,
    absoluteExpiresAt,
    lastUsedAt: now,
    userAgent:
      typeof metadata.userAgent === "string"
        ? metadata.userAgent.slice(0, 500)
        : null,
  });

  return {
    ...tokens,
    sessionId: String(session._id),
    expiresAt: session.expiresAt,
  };
};


export const rotateRefreshToken = async (refreshToken, user) => {
  assertValidUser(user);

  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw createSessionError();
  }

  if (
    payload.sub !== String(user._id) ||
    typeof payload.sid !== "string" ||
    !mongoose.isValidObjectId(payload.sid)
  ) {
    throw createSessionError();
  }

  const sessionId = new mongoose.Types.ObjectId(payload.sid);
  const now = new Date();

 const session = await Session.findOne({
  _id: sessionId,
  userId: user._id,
  revokedAt: null,
  expiresAt: { $gt: now },
  absoluteExpiresAt: { $gt: now },
}).select("+refreshTokenHash +previousRefreshTokenHash");
  if (!session) {
    throw createSessionError();
  }
  
  const currentAuthVersion = Number.isInteger(user.authVersion)
    ? user.authVersion
    : 0;

  const sessionAuthVersion = Number.isInteger(session.authVersion)
    ? session.authVersion
    : 0;

  if (sessionAuthVersion !== currentAuthVersion) {
    await Session.updateOne(
      {
        _id: sessionId,
        userId: user._id,
        revokedAt: null,
      },
      {
        $set: { revokedAt: now },
      }
    );

    throw createSessionError(
      "Session invalidated; please sign in again"
    );
  }

  const presentedHash = hashRefreshToken(refreshToken);

 
  if (session.refreshTokenHash !== presentedHash) {
    const previousTokenMatches =
      session.previousRefreshTokenHash === presentedHash;

    const rotatedAt = session.previousRefreshTokenRotatedAt;
    const withinGraceWindow =
      rotatedAt instanceof Date &&
      now.getTime() - rotatedAt.getTime() >= 0 &&
      now.getTime() - rotatedAt.getTime() <=
        REFRESH_CONCURRENCY_GRACE_MS;

    if (previousTokenMatches && withinGraceWindow) {
      throw createSessionError(
        "Refresh already completed; use the latest session credentials"
      );
    }

    // A stale token outside the grace window is treated as replay.
    await Session.updateOne(
      {
        _id: sessionId,
        userId: user._id,
        revokedAt: null,
      },
      {
        $set: { revokedAt: now },
      }
    );

    throw createSessionError(
      "Refresh token reuse detected; please sign in again"
    );
  }


  if (String(session.tenantId ?? "") !== String(user.tenantId ?? "")) {
    await Session.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: now } }
    );

    throw createSessionError();
  }

  const tokens = createTokenPair(user, sessionId);
 
  const nextExpiresAt = new Date(
    Math.min(
      now.getTime() + SESSION_DURATION_MS,
      session.absoluteExpiresAt.getTime()
    )
  );


  // Atomic compare-and-swap: only one request can rotate this token.
  const updatedSession = await Session.findOneAndUpdate(
    {
  _id: sessionId,
  userId: user._id,
  authVersion: currentAuthVersion,
  refreshTokenHash: presentedHash,
  revokedAt: null,
  expiresAt: { $gt: now },
  absoluteExpiresAt: { $gt: now },
},
    {
    $set: {
    previousRefreshTokenHash: presentedHash,
    previousRefreshTokenRotatedAt: now,
    refreshTokenHash: hashRefreshToken(tokens.refreshToken),
    expiresAt: nextExpiresAt,
    lastUsedAt: now,
  },
    },
   
    { returnDocument: "after" }
  );

 
if (!updatedSession) {
  // Another request may have rotated or revoked this session.
  // Do not revoke it again merely because this atomic update lost.
  throw createSessionError(
    "Session changed during refresh; please retry"
  );
}


  return {
    ...tokens,
    sessionId: String(sessionId),
    expiresAt: updatedSession.expiresAt,
  };

};

export const revokeSession = async (sessionId, userId) => {
  if (
    typeof sessionId !== "string" ||
    !mongoose.isValidObjectId(sessionId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    return false;
  }

  const result = await Session.updateOne(
    {
      _id: new mongoose.Types.ObjectId(sessionId),
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    }
  );

  return result.modifiedCount === 1;
};



export const revokeAllUserSessions = async (userId) => {
  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId)
  ) {
    return 0;
  }

  const result = await Session.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    }
  );

  return result.modifiedCount;
};
