import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { issueCertificate, listCertificates, voidCertificate, verifyCertificate } from "../controllers/certificateController.js";

const router = Router();
router.get("/verify/:code", verifyCertificate);
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal"), listCertificates);
router.post("/", authorizeRoles("school_admin", "principal"), issueCertificate);
router.patch("/:certificateId/void", authorizeRoles("school_admin", "principal"), voidCertificate);
export default router;
