import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getMyPublishedResults, getMyHomework } from "../controllers/studentResultPortalController.js";
import { getMyHomeworkSubmissions } from "../controllers/homeworkSubmissionController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/results", authorizeRoles("student", "parent"), getMyPublishedResults);
router.get("/homework", authorizeRoles("student", "parent"), getMyHomework);
router.get("/homework-submissions", authorizeRoles("student", "parent"), getMyHomeworkSubmissions);
export default router;
