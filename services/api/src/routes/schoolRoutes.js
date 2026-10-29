
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { createUser, getUserDetails, listUsers, updateUser, updateUserStatus } from "../controllers/userManagementController.js";
import { listAuditLogs } from "../controllers/auditLogController.js";

const router = Router();

router.get("/audit-logs", requireTrustedOrigin, authenticate, requireActiveTenant, authorizeRoles("school_admin"), listAuditLogs);

router.get("/users", requireTrustedOrigin, authenticate, requireActiveTenant, authorizeRoles("school_admin"), listUsers);
router.post("/users", requireTrustedOrigin, authenticate, requireActiveTenant, authorizeRoles("school_admin"), createUser);
router.get("/users/:userId", requireTrustedOrigin, authenticate, requireActiveTenant, authorizeRoles("school_admin"), getUserDetails);
router.patch("/users/:userId", requireTrustedOrigin, authenticate, requireActiveTenant, authorizeRoles("school_admin"), updateUser);
router.patch("/users/:userId/status", requireTrustedOrigin, authenticate, requireActiveTenant, authorizeRoles("school_admin"), updateUserStatus);

router.get(
  "/context",
  authenticate,
  requireActiveTenant,
  (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        tenantId: req.tenantId,
        school: {
          name: req.tenant.name,
          slug: req.tenant.slug,
          timezone: req.tenant.timezone,
        },
      },
    });
  }
);

export default router;
