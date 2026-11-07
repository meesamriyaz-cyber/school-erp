import mongoose from "mongoose";

const homeworkSubmissionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  homeworkId: { type: mongoose.Schema.Types.ObjectId, ref: "Homework", required: true, immutable: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  answer: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
  submittedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ["submitted", "reviewed"], default: "submitted", required: true },
  marksObtained: { type: Number, min: 0, default: null },
  maxMarks: { type: Number, min: 0, default: null },
  feedback: { type: String, trim: true, default: "", maxlength: 3000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

homeworkSubmissionSchema.index({ tenantId: 1, homeworkId: 1, enrollmentId: 1 }, { unique: true, name: "one_submission_per_homework_enrollment" });
homeworkSubmissionSchema.index({ tenantId: 1, studentId: 1, submittedAt: -1 });
export default mongoose.model("HomeworkSubmission", homeworkSubmissionSchema);
