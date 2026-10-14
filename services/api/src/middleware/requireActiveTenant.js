
import mongoose from "mongoose";

import Tenant from "../models/Tenant.js";

const requireActiveTenant = async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Platform administrators do not belong to a school.
    // Use platform-specific routes for platform-level operations.
    if (
      req.auth.role === "platform_admin" ||
      !req.auth.tenantId ||
      !mongoose.isValidObjectId(req.auth.tenantId)
    ) {
      return res.status(403).json({
        success: false,
        message: "An active school context is required",
      });
    }

    // Resolve the tenant from the authenticated user's identity,
    // never from a tenant ID supplied by the client.
    const tenant = await Tenant.findOne({
      _id: req.auth.tenantId,
      status: "active",
    })
      .select("_id name slug status timezone")
      .lean();

    if (!tenant) {
      return res.status(403).json({
        success: false,
        message: "School access is unavailable",
      });
    }

    // Downstream controllers can use these server-verified values.
    req.tenant = tenant;
    req.tenantId = String(tenant._id);

    return next();
  } catch (error) {
    return next(error);
  }
};

export default requireActiveTenant;
