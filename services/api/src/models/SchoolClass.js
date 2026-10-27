import mongoose from "mongoose";

const schoolClassSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "School tenant is required"],
      immutable: true,
    },

    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: [true, "Academic year is required"],
      immutable: true,
    },

    name: {
      type: String,
      required: [true, "Class name is required"],
      trim: true,
      maxlength: 80,
    },

    sortOrder: {
      type: Number,
      min: 0,
      max: 1000,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Class names are unique within a school's academic year, case-insensitively.
schoolClassSchema.index(
  { tenantId: 1, academicYearId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "unique_class_name_per_school_year",
  }
);

schoolClassSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });

const SchoolClass = mongoose.model("SchoolClass", schoolClassSchema);

export default SchoolClass;
