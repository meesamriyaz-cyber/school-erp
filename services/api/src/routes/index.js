import { Router } from "express";

import { getDatabaseStatus } from "../config/database.js";
import authRoutes from "./authRoutes.js";
import platformRoutes from "./platformRoutes.js";
import schoolRoutes from "./schoolRoutes.js";
import studentRoutes from "./studentRoutes.js";
import academicYearRoutes from "./academicYearRoutes.js";
import schoolClassRoutes from "./schoolClassRoutes.js";
import sectionRoutes from "./sectionRoutes.js";
import enrollmentRoutes from "./enrollmentRoutes.js";
import attendanceRoutes from "./attendanceRoutes.js";
import subjectRoutes from "./subjectRoutes.js";
import teacherAssignmentRoutes from "./teacherAssignmentRoutes.js";
import timetableRoutes from "./timetableRoutes.js";
import examRoutes from "./examRoutes.js";
import examMarkRoutes from "./examMarkRoutes.js";
import guardianRoutes from "./guardianRoutes.js";
import studentGuardianRoutes from "./studentGuardianRoutes.js";
import portalRoutes from "./portalRoutes.js";import portalRoutes from "./portalRoutes.js";
const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "School ERP API is running", timestamp: new Date().toISOString() });
});

router.get("/health/ready", (req, res) => {
  const database = getDatabaseStatus();
  const ready = database === "connected";
  res.status(ready ? 200 : 503).json({ success: ready, status: ready ? "ready" : "not_ready", database, timestamp: new Date().toISOString() });
});

router.use("/auth", authRoutes);
router.use("/platform", platformRoutes);
router.use("/school", schoolRoutes);
router.use("/students/:studentId/guardians", studentGuardianRoutes);
router.use("/guardians", guardianRoutes);
router.use("/students", studentRoutes);
router.use("/academic-years", academicYearRoutes);
router.use("/classes", schoolClassRoutes);
router.use("/sections", sectionRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/subjects", subjectRoutes);
router.use("/teacher-assignments", teacherAssignmentRoutes);
router.use("/timetable", timetableRoutes);
router.use("/examinations", examRoutes);
router.use("/examinations", examMarkRoutes);\nrouter.use("/portal", portalRoutes);
export default router;
