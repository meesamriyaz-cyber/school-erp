import mongoose from "mongoose";

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const periodSchema = new mongoose.Schema({
  periodNumber: { type: Number, required: true, min: 1, max: 20 },
  label: { type: String, trim: true, default: "", maxlength: 40 },
  startTime: { type: String, required: true, match: timePattern },
  endTime: { type: String, required: true, match: timePattern },
}, { _id: false });

const breakSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 40 },
  startTime: { type: String, required: true, match: timePattern },
  endTime: { type: String, required: true, match: timePattern },
}, { _id: false });

const academicScheduleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  periods: { type: [periodSchema], default: [] },
  breaks: { type: [breakSchema], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

academicScheduleSchema.index({ tenantId: 1, academicYearId: 1 }, { unique: true });

export default mongoose.model("AcademicSchedule", academicScheduleSchema);
