
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { createSchool, getSchoolDetails, listSchools, updateSchoolStatus } from "../controllers/platformController.js";
import { createUser, getUserDetails, listUsers, updateUser, updateUserRole, updateUserStatus } from "../controllers/userManagementController.js";
import { listAuditLogs } from "../controllers/auditLogController.js";
import { getAuditOutboxStatus, retryFailedAuditEvent } from "../controllers/auditOutboxController.js";
import {
  getBusinessOverview, listSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan,
  archiveSubscriptionPlan, getSchoolSubscription, assignSchoolSubscription, listPlatformInvoices,
  recordPlatformPayment,
} from "../controllers/platformBillingController.js";

const router = Router();
const platformOnly = [requireTrustedOrigin, authenticate, authorizeRoles("platform_admin")];

router.get("/business-overview", ...platformOnly, getBusinessOverview);
router.get("/subscription-plans", ...platformOnly, listSubscriptionPlans);
router.post("/subscription-plans", ...platformOnly, createSubscriptionPlan);
router.patch("/subscription-plans/:planId", ...platformOnly, updateSubscriptionPlan);
router.post("/subscription-plans/:planId/archive", ...platformOnly, archiveSubscriptionPlan);
router.get("/schools/:schoolId/subscription", ...platformOnly, getSchoolSubscription);
router.post("/schools/:schoolId/subscription", ...platformOnly, assignSchoolSubscription);
router.get("/invoices", ...platformOnly, listPlatformInvoices);
router.post("/invoices/:invoiceId/payments", ...platformOnly, recordPlatformPayment);

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
