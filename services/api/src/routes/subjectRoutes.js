import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listSubjects, getSubject, createSubject, updateSubject } from "../controllers/subjectController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listSubjects);
router.get("/:subjectId", authorizeRoles("school_admin", "principal", "teacher"), getSubject);
router.post("/", authorizeRoles("school_admin", "principal"), createSubject);
router.patch("/:subjectId", authorizeRoles("school_admin", "principal"), updateSubject);
export default router;
