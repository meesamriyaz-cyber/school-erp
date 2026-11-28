import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listAnnouncements,
  createAnnouncement,
  getAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
} from "../controllers/announcementController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/", authorizeRoles("school_admin", "principal", "teacher"), listAnnouncements);
router.post("/", authorizeRoles("school_admin", "principal", "teacher"), createAnnouncement);
router.get("/:announcementId", authorizeRoles("school_admin", "principal", "teacher"), getAnnouncement);
router.patch("/:announcementId", authorizeRoles("school_admin", "principal", "teacher"), updateAnnouncement);
router.patch("/:announcementId/publish", authorizeRoles("school_admin", "principal", "teacher"), publishAnnouncement);
router.patch("/:announcementId/archive", authorizeRoles("school_admin", "principal", "teacher"), archiveAnnouncement);
export default router;
