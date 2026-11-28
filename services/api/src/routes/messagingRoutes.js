import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  listMessagingContacts, listConversations, createConversation,
  listConversationMessages, sendConversationMessage, markConversationRead,
  closeConversation, listMessagingOversight,
} from "../controllers/messagingController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.get("/contacts", authorizeRoles("parent", "teacher"), listMessagingContacts);
router.get("/conversations", authorizeRoles("parent", "teacher"), listConversations);
router.post("/conversations", authorizeRoles("parent"), createConversation);
router.get("/conversations/:conversationId/messages", authorizeRoles("parent", "teacher"), listConversationMessages);
router.post("/conversations/:conversationId/messages", authorizeRoles("parent", "teacher"), sendConversationMessage);
router.patch("/conversations/:conversationId/read", authorizeRoles("parent", "teacher"), markConversationRead);
router.patch("/conversations/:conversationId/close", authorizeRoles("parent", "teacher"), closeConversation);
router.get("/oversight", authorizeRoles("school_admin", "principal"), listMessagingOversight);
export default router;
