import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listStudentGuardians,
  createStudentGuardian,
  updateStudentGuardian,
} from "../controllers/studentGuardianController.js";

const router = Router({ mergeParams: true });

router.use(authenticate, requireActiveTenant);

router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listStudentGuardians);
router.post("/", authorizeRoles("school_admin", "principal"), createStudentGuardian);
router.patch(
  "/:studentGuardianId",
  authorizeRoles("school_admin", "principal"),
  updateStudentGuardian,
);

export default router;
