import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  category: { type: String, enum: ["compulsory", "elective"], required: true },
  weeklyPeriods: { type: Number, min: 0, max: 60, required: true },
  sortOrder: { type: Number, min: 0, max: 1000, required: true },
  status: { type: String, enum: ["active", "inactive"], required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  changedAt: { type: Date, required: true },
}, { _id: false });

const classSubjectSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, immutable: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true, immutable: true },
  category: { type: String, enum: ["compulsory", "elective"], default: "compulsory", required: true },
  weeklyPeriods: { type: Number, min: 0, max: 60, default: 0 },
  sortOrder: { type: Number, min: 0, max: 1000, default: 0 },
  status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  revision: { type: Number, min: 1, default: 1, required: true },
  history: { type: [historySchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

classSubjectSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, subjectId: 1 }, { unique: true, name: "unique_subject_per_class_year" });
classSubjectSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, status: 1, sortOrder: 1 });
classSubjectSchema.index({ tenantId: 1, subjectId: 1, status: 1 });

export default mongoose.model("ClassSubject", classSubjectSchema);
