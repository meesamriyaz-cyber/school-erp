import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listHomework, createHomework, updateHomeworkStatus } from "../controllers/homeworkController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listHomework);
router.post("/", authorizeRoles("school_admin", "principal", "teacher"), createHomework);
router.patch("/:homeworkId/status", authorizeRoles("school_admin", "principal", "teacher"), updateHomeworkStatus);
export default router;
