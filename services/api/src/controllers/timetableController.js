import mongoose from "mongoose";
import TimetableEntry from "../models/TimetableEntry.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import AcademicSchedule from "../models/AcademicSchedule.js";

const validId = (value) => mongoose.isValidObjectId(value);
const invalid = (res, message) => res.status(400).json({ success: false, message });
const timeToMinutes = (value) => {
  if (typeof value !== "string" || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const validateConfiguredPeriod = async ({ tenantId, academicYearId, periodNumber, startTime, endTime }) => {
  const schedule = await AcademicSchedule.findOne({ tenantId, academicYearId }).select("periods breaks").lean();
  if (!schedule || !schedule.periods?.length) return null;
  const period = schedule.periods.find((item) => item.periodNumber === periodNumber);
  if (!period) return "Select a period configured in this academic year's bell schedule";
  if (period.startTime !== startTime || period.endTime !== endTime) return `Period ${periodNumber} must use the configured time ${period.startTime}–${period.endTime}`;
  const start = timeToMinutes(startTime), end = timeToMinutes(endTime);
  const overlapsBreak = (schedule.breaks || []).some((item) => start < timeToMinutes(item.endTime) && end > timeToMinutes(item.startTime));
  if (overlapsBreak) return "A lesson cannot be scheduled during a configured break";
  return null;
};

const populateEntry = (query) => query
  .populate({ path: "assignmentId", populate: [
    { path: "teacherId", select: "firstName lastName email" },
    { path: "subjectId", select: "name code" },
  ] })
  .populate("academicYearId", "name")
  .populate("classId", "name")
  .populate("sectionId", "name");

export const listTimetableEntries = async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.auth.role === "teacher") {
      const ownAssignments = await TeacherAssignment.find({
        tenantId: req.tenantId,
        teacherId: req.auth.userId,
        status: "active",
      }).distinct("_id");
      if (!ownAssignments.length) {
        return res.status(200).json({ success: true, data: [] });
      }
      filter.assignmentId = { $in: ownAssignments };
    }
    for (const field of ["academicYearId", "classId", "assignmentId"]) {
      if (req.query[field] !== undefined) {
        if (!validId(req.query[field])) return invalid(res, `Invalid ${field}`);
        filter[field] = req.query[field];
      }
    }
    if (req.query.sectionId !== undefined) {
      if (req.query.sectionId === "none") filter.sectionId = null;
      else if (!validId(req.query.sectionId)) return invalid(res, "Invalid sectionId");
      else filter.sectionId = req.query.sectionId;
    }
    if (req.query.dayOfWeek !== undefined) {
      const day = Number(req.query.dayOfWeek);
      if (!Number.isInteger(day) || day < 1 || day > 6) return invalid(res, "dayOfWeek must be between 1 (Monday) and 6 (Saturday)");
      filter.dayOfWeek = day;
    }
    if (req.query.status !== undefined) {
      if (!["active", "inactive"].includes(req.query.status)) return invalid(res, "Invalid timetable status");
      filter.status = req.query.status;
    } else filter.status = "active";
    const data = await populateEntry(TimetableEntry.find(filter))
      .sort({ dayOfWeek: 1, periodNumber: 1, startTime: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) { return next(error); }
};

export const createTimetableEntry = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(res, "Provide timetable entry details");
    if (["tenantId", "createdBy", "status", "teacherId", "subjectId"].some((key) => Object.hasOwn(body, key))) {
      return invalid(res, "School, teacher, subject, creator and initial status are determined by the selected assignment and server");
    }
    const { academicYearId, classId, sectionId, assignmentId, dayOfWeek, periodNumber, startTime, endTime, room = "" } = body;
    if (![academicYearId, classId, assignmentId].every(validId)) return invalid(res, "Academic year, class and teacher assignment are required");
    if (sectionId !== undefined && sectionId !== null && sectionId !== "" && !validId(sectionId)) return invalid(res, "Invalid section ID");
    const day = Number(dayOfWeek), period = Number(periodNumber);
    if (!Number.isInteger(day) || day < 1 || day > 6) return invalid(res, "Select a weekday from Monday to Saturday");
    if (!Number.isInteger(period) || period < 1 || period > 20) return invalid(res, "Period number must be between 1 and 20");
    const start = timeToMinutes(startTime), end = timeToMinutes(endTime);
    if (start === null || end === null || end <= start) return invalid(res, "Provide valid 24-hour times and ensure the end time is after the start time");
    if (typeof room !== "string" || room.trim().length > 50) return invalid(res, "Room must be 50 characters or fewer");

    const [year, schoolClass, assignment] = await Promise.all([
      AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } }).select("_id").lean(),
      SchoolClass.findOne({ _id: classId, tenantId: req.tenantId, status: "active" }).select("_id academicYearId").lean(),
      TeacherAssignment.findOne({ _id: assignmentId, tenantId: req.tenantId, status: "active" })
        .populate("teacherId", "_id firstName lastName")
        .populate("subjectId", "_id name").lean(),
    ]);
    if (!year) return res.status(400).json({ success: false, message: "Select an open academic year from this school" });
    if (!schoolClass || String(schoolClass.academicYearId) !== String(academicYearId)) return invalid(res, "The selected class does not belong to this academic year and school");
    if (!assignment || String(assignment.academicYearId) !== String(academicYearId) || String(assignment.classId) !== String(classId)) {
      return invalid(res, "Select an active teacher assignment for this class and academic year");
    }
    const scheduleError = await validateConfiguredPeriod({ tenantId: req.tenantId, academicYearId, periodNumber: period, startTime, endTime });
    if (scheduleError) return invalid(res, scheduleError);

    const selectedSection = sectionId || null;
    if (selectedSection) {
      const section = await Section.findOne({ _id: selectedSection, tenantId: req.tenantId, classId, status: "active" }).select("_id").lean();
      if (!section) return invalid(res, "The selected section is not active in this class");
      if (assignment.sectionId && String(assignment.sectionId) !== String(selectedSection)) return invalid(res, "The selected teacher assignment is for a different section");
    } else if (assignment.sectionId) {
      return invalid(res, "A section-specific teacher assignment requires the same timetable section");
    }

    const scope = { tenantId: req.tenantId, academicYearId, classId, dayOfWeek: day, status: "active" };
    const sectionConflict = selectedSection
      ? { $or: [{ sectionId: null }, { sectionId: selectedSection }] }
      : {};
    const classEntries = await TimetableEntry.find({ ...scope, ...sectionConflict }).select("periodNumber startTime endTime").lean();
    const overlaps = (entry) => start < timeToMinutes(entry.endTime) && end > timeToMinutes(entry.startTime);
    if (classEntries.some((entry) => entry.periodNumber === period || overlaps(entry))) {
      return res.status(409).json({ success: false, message: "This class or section already has a timetable entry in the selected period or time range" });
    }

    const teacherAssignments = await TeacherAssignment.find({
      tenantId: req.tenantId, academicYearId, teacherId: assignment.teacherId._id,
    }).select("_id").lean();
    const teacherEntries = await TimetableEntry.find({
      tenantId: req.tenantId, academicYearId, dayOfWeek: day, status: "active",
      assignmentId: { $in: teacherAssignments.map((item) => item._id) },
    }).select("startTime endTime").lean();
    if (teacherEntries.some(overlaps)) {
      return res.status(409).json({ success: false, message: "This teacher already has a class during the selected time range" });
    }

    const created = await TimetableEntry.create({
      tenantId: req.tenantId, academicYearId, classId, sectionId: selectedSection,
      assignmentId, dayOfWeek: day, periodNumber: period, startTime, endTime,
      room: room.trim(), createdBy: req.auth.userId,
    });
    const data = await populateEntry(TimetableEntry.findOne({ _id: created._id, tenantId: req.tenantId })).lean();
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This class period is already occupied" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more timetable fields are invalid");
    return next(error);
  }
};

