import mongoose from "mongoose";

const examMarkSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  examinationId: { type: mongoose.Schema.Types.ObjectId, ref: "Examination", required: true, immutable: true },
  examSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamSubject", required: true, immutable: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  marksObtained: { type: Number, min: 0, default: null },
  absent: { type: Boolean, default: false, required: true },
  remarks: { type: String, trim: true, default: "", maxlength: 300 },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

examMarkSchema.pre("validate", function validateMarkState(next) {
  if (this.absent && this.marksObtained !== null) this.invalidate("marksObtained", "Absent students cannot have marks");
  if (!this.absent && this.marksObtained === null) this.invalidate("marksObtained", "Enter marks or mark the student absent");
  next();
});
examMarkSchema.index({ tenantId: 1, examinationId: 1, examSubjectId: 1, enrollmentId: 1 }, { unique: true, name: "unique_mark_per_exam_subject_enrollment" });
examMarkSchema.index({ tenantId: 1, examinationId: 1, studentId: 1 });
export default mongoose.model("ExamMark", examMarkSchema);
