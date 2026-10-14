
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import env from "../config/env.js";

const JWT_ISSUER = "school-erp-api";
const JWT_AUDIENCE = "school-erp-clients";

const commonOptions = {
  algorithm: "HS256",
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

export const createAccessToken = (user) => {
  const userId = String(user._id);
  const tenantId = user.tenantId
    ? String(user.tenantId)
    : null;

  const authVersion = Number.isInteger(user.authVersion)
    ? user.authVersion
    : 0;

  return jwt.sign(
    {
      tokenType: "access",
      tenantId,
      role: user.role,
      authVersion,
    },
    env.jwtAccessSecret,
    {
      ...commonOptions,
      subject: userId,
      expiresIn: "15m",
    }
  );
};

export const createRefreshToken = (user, sessionId) => {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("A valid session ID is required");
  }

  return jwt.sign(
    {
      tokenType: "refresh",
      sid: sessionId,
    },
    env.jwtRefreshSecret,
    {
      ...commonOptions,
      subject: String(user._id),
      jwtid: randomUUID(),
      expiresIn: "7d",
    }
  );
};

const verifyToken = (token, secret, expectedType) => {
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (
    typeof payload === "string" ||
    payload.tokenType !== expectedType
  ) {
    throw new Error("Invalid token type");
  }

  return payload;
};

export const verifyAccessToken = (token) =>
  verifyToken(token, env.jwtAccessSecret, "access");

export const verifyRefreshToken = (token) =>
  verifyToken(token, env.jwtRefreshSecret, "refresh");
