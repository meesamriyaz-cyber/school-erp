import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getMyPublishedResults, getMyHomework } from "../controllers/studentResultPortalController.js";
import { getMyHomeworkSubmissions } from "../controllers/homeworkSubmissionController.js";
import { getMyChildren } from "../controllers/studentPortalController.js";
import { getMyAttendance, getMyFees, getMyTimetable } from "../controllers/studentPortalDataController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/children", authorizeRoles("student", "parent"), getMyChildren);
router.get("/attendance", authorizeRoles("student", "parent"), getMyAttendance);
router.get("/fees", authorizeRoles("student", "parent"), getMyFees);
router.get("/timetable", authorizeRoles("student", "parent"), getMyTimetable);
router.get("/results", authorizeRoles("student", "parent"), getMyPublishedResults);
router.get("/homework", authorizeRoles("student", "parent"), getMyHomework);
router.get("/homework-submissions", authorizeRoles("student", "parent"), getMyHomeworkSubmissions);
export default router;
