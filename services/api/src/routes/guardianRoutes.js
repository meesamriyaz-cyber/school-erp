import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { linkGuardianAccount } from "../controllers/studentResultPortalController.js";
import {
  listGuardians,
  createGuardian,
  getGuardian,
  updateGuardian,
} from "../controllers/guardianController.js";

const router = Router();

router.use(authenticate, requireActiveTenant);

router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listGuardians);
router.post("/", authorizeRoles("school_admin", "principal"), createGuardian);
router.get("/:guardianId", authorizeRoles("school_admin", "principal", "teacher"), getGuardian);
router.patch("/:guardianId", authorizeRoles("school_admin", "principal"), updateGuardian);
router.post("/:guardianId/account", authorizeRoles("school_admin", "principal"), linkGuardianAccount);

export default router;
