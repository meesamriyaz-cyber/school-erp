
import { Router } from "express";

import authenticate from "../middleware/authenticate.js";
import requireActiveTenant from "../middleware/requireActiveTenant.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { linkStudentAccount } from "../controllers/studentResultPortalController.js";
import { createStudentDocumentSignature, listStudentDocuments, createStudentDocument, deleteStudentDocument } from "../controllers/studentDocumentController.js";

import {
  listStudents,
  createStudent,
  getStudent,
  updateStudent,
  bulkUpsertMotherDetails,
} from "../controllers/studentController.js";

const router = Router();

// Every student endpoint requires an authenticated user
// and a currently active school.
router.use(authenticate, requireActiveTenant);

// List students.
router.get(
  "/",
  authorizeRoles("school_admin", "principal", "teacher"),
  listStudents
);

// Bulk update existing mother contact records by student admission number.
router.post(
  "/bulk-mother-contacts",
  authorizeRoles("school_admin", "principal"),
  bulkUpsertMotherDetails
);

// Create a student.
router.post(
  "/",
  authorizeRoles("school_admin", "principal"),
  createStudent
);

router.post("/:studentId/documents/signature", authorizeRoles("school_admin", "principal"), createStudentDocumentSignature);
router.get("/:studentId/documents", authorizeRoles("school_admin", "principal"), listStudentDocuments);
router.post("/:studentId/documents", authorizeRoles("school_admin", "principal"), createStudentDocument);
router.delete("/:studentId/documents/:documentId", authorizeRoles("school_admin", "principal"), deleteStudentDocument);

// Retrieve one student.
router.get(
  "/:studentId",
  authorizeRoles("school_admin", "principal", "teacher"),
  getStudent
);

// Explicitly link a student record to a student login account.
router.post("/:studentId/account", authorizeRoles("school_admin", "principal"), linkStudentAccount);


// Update student details.
router.patch(
  "/:studentId",
  authorizeRoles("school_admin", "principal"),
  updateStudent
);

export default router;
