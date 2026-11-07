import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listHomeworkSubmissions, submitHomework, reviewHomeworkSubmission } from "../controllers/homeworkSubmissionController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/:homeworkId/submissions", authorizeRoles("school_admin", "principal", "teacher"), listHomeworkSubmissions);
router.post("/:homeworkId/submissions", authorizeRoles("student"), submitHomework);
router.patch("/:homeworkId/submissions/:submissionId/review", authorizeRoles("school_admin", "principal", "teacher"), reviewHomeworkSubmission);
export default router;
