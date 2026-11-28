import mongoose from "mongoose";

const placementSchema = new mongoose.Schema({
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null },
}, { _id: false });

const enrollmentTransferAuditSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  fromEnrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  toEnrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  previousPlacement: { type: placementSchema, required: true, immutable: true },
  nextPlacement: { type: placementSchema, required: true, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  transferredAt: { type: Date, required: true, immutable: true },
}, { timestamps: true, versionKey: false });

enrollmentTransferAuditSchema.index({ tenantId: 1, studentId: 1, transferredAt: -1 });
enrollmentTransferAuditSchema.index({ tenantId: 1, fromEnrollmentId: 1 }, { unique: true });

export default mongoose.model("EnrollmentTransferAudit", enrollmentTransferAuditSchema);
