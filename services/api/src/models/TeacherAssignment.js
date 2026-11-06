import mongoose from "mongoose";

const teacherAssignmentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, immutable: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null, immutable: true },
  status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true, versionKey: false });

teacherAssignmentSchema.index(
  { tenantId: 1, teacherId: 1, subjectId: 1, academicYearId: 1, classId: 1, sectionId: 1 },
  { unique: true, name: "unique_teacher_subject_class_assignment" }
);
teacherAssignmentSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, status: 1 });
teacherAssignmentSchema.index({ tenantId: 1, teacherId: 1, academicYearId: 1, status: 1 });

export default mongoose.model("TeacherAssignment", teacherAssignmentSchema);
