import mongoose from "mongoose";
import TimetableEntry from "../models/TimetableEntry.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import AcademicSchedule from "../models/AcademicSchedule.js";
import User from "../models/User.js";

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
    let ownAssignments = null;
    if (req.auth.role === "teacher") {
      ownAssignments = await TeacherAssignment.find({
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
        if (field === "assignmentId" && ownAssignments &&
          !ownAssignments.some((id) => String(id) === String(req.query.assignmentId))) {
          return res.status(403).json({ success: false, message: "You may only view timetable entries for your own active assignments" });
        }
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

  const session = await mongoose.startSession();
  let entryId;
  try {
    await session.withTransaction(async () => {
      const year = await AcademicYear.findOneAndUpdate(
        { _id: academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!year) { const error = new Error("Select an open academic year from this school"); error.code = "TIMETABLE_YEAR_CLOSED"; throw error; }
      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: classId, tenantId: req.tenantId, academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!schoolClass) { const error = new Error("The selected class does not belong to this academic year and school or is inactive"); error.code = "TIMETABLE_CLASS_INVALID"; throw error; }
      const assignment = await TeacherAssignment.findOne({
        _id: assignmentId, tenantId: req.tenantId, status: "active", academicYearId, classId,
      }).populate("teacherId", "_id firstName lastName status").populate("subjectId", "_id name").session(session);
      if (!assignment || assignment.teacherId?.status !== "active") { const error = new Error("Select an active teacher assignment for this class and academic year"); error.code = "TIMETABLE_ASSIGNMENT_INVALID"; throw error; }
      const teacher = await User.findOneAndUpdate(
        { _id: assignment.teacherId._id, tenantId: req.tenantId, role: "teacher", status: "active" },
        { $inc: { timetableRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!teacher) { const error = new Error("The assigned teacher is no longer active"); error.code = "TIMETABLE_TEACHER_INVALID"; throw error; }

      const scheduleError = await validateConfiguredPeriod({ tenantId: req.tenantId, academicYearId, periodNumber: period, startTime, endTime });
      if (scheduleError) { const error = new Error(scheduleError); error.code = "TIMETABLE_PERIOD_INVALID"; throw error; }
      const selectedSection = sectionId || null;
      if (selectedSection) {
        const section = await Section.findOneAndUpdate(
          { _id: selectedSection, tenantId: req.tenantId, classId, status: "active" },
          { $inc: { capacityRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!section) { const error = new Error("The selected section is not active in this class"); error.code = "TIMETABLE_SECTION_INVALID"; throw error; }
        if (assignment.sectionId && String(assignment.sectionId) !== String(selectedSection)) { const error = new Error("The selected teacher assignment is for a different section"); error.code = "TIMETABLE_SECTION_MISMATCH"; throw error; }
      } else if (assignment.sectionId) {
        const error = new Error("A section-specific teacher assignment requires the same timetable section"); error.code = "TIMETABLE_SECTION_MISMATCH"; throw error;
      }

      const scope = { tenantId: req.tenantId, academicYearId, classId, dayOfWeek: day, status: "active" };
      const sectionConflict = selectedSection ? { $or: [{ sectionId: null }, { sectionId: selectedSection }] } : {};
      const classEntries = await TimetableEntry.find({ ...scope, ...sectionConflict }).select("periodNumber startTime endTime").session(session).lean();
      const overlaps = (item) => start < timeToMinutes(item.endTime) && end > timeToMinutes(item.startTime);
      if (classEntries.some((item) => item.periodNumber === period || overlaps(item))) { const error = new Error("This class or section already has a timetable entry in the selected period or time range"); error.code = "TIMETABLE_CLASS_CONFLICT"; throw error; }

      const teacherAssignments = await TeacherAssignment.find({
        tenantId: req.tenantId, academicYearId, teacherId: assignment.teacherId._id, status: "active",
      }).select("_id").session(session).lean();
      const teacherEntries = await TimetableEntry.find({
        tenantId: req.tenantId, academicYearId, dayOfWeek: day, status: "active",
        assignmentId: { $in: teacherAssignments.map((item) => item._id) },
      }).select("startTime endTime").session(session).lean();
      if (teacherEntries.some(overlaps)) { const error = new Error("This teacher already has a class during the selected time range"); error.code = "TIMETABLE_TEACHER_CONFLICT"; throw error; }

      const [created] = await TimetableEntry.create([{
        tenantId: req.tenantId, academicYearId, classId, sectionId: selectedSection,
        assignmentId, dayOfWeek: day, periodNumber: period, startTime, endTime,
        room: room.trim(), createdBy: req.auth.userId,
      }], { session });
      entryId = created._id;
    });
    const data = await populateEntry(TimetableEntry.findOne({ _id: entryId, tenantId: req.tenantId })).lean();
    return res.status(201).json({ success: true, data });
  } catch (error) {
    const conflicts = {
      TIMETABLE_YEAR_CLOSED: [409, "Select an open academic year from this school"],
      TIMETABLE_CLASS_INVALID: [400, "The selected class does not belong to this academic year and school or is inactive"],
      TIMETABLE_ASSIGNMENT_INVALID: [400, "Select an active teacher assignment for this class and academic year"],
      TIMETABLE_TEACHER_INVALID: [409, "The assigned teacher is no longer active"],
      TIMETABLE_PERIOD_INVALID: [400, error.message],
      TIMETABLE_SECTION_INVALID: [400, "The selected section is not active in this class"],
      TIMETABLE_SECTION_MISMATCH: [400, error.message],
      TIMETABLE_CLASS_CONFLICT: [409, "This class or section already has a timetable entry in the selected period or time range"],
      TIMETABLE_TEACHER_CONFLICT: [409, "This teacher already has a class during the selected time range"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This class period is already occupied" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more timetable fields are invalid");
    console.error("[timetable:create]", error.name, error.message, error.code);
    return next(error);
  } finally { await session.endSession(); }
};

export const updateTimetableEntry = async (req, res, next) => {
  if (!validId(req.params.entryId)) return invalid(res, "Invalid timetable entry ID");
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) return invalid(res, "Provide timetable changes");
  const session = await mongoose.startSession();
  let updatedId;
  try {
    await session.withTransaction(async () => {
      const entry = await TimetableEntry.findOne({ _id: req.params.entryId, tenantId: req.tenantId }).session(session);
      if (!entry) { const error = new Error("Timetable entry not found"); error.code = "TIMETABLE_ENTRY_NOT_FOUND"; throw error; }

      if (Object.keys(body).length === 1 && body.status === "inactive") {
        entry.status = "inactive";
        await entry.save({ session });
        updatedId = entry._id;
        return;
      }
      if (Object.keys(body).length === 1 && body.status === "active") {
        // Reactivation uses the same shared locks and conflict checks as creation.
      } else {
        const editableFields = ["assignmentId", "dayOfWeek", "periodNumber", "startTime", "endTime", "room"];
        if (Object.keys(body).some((key) => !editableFields.includes(key))) { const error = new Error("Only assignment, weekday, period, time and room can be edited"); error.code = "TIMETABLE_INVALID_FIELDS"; throw error; }
      }

      const year = await AcademicYear.findOneAndUpdate(
        { _id: entry.academicYearId, tenantId: req.tenantId, status: { $ne: "closed" } },
        { $inc: { lifecycleRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!year) { const error = new Error("A timetable in a closed academic year cannot be activated or edited"); error.code = "TIMETABLE_YEAR_CLOSED"; throw error; }
      const schoolClass = await SchoolClass.findOneAndUpdate(
        { _id: entry.classId, tenantId: req.tenantId, academicYearId: entry.academicYearId, status: "active" },
        { $inc: { placementRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!schoolClass) { const error = new Error("The timetable class is inactive"); error.code = "TIMETABLE_CLASS_INVALID"; throw error; }

      const assignmentId = body.assignmentId ?? String(entry.assignmentId);
      const day = Number(body.dayOfWeek ?? entry.dayOfWeek);
      const period = Number(body.periodNumber ?? entry.periodNumber);
      const startTime = body.startTime ?? entry.startTime;
      const endTime = body.endTime ?? entry.endTime;
      const room = body.room ?? entry.room;
      if (!validId(assignmentId)) { const error = new Error("Select a valid teacher assignment"); error.code = "TIMETABLE_ASSIGNMENT_INVALID"; throw error; }
      if (!Number.isInteger(day) || day < 1 || day > 6) { const error = new Error("Select a weekday from Monday to Saturday"); error.code = "TIMETABLE_DAY_INVALID"; throw error; }
      if (!Number.isInteger(period) || period < 1 || period > 20) { const error = new Error("Period number must be between 1 and 20"); error.code = "TIMETABLE_PERIOD_NUMBER_INVALID"; throw error; }
      const startMinutes = timeToMinutes(startTime), endMinutes = timeToMinutes(endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) { const error = new Error("Provide valid 24-hour times and ensure the end time is after the start time"); error.code = "TIMETABLE_TIME_INVALID"; throw error; }
      if (typeof room !== "string" || room.trim().length > 50) { const error = new Error("Room must be 50 characters or fewer"); error.code = "TIMETABLE_ROOM_INVALID"; throw error; }

      const assignment = await TeacherAssignment.findOne({
        _id: assignmentId, tenantId: req.tenantId, status: "active",
        academicYearId: entry.academicYearId, classId: entry.classId,
      }).select("teacherId sectionId").session(session).lean();
      if (!assignment) { const error = new Error("Select an active teacher assignment for this class and academic year"); error.code = "TIMETABLE_ASSIGNMENT_INVALID"; throw error; }
      if (assignment.sectionId && String(assignment.sectionId) !== String(entry.sectionId || "")) { const error = new Error("Select an assignment for the timetable section"); error.code = "TIMETABLE_SECTION_MISMATCH"; throw error; }
      if (entry.sectionId) {
        const section = await Section.findOneAndUpdate(
          { _id: entry.sectionId, tenantId: req.tenantId, classId: entry.classId, status: "active" },
          { $inc: { capacityRevision: 1 } }, { new: true, session }
        ).select("_id").lean();
        if (!section) { const error = new Error("The timetable section is inactive"); error.code = "TIMETABLE_SECTION_INVALID"; throw error; }
      }
      const teacher = await User.findOneAndUpdate(
        { _id: assignment.teacherId, tenantId: req.tenantId, role: "teacher", status: "active" },
        { $inc: { timetableRevision: 1 } }, { new: true, session }
      ).select("_id").lean();
      if (!teacher) { const error = new Error("The assigned teacher is inactive"); error.code = "TIMETABLE_TEACHER_INVALID"; throw error; }

      const scheduleError = await validateConfiguredPeriod({
        tenantId: req.tenantId, academicYearId: entry.academicYearId,
        periodNumber: period, startTime, endTime,
      });
      if (scheduleError) { const error = new Error(scheduleError); error.code = "TIMETABLE_PERIOD_INVALID"; throw error; }

      const sectionConflict = entry.sectionId ? { $or: [{ sectionId: null }, { sectionId: entry.sectionId }] } : {};
      const classEntries = await TimetableEntry.find({
        tenantId: req.tenantId, academicYearId: entry.academicYearId, classId: entry.classId,
        dayOfWeek: day, status: "active", _id: { $ne: entry._id }, ...sectionConflict,
      }).select("periodNumber startTime endTime").session(session).lean();
      const overlaps = (item) => startMinutes < timeToMinutes(item.endTime) && endMinutes > timeToMinutes(item.startTime);
      if (classEntries.some((item) => item.periodNumber === period || overlaps(item))) { const error = new Error("This class or section already has a timetable entry in the selected period or time range"); error.code = "TIMETABLE_CLASS_CONFLICT"; throw error; }

      const teacherAssignments = await TeacherAssignment.find({
        tenantId: req.tenantId, academicYearId: entry.academicYearId, teacherId: assignment.teacherId, status: "active",
      }).select("_id").session(session).lean();
      const teacherEntries = await TimetableEntry.find({
        tenantId: req.tenantId, academicYearId: entry.academicYearId, dayOfWeek: day,
        status: "active", _id: { $ne: entry._id }, assignmentId: { $in: teacherAssignments.map((item) => item._id) },
      }).select("startTime endTime").session(session).lean();
      if (teacherEntries.some(overlaps)) { const error = new Error("This teacher already has a class during the selected time range"); error.code = "TIMETABLE_TEACHER_CONFLICT"; throw error; }

      entry.assignmentId = assignmentId;
      entry.dayOfWeek = day;
      entry.periodNumber = period;
      entry.startTime = startTime;
      entry.endTime = endTime;
      entry.room = room.trim();
      if (body.status === "active") entry.status = "active";
      await entry.save({ session });
      updatedId = entry._id;
    });
    const data = await populateEntry(TimetableEntry.findOne({ _id: updatedId, tenantId: req.tenantId })).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const conflicts = {
      TIMETABLE_ENTRY_NOT_FOUND: [404, "Timetable entry not found"],
      TIMETABLE_INVALID_FIELDS: [400, "Only assignment, weekday, period, time and room can be edited"],
      TIMETABLE_YEAR_CLOSED: [409, "A timetable in a closed academic year cannot be activated or edited"],
      TIMETABLE_CLASS_INVALID: [409, "The timetable class is inactive"],
      TIMETABLE_ASSIGNMENT_INVALID: [400, "Select an active teacher assignment for this class and academic year"],
      TIMETABLE_DAY_INVALID: [400, "Select a weekday from Monday to Saturday"],
      TIMETABLE_PERIOD_NUMBER_INVALID: [400, "Period number must be between 1 and 20"],
      TIMETABLE_TIME_INVALID: [400, "Provide valid 24-hour times and ensure the end time is after the start time"],
      TIMETABLE_ROOM_INVALID: [400, "Room must be 50 characters or fewer"],
      TIMETABLE_SECTION_MISMATCH: [400, "Select an assignment for the timetable section"],
      TIMETABLE_SECTION_INVALID: [409, "The timetable section is inactive"],
      TIMETABLE_TEACHER_INVALID: [409, "The assigned teacher is inactive"],
      TIMETABLE_PERIOD_INVALID: [400, error.message],
      TIMETABLE_CLASS_CONFLICT: [409, "This class or section already has a timetable entry in the selected period or time range"],
      TIMETABLE_TEACHER_CONFLICT: [409, "This teacher already has a class during the selected time range"],
    };
    if (conflicts[error.code]) return res.status(conflicts[error.code][0]).json({ success: false, message: conflicts[error.code][1] });
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This class period is already occupied" });
    if (error.name === "ValidationError" || error.name === "CastError") return invalid(res, "One or more timetable fields are invalid");
    return next(error);
  } finally { await session.endSession(); }
};
