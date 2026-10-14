
import User from "../models/User.js";
import { verifyAccessToken } from "../utils/tokens.js";

const authenticate = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const payload = verifyAccessToken(token);

    if (
      typeof payload.sub !== "string" ||
      !payload.sub
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
    }

   const user = await User.findById(payload.sub)
  .select("tenantId role status authVersion")
  .lean();

    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive account",
      });
    }
const currentAuthVersion = Number.isInteger(user.authVersion)
  ? user.authVersion
  : 0;

if (
  !Number.isInteger(payload.authVersion) ||
  payload.authVersion !== currentAuthVersion
) {
  return res.status(401).json({
    success: false,
    message: "Session invalidated; please sign in again",
  });
}
   
    const actualTenantId = user.tenantId
      ? String(user.tenantId)
      : null;

    // The database, not the request or token alone,
    // determines the user's current role and school.
    if (
      (user.role === "platform_admin" && actualTenantId !== null) ||
      (user.role !== "platform_admin" && actualTenantId === null) ||
      payload.role !== user.role ||
      payload.tenantId !== actualTenantId
    ) {
      return res.status(401).json({
        success: false,
        message: "Account permissions have changed; sign in again",
      });
    }

    req.auth = {
      userId: String(user._id),
      tenantId: actualTenantId,
      role: user.role,
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
};

export default authenticate;
