import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "School tenant is required"],
      immutable: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student is required"],
      immutable: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: [true, "Academic year is required"],
      immutable: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: [true, "Class is required"],
      immutable: true,
    },
    // Optional for schools that organize classes without sections.
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      default: null,
      immutable: true,
    },
    enrollmentDate: {
      type: Date,
      required: [true, "Enrollment date is required"],
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "completed", "transferred", "withdrawn"],
      default: "active",
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  { timestamps: true, versionKey: false }
);

// A student has at most one current placement in a school. Historical
// enrollments remain available after completion, transfer, or withdrawal.
enrollmentSchema.index(
  { tenantId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
    name: "one_active_enrollment_per_student",
  }
);
enrollmentSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });
enrollmentSchema.index({ tenantId: 1, classId: 1, sectionId: 1, status: 1 });
enrollmentSchema.index({ tenantId: 1, studentId: 1, enrollmentDate: -1 });

const Enrollment = mongoose.model("Enrollment", enrollmentSchema);
export default Enrollment;
