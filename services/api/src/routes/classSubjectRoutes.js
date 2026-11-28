import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listClassSubjects, saveClassSubject, removeClassSubject } from "../controllers/classSubjectController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listClassSubjects);
router.put("/classes/:classId", authorizeRoles("school_admin", "principal"), saveClassSubject);
router.delete("/:mappingId", authorizeRoles("school_admin"), removeClassSubject);
export default router;
