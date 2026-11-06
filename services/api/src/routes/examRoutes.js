import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listExaminations, getExamination, createExamination,
  updateExaminationStatus, addExaminationSubject,
} from "../controllers/examController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listExaminations);
router.get("/:examinationId", authorizeRoles("school_admin", "principal", "teacher"), getExamination);
router.post("/", authorizeRoles("school_admin", "principal"), createExamination);
router.patch("/:examinationId/status", authorizeRoles("school_admin", "principal"), updateExaminationStatus);
router.post("/:examinationId/subjects", authorizeRoles("school_admin", "principal"), addExaminationSubject);
export default router;
