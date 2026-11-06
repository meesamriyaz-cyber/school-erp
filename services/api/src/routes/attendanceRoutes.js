import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getAttendanceRoster, saveAttendance } from "../controllers/attendanceController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), getAttendanceRoster);
router.put("/", authorizeRoles("school_admin", "principal", "teacher"), saveAttendance);
export default router;
