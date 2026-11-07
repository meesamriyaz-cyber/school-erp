import mongoose from "mongoose";
import Enrollment from "../models/Enrollment.js";
import Student from "../models/Student.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const fail = (code, message) => Object.assign(new Error(message), { code });

export const getPromotionPreview = async (req, res, next) => {
  try {
    const { sourceAcademicYearId, targetAcademicYearId } = req.query;
    if (!validId(sourceAcademicYearId) || !validId(targetAcademicYearId) || sourceAcademicYearId === targetAcademicYearId) {
      return invalid(res, "Select two different valid academic years");
    }
    const [sourceYear, targetYear] = await Promise.all([
      AcademicYear.findOne({ _id: sourceAcademicYearId, tenantId: req.tenantId }).select("name startDate endDate status").lean(),
      AcademicYear.findOne({ _id: targetAcademicYearId, tenantId: req.tenantId }).select("name startDate endDate status").lean(),
    ]);
    if (!sourceYear || !targetYear) return res.status(404).json({ success: false, message: "Academic year not found in this school" });
    if (sourceYear.status !== "active" || targetYear.status !== "draft") {
      return res.status(409).json({ success: false, message: "Rollover requires an active source year and a draft target year" });
    }
    if (new Date(targetYear.startDate) <= new Date(sourceYear.endDate)) {
      return invalid(res, "The target academic year must start after the source academic year ends");
    }
    const [enrollments, classes] = await Promise.all([
      Enrollment.find({ tenantId: req.tenantId, academicYearId: sourceYear._id, status: "active" })
        .populate("studentId", "admissionNumber firstName lastName status")
        .populate("classId", "name sortOrder")
        .populate("sectionId", "name")
        .sort({ "studentId.firstName": 1, "studentId.lastName": 1, _id: 1 }).lean(),
      SchoolClass.find({ tenantId: req.tenantId, academicYearId: targetYear._id, status: "active" })
        .select("name sortOrder").sort({ sortOrder: 1, name: 1 }).lean(),
    ]);
    return res.status(200).json({
      success: true,
      data: { sourceYear, targetYear, enrollments, targetClasses: classes, eligibleCount: enrollments.length },
    });
  } catch (error) { return next(error); }
};

