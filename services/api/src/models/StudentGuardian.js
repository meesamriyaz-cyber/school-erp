import mongoose from "mongoose";

const RELATIONSHIPS = [
  "mother", "father", "uncle", "aunt", "legal_guardian", "grandparent", "step_parent", "sibling", "other",
];

const auditChangeSchema = new mongoose.Schema({
  field: { type: String, required: true },
  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const relationshipAuditSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ["created", "updated", "primary_promoted", "primary_demoted", "deactivated", "reactivated"],
    required: true,
  },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  changes: { type: [auditChangeSchema], default: [] },
  changedAt: { type: Date, default: Date.now, required: true },
}, { _id: false });

const studentGuardianSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", required: true, immutable: true },
    relationship: { type: String, enum: RELATIONSHIPS, required: true },
    source: { type: String, enum: ["manual", "legacy_student", "manual_and_legacy"], default: "manual" },
    isPrimary: { type: Boolean, default: false },
    // Independent of emergency-contact, pickup, and communication permissions.
    canAccessPortal: { type: Boolean },
    isEmergencyContact: { type: Boolean, default: false },
    canPickup: { type: Boolean, default: false },
    receivesCommunication: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    auditTrail: { type: [relationshipAuditSchema], default: [] },
  },
  { timestamps: true },
);

studentGuardianSchema.index({ tenantId: 1, studentId: 1, guardianId: 1 }, { unique: true });
studentGuardianSchema.index(
  { tenantId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true, status: "active" } },
);

const StudentGuardian = mongoose.models.StudentGuardian || mongoose.model("StudentGuardian", studentGuardianSchema);
export { RELATIONSHIPS };
export default StudentGuardian;