export const updateTimetableEntry = async (req, res, next) => {
  try {
    if (!validId(req.params.entryId)) return invalid(res, "Invalid timetable entry ID");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
      return invalid(res, "Provide timetable changes");
    }
    const entry = await TimetableEntry.findOne({ _id: req.params.entryId, tenantId: req.tenantId });
    if (!entry) return res.status(404).json({ success: false, message: "Timetable entry not found" });

    if (Object.keys(body).length === 1 && ["active", "inactive"].includes(body.status)) {
      if (body.status === "active") {
        const scheduleError = await validateConfiguredPeriod({
          tenantId: req.tenantId, academicYearId: entry.academicYearId,
          periodNumber: entry.periodNumber, startTime: entry.startTime, endTime: entry.endTime,
        });
        if (scheduleError) return res.status(409).json({ success: false, message: scheduleError });
        const assignment = await TeacherAssignment.findOne({ _id: entry.assignmentId, tenantId: req.tenantId, status: "active" }).select("teacherId").lean();
        if (!assignment) return res.status(409).json({ success: false, message: "Activate the linked teacher assignment before activating this timetable entry" });
        const classScope = {
          tenantId: req.tenantId, academicYearId: entry.academicYearId, classId: entry.classId,
          dayOfWeek: entry.dayOfWeek, status: "active", _id: { $ne: entry._id },
          ...(entry.sectionId ? { $or: [{ sectionId: null }, { sectionId: entry.sectionId }] } : {}),
        };
        const classEntries = await TimetableEntry.find(classScope).select("periodNumber startTime endTime").lean();
        const start = timeToMinutes(entry.startTime), end = timeToMinutes(entry.endTime);
        const overlaps = (item) => start < timeToMinutes(item.endTime) && end > timeToMinutes(item.startTime);
        if (classEntries.some((item) => item.periodNumber === entry.periodNumber || overlaps(item))) {
          return res.status(409).json({ success: false, message: "This class or section now has another timetable entry in the selected period or time range" });
        }
        const teacherAssignmentIds = await TeacherAssignment.find({ tenantId: req.tenantId, academicYearId: entry.academicYearId, teacherId: assignment.teacherId }).distinct("_id");
        const teacherEntries = await TimetableEntry.find({
          tenantId: req.tenantId, academicYearId: entry.academicYearId, dayOfWeek: entry.dayOfWeek,
          status: "active", _id: { $ne: entry._id }, assignmentId: { $in: teacherAssignmentIds },
        }).select("startTime endTime").lean();
        if (teacherEntries.some(overlaps)) {
          return res.status(409).json({ success: false, message: "This teacher already has a class during the selected time range" });
        }
      }
      entry.status = body.status;
    } else {
      const editableFields = ["assignmentId", "dayOfWeek", "periodNumber", "startTime", "endTime", "room"];
      if (Object.keys(body).some((key) => !editableFields.includes(key))) {
        return invalid(res, "Only assignment, weekday, period, time and room can be edited");
      }
      const assignmentId = body.assignmentId ?? String(entry.assignmentId);
      const day = Number(body.dayOfWeek ?? entry.dayOfWeek);
      const period = Number(body.periodNumber ?? entry.periodNumber);
      const startTime = body.startTime ?? entry.startTime;
      const endTime = body.endTime ?? entry.endTime;
      const room = body.room ?? entry.room;
      if (!validId(assignmentId)) return invalid(res, "Select a valid teacher assignment");
      if (!Number.isInteger(day) || day < 1 || day > 6) return invalid(res, "Select a weekday from Monday to Saturday");
      if (!Number.isInteger(period) || period < 1 || period > 20) return invalid(res, "Period number must be between 1 and 20");
      const start = timeToMinutes(startTime), end = timeToMinutes(endTime);
      if (start === null || end === null || end <= start) return invalid(res, "Provide valid 24-hour times and ensure the end time is after the start time");
      if (typeof room !== "string" || room.trim().length > 50) return invalid(res, "Room must be 50 characters or fewer");

      const [year, assignment] = await Promise.all([
        AcademicYear.findOne({ _id: entry.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } }).select("_id").lean(),
        TeacherAssignment.findOne({ _id: assignmentId, tenantId: req.tenantId, status: "active" }).select("teacherId academicYearId classId sectionId").lean(),
      ]);
      if (!year) return res.status(409).json({ success: false, message: "A timetable in a closed academic year cannot be edited" });
      if (!assignment || String(assignment.academicYearId) !== String(entry.academicYearId) ||
        String(assignment.classId) !== String(entry.classId) ||
        (assignment.sectionId && String(assignment.sectionId) !== String(entry.sectionId || ""))) {
        return invalid(res, "Select an active teacher assignment for this class, section and academic year");
      }

      const scheduleError = await validateConfiguredPeriod({ tenantId: req.tenantId, academicYearId: entry.academicYearId, periodNumber: period, startTime, endTime });
      if (scheduleError) return invalid(res, scheduleError);

      const sectionConflict = entry.sectionId
        ? { $or: [{ sectionId: null }, { sectionId: entry.sectionId }] }
        : {};
      const classEntries = await TimetableEntry.find({
        tenantId: req.tenantId, academicYearId: entry.academicYearId, classId: entry.classId,
        dayOfWeek: day, status: "active", _id: { $ne: entry._id }, ...sectionConflict,
      }).select("periodNumber startTime endTime").lean();
      const overlaps = (item) => start < timeToMinutes(item.endTime) && end > timeToMinutes(item.startTime);
      if (entry.status === "active" && classEntries.some((item) => item.periodNumber === period || overlaps(item))) {
        return res.status(409).json({ success: false, message: "This class or section already has a timetable entry in the selected period or time range" });
      }

      const teacherAssignmentIds = await TeacherAssignment.find({
        tenantId: req.tenantId, academicYearId: entry.academicYearId, teacherId: assignment.teacherId,
      }).distinct("_id");
      const teacherEntries = await TimetableEntry.find({
        tenantId: req.tenantId, academicYearId: entry.academicYearId, dayOfWeek: day,
        status: "active", _id: { $ne: entry._id }, assignmentId: { $in: teacherAssignmentIds },
      }).select("startTime endTime").lean();
      if (entry.status === "active" && teacherEntries.some(overlaps)) {
        return res.status(409).json({ success: false, message: "This teacher already has a class during the selected time range" });
      }

      entry.assignmentId = assignmentId;
      entry.dayOfWeek = day;
      entry.periodNumber = period;
      entry.startTime = startTime;
      entry.endTime = endTime;
      entry.room = room.trim();
    }
    await entry.save();
    const data = await populateEntry(TimetableEntry.findOne({ _id: entry._id, tenantId: req.tenantId })).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This class period is already occupied" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more timetable fields are invalid");
    return next(error);
  }
};
