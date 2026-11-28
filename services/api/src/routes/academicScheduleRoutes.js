import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getAcademicSchedule, saveAcademicSchedule } from "../controllers/academicScheduleController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), getAcademicSchedule);
router.put("/", authorizeRoles("school_admin", "principal"), saveAcademicSchedule);
export default router;
