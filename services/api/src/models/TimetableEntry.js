import mongoose from "mongoose";

const timetableEntrySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, immutable: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null, immutable: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "TeacherAssignment", required: true },
  dayOfWeek: { type: Number, required: true, min: 1, max: 6 },
  periodNumber: { type: Number, required: true, min: 1, max: 20 },
  startTime: { type: String, required: true, match: /^([01][0-9]|2[0-3]):[0-5][0-9]$/ },
  endTime: { type: String, required: true, match: /^([01][0-9]|2[0-3]):[0-5][0-9]$/ },
  room: { type: String, trim: true, default: "", maxlength: 50 },
  status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true, versionKey: false });

timetableEntrySchema.index(
  { tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, dayOfWeek: 1, periodNumber: 1 },
  { unique: true, partialFilterExpression: { status: "active" }, name: "unique_active_class_period" }
);
timetableEntrySchema.index({ tenantId: 1, academicYearId: 1, dayOfWeek: 1, status: 1 });
timetableEntrySchema.index({ tenantId: 1, assignmentId: 1, status: 1 });

export default mongoose.model("TimetableEntry", timetableEntrySchema);
