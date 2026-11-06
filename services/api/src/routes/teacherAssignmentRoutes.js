import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listTeacherAssignments, createTeacherAssignment, updateTeacherAssignment } from "../controllers/teacherAssignmentController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listTeacherAssignments);
router.post("/", authorizeRoles("school_admin", "principal"), createTeacherAssignment);
router.patch("/:assignmentId", authorizeRoles("school_admin", "principal"), updateTeacherAssignment);
export default router;
