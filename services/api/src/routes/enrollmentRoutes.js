import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listEnrollments, getEnrollment, createEnrollment, endEnrollment } from "../controllers/enrollmentController.js";
import { getPromotionPreview, executeAcademicYearRollover } from "../controllers/enrollmentRolloverController.js";
import { transferEnrollment, listEnrollmentTransferHistory } from "../controllers/enrollmentTransferController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/promotion-preview", authorizeRoles("school_admin", "principal"), getPromotionPreview);
router.post("/rollover", authorizeRoles("school_admin"), executeAcademicYearRollover);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listEnrollments);
router.get("/:enrollmentId", authorizeRoles("school_admin", "principal", "teacher"), getEnrollment);
router.get("/:enrollmentId/transfers", authorizeRoles("school_admin", "principal"), listEnrollmentTransferHistory);
router.patch("/:enrollmentId/transfer", authorizeRoles("school_admin", "principal"), transferEnrollment);
router.post("/", authorizeRoles("school_admin", "principal"), createEnrollment);
router.patch("/:enrollmentId", authorizeRoles("school_admin", "principal"), endEnrollment);
export default router;
