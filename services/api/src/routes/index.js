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
router.use("/students", studentRoutes);
router.use("/academic-years", academicYearRoutes);
router.use("/classes", schoolClassRoutes);
router.use("/sections", sectionRoutes);
router.use("/enrollments", enrollmentRoutes);
export default router;
