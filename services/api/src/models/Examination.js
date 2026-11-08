import mongoose from "mongoose";

const examinationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      immutable: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: true,
      immutable: true,
    },
    // A null section means this examination applies to the whole class.
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      default: null,
      immutable: true,
    },
    name: {
      type: String,
      required: [true, "Examination name is required"],
      trim: true,
      maxlength: 100,
    },
    startDate: {
      type: Date,
      required: [true, "Examination start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "Examination end date is required"],
      validate: {
        validator(value) {
          return !this.startDate || value >= this.startDate;
        },
        message: "Examination end date cannot be before its start date",
      },
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "in_progress", "completed", "published"],
      default: "draft",
      required: true,
    },
    curriculumSnapshot: [{
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
      subjectName: { type: String, required: true, trim: true, maxlength: 100 },
      subjectCode: { type: String, trim: true, default: "", maxlength: 20 },
      category: { type: String, enum: ["compulsory", "elective"], required: true },
      weeklyPeriods: { type: Number, min: 0, max: 60, default: 0 },
      sortOrder: { type: Number, min: 0, max: 1000, default: 0 },
    }],
    // Frozen at publication so later school grading-scale changes cannot alter report cards.
    gradingScaleSnapshot: {
      type: new mongoose.Schema({
        gradingScaleId: { type: mongoose.Schema.Types.ObjectId, ref: "GradingScale", required: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        bands: [{
          grade: { type: String, required: true, trim: true, maxlength: 20 },
          minPercentage: { type: Number, required: true, min: 0, max: 100 },
          maxPercentage: { type: Number, required: true, min: 0, max: 100 },
          description: { type: String, trim: true, default: "", maxlength: 120 },
        }],
      }, { _id: false }),
      default: null,
    },
    // A short-lived distributed lease serializes mark writes with result publication.
    resultLockToken: { type: String, default: null, select: false },
    resultLockExpiresAt: { type: Date, default: null, select: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: true, versionKey: false }
);

examinationSchema.index(
  { tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 }, name: "unique_examination_name_per_class_scope" }
);
examinationSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, status: 1, startDate: 1 });
examinationSchema.index({ tenantId: 1, sectionId: 1, status: 1 });

export default mongoose.model("Examination", examinationSchema);
