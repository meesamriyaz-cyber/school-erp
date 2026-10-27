import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listEnrollments, getEnrollment, createEnrollment, endEnrollment } from "../controllers/enrollmentController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listEnrollments);
router.get("/:enrollmentId", authorizeRoles("school_admin", "principal", "teacher"), getEnrollment);
router.post("/", authorizeRoles("school_admin", "principal"), createEnrollment);
router.patch("/:enrollmentId", authorizeRoles("school_admin", "principal"), endEnrollment);
export default router;
