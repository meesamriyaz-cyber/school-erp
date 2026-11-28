import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listGradingScales,
  getActiveGradingScale,
  createGradingScale,
  updateGradingScale,
  updateGradingScaleStatus,
} from "../controllers/gradingScaleController.js";

const router = Router();

router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listGradingScales);
router.get("/active", authorizeRoles("school_admin", "principal", "teacher"), getActiveGradingScale);
router.post("/", authorizeRoles("school_admin", "principal"), createGradingScale);
router.patch("/:gradingScaleId", authorizeRoles("school_admin", "principal"), updateGradingScale);
router.patch("/:gradingScaleId/status", authorizeRoles("school_admin", "principal"), updateGradingScaleStatus);

export default router;
