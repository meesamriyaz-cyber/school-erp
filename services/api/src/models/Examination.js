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
