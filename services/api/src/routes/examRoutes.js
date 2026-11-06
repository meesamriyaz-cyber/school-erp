import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listExaminations, getExamination, createExamination,
  updateExaminationStatus, addExaminationSubject,
} from "../controllers/examController.js";
import {
  getExaminationResults, publishExaminationResults,
} from "../controllers/examResultController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listExaminations);
router.get("/:examinationId", authorizeRoles("school_admin", "principal", "teacher"), getExamination);
router.get("/:examinationId/results", authorizeRoles("school_admin", "principal"), getExaminationResults);
router.post("/", authorizeRoles("school_admin", "principal"), createExamination);
router.post("/:examinationId/publish", authorizeRoles("school_admin", "principal"), publishExaminationResults);
router.patch("/:examinationId/status", authorizeRoles("school_admin", "principal"), updateExaminationStatus);
router.post("/:examinationId/subjects", authorizeRoles("school_admin", "principal"), addExaminationSubject);
export default router;
