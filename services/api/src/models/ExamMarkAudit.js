import mongoose from "mongoose";

const examMarkAuditSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  examinationId: { type: mongoose.Schema.Types.ObjectId, ref: "Examination", required: true, immutable: true },
  examMarkId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamMark", required: true, immutable: true },
  examSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamSubject", required: true, immutable: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  action: { type: String, enum: ["created", "updated"], required: true, immutable: true },
  previous: {
    marksObtained: { type: Number, default: null },
    absent: { type: Boolean, default: false },
    remarks: { type: String, default: "" },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  current: {
    marksObtained: { type: Number, default: null },
    absent: { type: Boolean, required: true },
    remarks: { type: String, default: "" },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  changeReason: { type: String, trim: true, maxlength: 500, default: "", immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

examMarkAuditSchema.index(
  { tenantId: 1, examinationId: 1, examMarkId: 1, createdAt: -1 },
  { name: "exam_mark_audit_history" }
);
examMarkAuditSchema.index(
  { tenantId: 1, examinationId: 1, enrollmentId: 1, examSubjectId: 1, createdAt: -1 },
  { name: "exam_mark_audit_lookup" }
);

const immutableOperation = function rejectAuditMutation(next) {
  next(new Error("Examination mark audit records are immutable"));
};
examMarkAuditSchema.pre("updateOne", immutableOperation);
examMarkAuditSchema.pre("updateMany", immutableOperation);
examMarkAuditSchema.pre("findOneAndUpdate", immutableOperation);
examMarkAuditSchema.pre("deleteOne", immutableOperation);
examMarkAuditSchema.pre("deleteMany", immutableOperation);
examMarkAuditSchema.pre("findOneAndDelete", immutableOperation);
examMarkAuditSchema.pre("replaceOne", immutableOperation);

export default mongoose.model("ExamMarkAudit", examMarkAuditSchema);
