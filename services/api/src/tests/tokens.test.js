
import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

import env from "../config/env.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/tokens.js";

const user = {
  _id: "user-123",
  tenantId: "tenant-456",
  role: "SCHOOL_ADMIN",
  authVersion: 2,
};

describe("JWT token utilities", () => {
  describe("createAccessToken", () => {
    it("creates a valid access token with the expected claims", () => {
      const token = createAccessToken(user);
      const payload = verifyAccessToken(token);

      expect(payload.sub).toBe(user._id);
      expect(payload.tenantId).toBe(user.tenantId);
      expect(payload.role).toBe(user.role);
      expect(payload.authVersion).toBe(2);
      expect(payload.tokenType).toBe("access");
      expect(payload.iss).toBe("school-erp-api");
      expect(payload.aud).toBe("school-erp-clients");
    });

    it("uses null tenantId and authVersion zero when those values are missing or invalid", () => {
      const token = createAccessToken({
        _id: "user-without-tenant",
        role: "PLATFORM_ADMIN",
        authVersion: "invalid",
      });

      const payload = verifyAccessToken(token);

      expect(payload.tenantId).toBeNull();
      expect(payload.authVersion).toBe(0);
    });
  });

  describe("createRefreshToken", () => {
    it.each([undefined, null, "", "   ", 123])(
      "rejects invalid session ID %s",
      (sessionId) => {
        expect(() => createRefreshToken(user, sessionId)).toThrow(
          "A valid session ID is required",
        );
      },
    );

    it("creates a refresh token containing the session ID", () => {
      const token = createRefreshToken(user, "session-789");
      const payload = verifyRefreshToken(token);

      expect(payload.sub).toBe(user._id);
      expect(payload.sid).toBe("session-789");
      expect(payload.tokenType).toBe("refresh");
      expect(payload.iss).toBe("school-erp-api");
      expect(payload.aud).toBe("school-erp-clients");
      expect(payload.jti).toBeTruthy();
    });

    it("generates a unique JWT ID for each refresh token", () => {
      const first = createRefreshToken(user, "session-789");
      const second = createRefreshToken(user, "session-789");

      expect(jwt.decode(first).jti).not.toBe(jwt.decode(second).jti);
    });
  });

  describe("token verification", () => {
   it("rejects a refresh-type payload signed with the access secret", () => {
  const token = jwt.sign(
    {
      tokenType: "refresh",
      sid: "session-789",
    },
    env.jwtAccessSecret,
    {
      algorithm: "HS256",
      issuer: "school-erp-api",
      audience: "school-erp-clients",
      subject: user._id,
    },
  );

  expect(() => verifyAccessToken(token)).toThrow("Invalid token type");
});

it("rejects an access-type payload signed with the refresh secret", () => {
  const token = jwt.sign(
    {
      tokenType: "access",
      tenantId: user.tenantId,
      role: user.role,
      authVersion: user.authVersion,
    },
    env.jwtRefreshSecret,
    {
      algorithm: "HS256",
      issuer: "school-erp-api",
      audience: "school-erp-clients",
      subject: user._id,
    },
  );

  expect(() => verifyRefreshToken(token)).toThrow("Invalid token type");
});

    it("rejects a token signed with the wrong secret", () => {
      const token = jwt.sign(
        { tokenType: "access" },
        "x".repeat(32),
        {
          algorithm: "HS256",
          issuer: "school-erp-api",
          audience: "school-erp-clients",
          subject: user._id,
        },
      );

      expect(() => verifyAccessToken(token)).toThrow();
    });

    it("rejects a token with an invalid issuer", () => {
      const token = jwt.sign(
        { tokenType: "access" },
        env.jwtAccessSecret,
        {
          algorithm: "HS256",
          issuer: "unexpected-issuer",
          audience: "school-erp-clients",
          subject: user._id,
        },
      );

      expect(() => verifyAccessToken(token)).toThrow();
    });

    it("rejects a token with an invalid audience", () => {
      const token = jwt.sign(
        { tokenType: "access" },
        env.jwtAccessSecret,
        {
          algorithm: "HS256",
          issuer: "school-erp-api",
          audience: "unexpected-audience",
          subject: user._id,
        },
      );

      expect(() => verifyAccessToken(token)).toThrow();
    });

    it("rejects a token with the wrong signing algorithm", () => {
      const token = jwt.sign(
        { tokenType: "access" },
        env.jwtAccessSecret,
        {
          algorithm: "HS384",
          issuer: "school-erp-api",
          audience: "school-erp-clients",
          subject: user._id,
        },
      );

      expect(() => verifyAccessToken(token)).toThrow();
    });


it("rejects a token with a string payload", () => {
  const token = jwt.sign(
    "not-an-object",
    env.jwtAccessSecret,
    {
      algorithm: "HS256",
    }
  );

  expect(() => verifyAccessToken(token)).toThrow();
});

  });
});
