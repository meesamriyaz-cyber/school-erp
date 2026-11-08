import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listAcademicTerms, createAcademicTerm, updateAcademicTerm } from "../controllers/academicTermController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listAcademicTerms);
router.post("/", authorizeRoles("school_admin"), createAcademicTerm);
router.patch("/:termId", authorizeRoles("school_admin"), updateAcademicTerm);
export default router;
