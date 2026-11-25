import { Router } from "express";
import { receiveMsg91Status } from "../controllers/msg91WebhookController.js";

const router = Router();
router.post("/status", receiveMsg91Status);
export default router;
