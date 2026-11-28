
  import User from "../models/User.js";
  import Tenant from "../models/Tenant.js";
  import env from "../config/env.js";

  import { verifyPassword,  hashPassword } from "../utils/password.js";
  import { verifyRefreshToken } from "../utils/tokens.js";

  import {
    createSession,
    rotateRefreshToken,
    revokeSession,
    revokeAllUserSessions,
  } from "../services/sessionService.js";

  const REFRESH_COOKIE = "school_erp_refresh";
  const REFRESH_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

  const cookieOptions = {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
  };

  const clearRefreshCookie = (res) => {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
  };

  const invalidCredentials = (res) =>
    res.status(401).json({
      success: false,
      message: "Invalid credentials or inactive account",
    });

  const getClientType = (body) =>
    body?.clientType === "mobile" ? "mobile" : "web";

  const getRefreshToken = (req, clientType) =>
    clientType === "mobile"
      ? req.body?.refreshToken
      : req.cookies?.[REFRESH_COOKIE];

  const sendSession = (res, tokens, user, clientType) => {
    if (clientType === "web") {
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
        ...cookieOptions,
        maxAge: REFRESH_DURATION_MS,
      });
    }

    return res.status(200).json({
      success: true,
      accessToken: tokens.accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      ...(clientType === "mobile"
        ? { refreshToken: tokens.refreshToken }
        : {}),
      user: {
        id: String(user._id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
          ? String(user.tenantId)
          : null,
      },
    });
  };

  export const login = async (req, res, next) => {
    try {
      const {
        email,
        password,
        tenantSlug,
      } = req.body ?? {};

      const clientType = getClientType(req.body);

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      let user = null;

      if (
        typeof tenantSlug === "string" &&
        tenantSlug.trim()
      ) {
        const tenant = await Tenant.findOne({
          slug: tenantSlug.trim().toLowerCase(),
          status: "active",
        })
          .select("_id")
          .lean();

        if (tenant) {
          user = await User.findOne({
            tenantId: tenant._id,
            email: normalizedEmail,
            role: { $ne: "platform_admin" },
          }).select("+passwordHash");
        }
      } else {
        // Platform administrators use the global account namespace.
        user = await User.findOne({
          email: normalizedEmail,
          role: "platform_admin",
          tenantId: null,
        }).select("+passwordHash");
      }

      if (
        !user ||
        user.status !== "active" ||
        !(await verifyPassword(password, user.passwordHash))
      ) {
        return invalidCredentials(res);
      }

      const tokens = await createSession(user, {
        userAgent: req.get("user-agent"),
      });

      return sendSession(res, tokens, user, clientType);
    } catch (error) {
      return next(error);
    }
  };

  export const refresh = async (req, res, next) => {
    const clientType = getClientType(req.body);
    const refreshToken = getRefreshToken(req, clientType);

    if (typeof refreshToken !== "string" || !refreshToken) {
      clearRefreshCookie(res);

      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    let payload;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      clearRefreshCookie(res);

      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    try {
      const user = await User.findById(payload.sub)
        .select("tenantId role status firstName lastName email authVersion")
        .lean();

      if (!user || user.status !== "active") {
        clearRefreshCookie(res);
        return invalidCredentials(res);
      }

      if (user.role !== "platform_admin") {
        const tenant = await Tenant.findById(user.tenantId).select("_id status").lean();
        if (!tenant || tenant.status !== "active") {
          clearRefreshCookie(res);
          return res.status(403).json({ success: false, message: "School is inactive; access is not available" });
        }
      }

      let tokens;

      try {
        tokens = await rotateRefreshToken(refreshToken, user);
      } catch (error) {
        if (error.statusCode === 401) {
          clearRefreshCookie(res);

          return res.status(401).json({
            success: false,
            message: "Session expired or invalid; please sign in again",
          });
        }

        throw error;
      }

      return sendSession(res, tokens, user, clientType);
    } catch (error) {
      return next(error);
    }
  };

  
export const logout = async (req, res, next) => {
  const clientType = getClientType(req.body);
  const refreshToken = getRefreshToken(req, clientType);

  try {
    if (typeof refreshToken === "string" && refreshToken) {
      let payload;

      try {
        payload = verifyRefreshToken(refreshToken);
      } catch {
        // Logout remains idempotent if the token is already invalid.
      }

      if (
        payload &&
        typeof payload.sub === "string" &&
        typeof payload.sid === "string"
      ) {
        // Keep this outside the token-verification catch.
        // Unexpected revocation errors must reach the outer catch.
        await revokeSession(payload.sid, payload.sub);
      }
    }

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "Logged out",
    });
  } catch (error) {
    return next(error);
  }
};



  export const changePassword = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};

      if (
        typeof currentPassword !== "string" ||
        !currentPassword ||
        typeof newPassword !== "string" ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: "New password must differ from the current password",
        });
      }

      // Load the current password hash from the authenticated account.
      const user = await User.findOne({
        _id: req.auth.userId,
        tenantId: req.auth.tenantId,
        role: req.auth.role,
        status: "active",
      }).select("+passwordHash");

      if (!user || !(await verifyPassword(
        currentPassword,
        user.passwordHash
      ))) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // hashPassword enforces the configured password length limits.
      const newPasswordHash = await hashPassword(newPassword);

      // Compare-and-update prevents a concurrent password change
      // from silently overwriting a newer credential.
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          tenantId: req.auth.tenantId,
          role: req.auth.role,
          status: "active",
          passwordHash: user.passwordHash,
          authVersion: user.authVersion ?? 0,
        },
        {
          $set: { passwordHash: newPasswordHash },
          $inc: { authVersion: 1 },
        },
        { new: true, runValidators: true }
      ).select("_id");

      if (!updatedUser) {
        return res.status(409).json({
          success: false,
          message: "Account credentials changed; please sign in again",
        });
      }

      // The version increment invalidates old access tokens.
      // Revocation invalidates existing refresh sessions.
      await revokeAllUserSessions(String(user._id));

      clearRefreshCookie(res);

      return res.status(200).json({
        success: true,
        message: "Password changed. Please sign in again.",
      });
    } catch (error) {
      if (error.message?.includes("Password must")) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return next(error);
    }
  };
