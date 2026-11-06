import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listTimetableEntries, createTimetableEntry, updateTimetableEntry } from "../controllers/timetableController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listTimetableEntries);
router.post("/", authorizeRoles("school_admin", "principal"), createTimetableEntry);
router.patch("/:entryId", authorizeRoles("school_admin", "principal"), updateTimetableEntry);
export default router;
