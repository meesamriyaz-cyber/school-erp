import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listExaminationMarks, saveExaminationMarks, getTeacherExamRoster, listExaminationMarkAudit } from "../controllers/examMarkController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/:examinationId/teacher-roster", authorizeRoles("teacher"), getTeacherExamRoster);
router.get("/:examinationId/marks", authorizeRoles("school_admin", "principal", "teacher"), listExaminationMarks);
router.get("/:examinationId/marks/audit", authorizeRoles("school_admin", "principal"), listExaminationMarkAudit);
router.post("/:examinationId/marks", authorizeRoles("school_admin", "principal", "teacher"), saveExaminationMarks);
export default router;
