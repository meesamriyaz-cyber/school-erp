
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { createSchool, getSchoolDetails, listSchools, updateSchoolStatus } from "../controllers/platformController.js";
import { createUser, getUserDetails, listUsers, updateUser, updateUserRole, updateUserStatus } from "../controllers/userManagementController.js";
import { listAuditLogs } from "../controllers/auditLogController.js";
import { getAuditOutboxStatus, retryFailedAuditEvent } from "../controllers/auditOutboxController.js";

const router = Router();

router.get("/audit-logs", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), listAuditLogs);
router.get("/audit-outbox", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), getAuditOutboxStatus);
router.post("/audit-outbox/:outboxId/retry", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), retryFailedAuditEvent);

router.get("/users", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), listUsers);
router.post("/users", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), createUser);
router.get("/users/:userId", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), getUserDetails);
router.patch("/users/:userId", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), updateUser);
router.patch("/users/:userId/status", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), updateUserStatus);
router.patch("/users/:userId/role", requireTrustedOrigin, authenticate, authorizeRoles("platform_admin"), updateUserRole);

router.get(
  "/schools",
  requireTrustedOrigin,
  authenticate,
  authorizeRoles("platform_admin"),
  listSchools
);

router.get(
  "/schools/:schoolId",
  requireTrustedOrigin,
  authenticate,
  authorizeRoles("platform_admin"),
  getSchoolDetails
);

router.patch(
  "/schools/:schoolId/status",
  requireTrustedOrigin,
  authenticate,
  authorizeRoles("platform_admin"),
  updateSchoolStatus
);

router.post(
  "/schools",
  requireTrustedOrigin,
  authenticate,
  authorizeRoles("platform_admin"),
  createSchool
);

export default router;
