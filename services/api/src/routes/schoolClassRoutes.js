import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listClasses, getClass, createClass, updateClass } from "../controllers/schoolClassController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listClasses);
router.get("/:classId", authorizeRoles("school_admin", "principal", "teacher"), getClass);
router.post("/", authorizeRoles("school_admin", "principal"), createClass);
router.patch("/:classId", authorizeRoles("school_admin", "principal"), updateClass);
export default router;
