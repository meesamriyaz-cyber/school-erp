import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listStudentGuardianCommunication, sendGuardianCommunication } from "../controllers/guardianCommunicationController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/students/:studentId", authorizeRoles("school_admin", "principal"), listStudentGuardianCommunication);
router.post("/students/:studentId", authorizeRoles("school_admin", "principal"), sendGuardianCommunication);
export default router;
