
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

import {
  listStudents,
  createStudent,
  getStudent,
  updateStudent,
} from "../controllers/studentController.js";

const router = Router();

// Every student endpoint requires an authenticated user
// and a currently active school.
router.use(authenticate, requireActiveTenant);

// List students.
router.get(
  "/",
  authorizeRoles("school_admin", "principal", "teacher"),
  listStudents
);

// Create a student.
router.post(
  "/",
  authorizeRoles("school_admin", "principal"),
  createStudent
);

// Retrieve one student.
router.get(
  "/:studentId",
  authorizeRoles("school_admin", "principal", "teacher"),
  getStudent
);

// Update student details.
router.patch(
  "/:studentId",
  authorizeRoles("school_admin", "principal"),
  updateStudent
);

export default router;
