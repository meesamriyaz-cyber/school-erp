
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { createSchool, listSchools } from "../controllers/platformController.js";

const router = Router();

router.post(
  "/schools",
  requireTrustedOrigin,
  authenticate,
  authorizeRoles("platform_admin"),
  createSchool
);

export default router;
