import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getMyPublishedResults, getMyHomework } from "../controllers/studentResultPortalController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/results", authorizeRoles("student", "parent"), getMyPublishedResults);
router.get("/homework", authorizeRoles("student", "parent"), getMyHomework);
export default router;
