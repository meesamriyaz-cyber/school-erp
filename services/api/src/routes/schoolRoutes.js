
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";

const router = Router();

router.get(
  "/context",
  authenticate,
  requireActiveTenant,
  (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        tenantId: req.tenantId,
        school: {
          name: req.tenant.name,
          slug: req.tenant.slug,
          timezone: req.tenant.timezone,
        },
      },
    });
  }
);

export default router;