export const executeAcademicYearRollover = async (req, res, next) => {
  const body = req.body || {};
  const allowed = ["sourceAcademicYearId", "targetAcademicYearId", "placements"];
  if (Object.keys(body).some((key) => !allowed.includes(key)) ||
      !validId(body.sourceAcademicYearId) || !validId(body.targetAcademicYearId) ||
      body.sourceAcademicYearId === body.targetAcademicYearId || !Array.isArray(body.placements) ||
      body.placements.length === 0 || body.placements.length > 2000) {
    return invalid(res, "Provide valid source and target academic years and between 1 and 2,000 student decisions");
  }
  const seen = new Set();
  for (const item of body.placements) {
    if (!item || Object.keys(item).some((key) => !["enrollmentId", "outcome", "classId", "sectionId"].includes(key)) ||
        !validId(item.enrollmentId) || seen.has(String(item.enrollmentId)) ||
        !["promote", "retain", "transfer", "withdraw"].includes(item.outcome)) {
      return invalid(res, "Each student must have one valid promotion, retention, transfer or withdrawal decision");
    }
    seen.add(String(item.enrollmentId));
    if (["promote", "retain"].includes(item.outcome) && !validId(item.classId)) {
      return invalid(res, "Select a target class for every promoted or retained student");
    }
    if (item.sectionId !== undefined && item.sectionId !== null && !validId(item.sectionId)) {
      return invalid(res, "A target section ID is invalid");
    }
    if (["transfer", "withdraw"].includes(item.outcome) && (item.classId || item.sectionId)) {
      return invalid(res, "Transferred or withdrawn students cannot have a target class or section");
    }
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const source = await AcademicYear.findOneAndUpdate(
        { _id: body.sourceAcademicYearId, tenantId: req.tenantId, status: "active" },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session },
      );
      const target = await AcademicYear.findOneAndUpdate(
        { _id: body.targetAcademicYearId, tenantId: req.tenantId, status: "draft" },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session },
      );
      if (!source || !target) throw fail("YEAR_STATE", "Rollover requires an active source year and a draft target year");
      if (new Date(target.startDate) <= new Date(source.endDate)) throw fail("YEAR_DATES", "The target academic year must start after the source academic year ends");

      const active = await Enrollment.find({
        tenantId: req.tenantId, academicYearId: source._id, status: "active",
      }).session(session).lean();
      if (active.length !== body.placements.length || active.some((item) => !seen.has(String(item._id)))) {
        throw fail("PLACEMENT_SET", "The preview is out of date. Refresh it and provide a decision for every active student exactly once");
      }

      const classIds = [...new Set(body.placements.filter((item) => ["promote", "retain"].includes(item.outcome)).map((item) => item.classId))];
      const classes = await SchoolClass.find({
        _id: { $in: classIds }, tenantId: req.tenantId, academicYearId: target._id, status: "active",
      }).session(session).lean();
      if (classes.length !== classIds.length) throw fail("TARGET_CLASS", "One or more target classes are inactive or do not belong to the target academic year");

      const sectionIds = [...new Set(body.placements.filter((item) => item.sectionId).map((item) => item.sectionId))];
      const sections = sectionIds.length ? await Section.find({
        _id: { $in: sectionIds }, tenantId: req.tenantId, status: "active",
      }).session(session).lean() : [];
      if (sections.length !== sectionIds.length) throw fail("TARGET_SECTION", "One or more target sections are inactive or unavailable");
      const classById = new Map(classes.map((item) => [String(item._id), item]));
      const sectionById = new Map(sections.map((item) => [String(item._id), item]));
      const plannedBySection = new Map();
      for (const item of body.placements) {
        if (!["promote", "retain"].includes(item.outcome)) continue;
        if (item.sectionId) {
          const section = sectionById.get(String(item.sectionId));
          if (String(section.classId) !== String(item.classId)) throw fail("TARGET_SECTION", "A selected section does not belong to its target class");
          plannedBySection.set(String(section._id), (plannedBySection.get(String(section._id)) || 0) + 1);
        }
      }

      for (const [sectionId, plannedCount] of plannedBySection) {
        const lockedSection = await Section.findOneAndUpdate(
          { _id: sectionId, tenantId: req.tenantId, status: "active" },
          { $inc: { capacityRevision: 1 } }, { new: true, session },
        ).select("_id capacity").lean();
        if (!lockedSection) throw fail("TARGET_SECTION", "A target section is no longer active");
        const existingCount = await Enrollment.countDocuments({
          tenantId: req.tenantId, sectionId, status: "active",
        }).session(session);
        if (lockedSection.capacity !== null && existingCount + plannedCount > lockedSection.capacity) {
          throw fail("SECTION_CAPACITY", "A target section does not have enough capacity for this rollover");
        }
      }

      const now = new Date();
      const sourceIds = active.map((item) => item._id);
      const outcomeById = new Map(body.placements.map((item) => [String(item.enrollmentId), item]));
      for (const enrollment of active) {
        const decision = outcomeById.get(String(enrollment._id));
        const terminalStatus = decision.outcome === "promote" || decision.outcome === "retain"
          ? "completed" : decision.outcome === "transfer" ? "transferred" : "withdrawn";
        await Enrollment.updateOne(
          { _id: enrollment._id, tenantId: req.tenantId, status: "active" },
          { $set: { status: terminalStatus, endedAt: now } }, { session },
        );
        if (decision.outcome === "promote" || decision.outcome === "retain") {
          await Enrollment.create([{
            tenantId: req.tenantId, studentId: enrollment.studentId,
            academicYearId: target._id, classId: decision.classId,
            sectionId: decision.sectionId || null, enrollmentDate: target.startDate,
            status: "active",
            notes: decision.outcome === "retain" ? "Retained from previous academic year" : "Promoted from previous academic year",
          }], { session });
        } else if (decision.outcome === "withdraw") {
          await Student.updateOne(
            { _id: enrollment.studentId, tenantId: req.tenantId },
            { $set: { status: "withdrawn" } }, { session },
          );
        } else if (decision.outcome === "transfer") {
          await Student.updateOne(
            { _id: enrollment.studentId, tenantId: req.tenantId },
            { $set: { status: "inactive" } }, { session },
          );
        }
      }

      source.status = "closed";
      target.status = "active";
      await source.save({ session });
      await target.save({ session });
      result = {
        sourceAcademicYear: { _id: source._id, name: source.name, status: source.status },
        targetAcademicYear: { _id: target._id, name: target.name, status: target.status },
        processed: active.length,
        promoted: body.placements.filter((item) => item.outcome === "promote").length,
        retained: body.placements.filter((item) => item.outcome === "retain").length,
        transferred: body.placements.filter((item) => item.outcome === "transfer").length,
        withdrawn: body.placements.filter((item) => item.outcome === "withdraw").length,
      };
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (["YEAR_STATE", "YEAR_DATES", "PLACEMENT_SET", "TARGET_CLASS", "TARGET_SECTION", "SECTION_CAPACITY"].includes(error.code)) {
      return res.status(error.code === "YEAR_STATE" ? 409 : error.code === "SECTION_CAPACITY" ? 409 : 400)
        .json({ success: false, message: error.message });
    }
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A student already has an active enrollment or a target placement conflicts with existing data" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more rollover details are invalid");
    return next(error);
  } finally {
    await session.endSession();
  }
};
