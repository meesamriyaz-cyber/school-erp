import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listStudentGuardians,
  createStudentGuardian,
} from "../controllers/studentGuardianController.js";

const router = Router({ mergeParams: true });

router.use(authenticate, requireActiveTenant);

router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listStudentGuardians);
router.post("/", authorizeRoles("school_admin", "principal"), createStudentGuardian);

export default router;
