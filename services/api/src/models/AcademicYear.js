
import mongoose from "mongoose";

const academicYearSchema = new mongoose.Schema(
  {
    // Always assigned by the server from the authenticated school.
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "School tenant is required"],
      immutable: true,
    },

    name: {
      type: String,
      required: [true, "Academic year name is required"],
      trim: true,
      maxlength: 30,
    },

    startDate: {
      type: Date,
      required: [true, "Academic year start date is required"],
    },

    endDate: {
      type: Date,
      required: [true, "Academic year end date is required"],
      validate: {
        validator(value) {
          if (!value || !this.startDate) return true;
          return value > this.startDate;
        },
        message: "Academic year end date must be after its start date",
      },
    },

    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// A school cannot have duplicate academic-year names.
academicYearSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true }
);

// At most one active academic year per school.
academicYearSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
    name: "one_active_academic_year_per_school",
  }
);

// Useful for retrieving a school's academic years by lifecycle status.
academicYearSchema.index({ tenantId: 1, status: 1 });

const AcademicYear = mongoose.model(
  "AcademicYear",
  academicYearSchema
);

export default AcademicYear;
