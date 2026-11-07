import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { listFeeStructures, createFeeStructure, updateFeeStructureStatus, listFeeInvoices, createFeeInvoice, listInvoicePayments, recordFeePayment } from "../controllers/feeController.js";

const router = Router();
router.use(authenticate, requireActiveTenant);
router.use(authorizeRoles("school_admin", "principal"));
router.get("/structures", listFeeStructures);
router.post("/structures", createFeeStructure);
router.patch("/structures/:structureId/status", updateFeeStructureStatus);
router.get("/invoices", listFeeInvoices);
router.post("/invoices", createFeeInvoice);
router.get("/invoices/:invoiceId/payments", listInvoicePayments);
router.post("/invoices/:invoiceId/payments", recordFeePayment);
export default router;
