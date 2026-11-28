import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listSections, getSection, createSection, updateSection } from "../controllers/sectionController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listSections);
router.get("/:sectionId", authorizeRoles("school_admin", "principal", "teacher"), getSection);
router.post("/", authorizeRoles("school_admin", "principal"), createSection);
router.patch("/:sectionId", authorizeRoles("school_admin", "principal"), updateSection);
export default router;
