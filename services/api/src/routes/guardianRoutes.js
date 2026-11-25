import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { linkGuardianAccount } from "../controllers/studentResultPortalController.js";
import { sendGuardianPhoneCode, verifyGuardianPhoneCode } from "../controllers/guardianPhoneVerificationController.js";
import {
  listGuardians,
  createGuardian,
  getGuardian,
  updateGuardian,
} from "../controllers/guardianController.js";

const router = Router();
const phoneCodeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many verification attempts. Try again later." } });

router.use(authenticate, requireActiveTenant);

router.get("/", authorizeRoles("school_admin", "principal"), listGuardians);
router.post("/", authorizeRoles("school_admin", "principal"), createGuardian);
router.get("/:guardianId", authorizeRoles("school_admin", "principal"), getGuardian);
router.patch("/:guardianId", authorizeRoles("school_admin", "principal"), updateGuardian);
router.post("/:guardianId/account", authorizeRoles("school_admin", "principal"), linkGuardianAccount);
router.post("/:guardianId/phone-verification/send", authorizeRoles("school_admin", "principal"), phoneCodeLimiter, sendGuardianPhoneCode);
router.post("/:guardianId/phone-verification/verify", authorizeRoles("school_admin", "principal"), phoneCodeLimiter, verifyGuardianPhoneCode);

export default router;
