import mongoose from "mongoose";

const examSubjectSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    examinationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Examination",
      required: true,
      immutable: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      immutable: true,
    },
    examDate: {
      type: Date,
      required: [true, "Subject examination date is required"],
    },
    startTime: {
      type: String,
      trim: true,
      default: "",
      match: [/^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Start time must use HH:mm format"],
    },
    endTime: {
      type: String,
      trim: true,
      default: "",
      match: [/^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/, "End time must use HH:mm format"],
      validate: {
        validator(value) {
          return !value || !this.startTime || value > this.startTime;
        },
        message: "End time must be later than start time",
      },
    },
    maxMarks: {
      type: Number,
      required: [true, "Maximum marks are required"],
      min: [0.01, "Maximum marks must be greater than zero"],
    },
    passMarks: {
      type: Number,
      required: [true, "Passing marks are required"],
      min: [0, "Passing marks cannot be negative"],
      validate: {
        validator(value) {
          return this.maxMarks === undefined || value <= this.maxMarks;
        },
        message: "Passing marks cannot exceed maximum marks",
      },
    },
    durationMinutes: {
      type: Number,
      min: [1, "Duration must be at least one minute"],
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

examSubjectSchema.pre("validate", function validateTimeRange() {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate("endTime", "End time must be later than start time");
  }
});

examSubjectSchema.index(
  { tenantId: 1, examinationId: 1, subjectId: 1 },
  { unique: true, name: "unique_subject_per_examination" }
);
examSubjectSchema.index({ tenantId: 1, examinationId: 1, examDate: 1 });

export default mongoose.model("ExamSubject", examSubjectSchema);
