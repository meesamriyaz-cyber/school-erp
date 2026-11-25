import { Router } from "express";
import { receiveTwilioStatus } from "../controllers/twilioWebhookController.js";

const router = Router();
router.post("/status", receiveTwilioStatus);
export default router;
