
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

import {
  listAcademicYears,
  getAcademicYear,
  createAcademicYear,
  updateAcademicYear,
} from "../controllers/academicYearController.js";

const router = Router();

// All endpoints require an authenticated user and an active school.
router.use(authenticate, requireActiveTenant);

// Reading is available to authorized school staff.
router.get(
  "/",
  authorizeRoles("school_admin", "principal", "teacher"),
  listAcademicYears
);

router.get(
  "/:academicYearId",
  authorizeRoles("school_admin", "principal", "teacher"),
  getAcademicYear
);

// Only school administrators can manage academic years.
router.post(
  "/",
  authorizeRoles("school_admin"),
  createAcademicYear
);

router.patch(
  "/:academicYearId",
  authorizeRoles("school_admin"),
  updateAcademicYear
);

export default router;
