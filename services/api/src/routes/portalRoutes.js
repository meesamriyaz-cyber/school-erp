import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getMyPublishedResults } from "../controllers/studentResultPortalController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/results", authorizeRoles("student", "parent"), getMyPublishedResults);
export default router;
