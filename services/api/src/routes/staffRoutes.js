import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { createStaff, getStaff, listStaff, listStaffHistory, updateStaff, updateStaffStatus } from "../controllers/staffController.js";

const router = Router();
router.use(authenticate, requireActiveTenant, authorizeRoles("school_admin", "principal"));
router.get("/", listStaff);
router.post("/", createStaff);
router.get("/:staffId/history", listStaffHistory);
router.get("/:staffId", getStaff);
router.patch("/:staffId", updateStaff);
router.patch("/:staffId/status", updateStaffStatus);
export default router;
