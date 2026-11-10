import mongoose from "mongoose";

const certificateSnapshotSchema = new mongoose.Schema({
  school: { type: String, required: true, trim: true, maxlength: 150 },
  admissionNumber: { type: String, required: true, trim: true, maxlength: 50 },
  studentName: { type: String, required: true, trim: true, maxlength: 170 },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, default: "not_specified", maxlength: 20 },
  address: { type: mongoose.Schema.Types.Mixed, default: {} },
  admissionDate: { type: Date, default: null },
  academicYear: { type: String, required: true, maxlength: 30 },
  className: { type: String, required: true, maxlength: 80 },
  sectionName: { type: String, default: "", maxlength: 50 },
  enrollmentDate: { type: Date, required: true },
  enrollmentEndedAt: { type: Date, default: null },
  enrollmentStatus: { type: String, required: true, enum: ["active", "completed", "transferred", "withdrawn"] },
  transferReason: { type: String, default: "", maxlength: 500 },
}, { _id: false, versionKey: false });

const certificateSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  type: { type: String, enum: ["bonafide", "transfer"], required: true, immutable: true },
  certificateNumber: { type: String, required: true, trim: true, maxlength: 60, immutable: true },
  verificationCode: { type: String, required: true, select: false, immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  reason: { type: String, trim: true, default: "", maxlength: 500, immutable: true },
  remarks: { type: String, trim: true, default: "", maxlength: 500, immutable: true },
  snapshot: { type: certificateSnapshotSchema, required: true, immutable: true },
  status: { type: String, enum: ["issued", "void"], default: "issued", required: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  voidReason: { type: String, trim: true, default: "", maxlength: 500 },
  reissuedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Certificate", default: null, immutable: true },
}, { timestamps: true, versionKey: false });

certificateSchema.index({ tenantId: 1, certificateNumber: 1 }, { unique: true, name: "unique_certificate_number_per_school" });
certificateSchema.index({ tenantId: 1, verificationCode: 1 }, { unique: true, name: "unique_certificate_verification_code" });
certificateSchema.index({ tenantId: 1, studentId: 1, issuedAt: -1 });
certificateSchema.index({ tenantId: 1, type: 1, status: 1, issuedAt: -1 });

export default mongoose.model("Certificate", certificateSchema);
