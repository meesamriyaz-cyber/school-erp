import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getStudentAcademicHistory, getEnrollmentStrengthReport, getFeeCollectionReport, getDashboardOverview } from "../controllers/schoolReportsController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/dashboard", authorizeRoles("school_admin", "principal"), getDashboardOverview);
router.get("/student-history", authorizeRoles("school_admin", "principal", "teacher"), getStudentAcademicHistory);
router.get("/enrollment-strength", authorizeRoles("school_admin", "principal", "teacher"), getEnrollmentStrengthReport);
router.get("/fees", authorizeRoles("school_admin", "principal"), getFeeCollectionReport);
export default router;
