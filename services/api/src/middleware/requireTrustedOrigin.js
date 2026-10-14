
import env from "../config/env.js";

const trustedOrigins = new Set([env.webUrl]);

if (env.nodeEnv !== "production") {
  trustedOrigins.add("http://localhost:5173");
}

const requireTrustedOrigin = (req, res, next) => {
  const origin = req.get("origin");
  const hasRefreshCookie = Boolean(
    req.cookies?.school_erp_refresh
  );

  // Any supplied Origin must be explicitly trusted,
  // regardless of the clientType in the request body.
  if (origin && !trustedOrigins.has(origin)) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not permitted",
    });
  }

  // Cookie-based authentication must never bypass
  // origin validation because clientType says "mobile".
  if (!origin && hasRefreshCookie) {
    return res.status(403).json({
      success: false,
      message: "Request origin is required",
    });
  }

  // Allow originless native-client requests only when
  // they explicitly use the mobile authentication flow.
  if (!origin && req.body?.clientType !== "mobile") {
    return res.status(403).json({
      success: false,
      message: "Request origin is required",
    });
  }

  return next();
};

export default requireTrustedOrigin;
