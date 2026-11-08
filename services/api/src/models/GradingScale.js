import mongoose from "mongoose";

const gradingBandSchema = new mongoose.Schema(
  {
    grade: {
      type: String,
      required: [true, "Grade label is required"],
      trim: true,
      maxlength: 20,
    },
    minPercentage: {
      type: Number,
      required: [true, "Minimum percentage is required"],
      min: [0, "Minimum percentage cannot be below zero"],
      max: [100, "Minimum percentage cannot exceed 100"],
    },
    maxPercentage: {
      type: Number,
      required: [true, "Maximum percentage is required"],
      min: [0, "Maximum percentage cannot be below zero"],
      max: [100, "Maximum percentage cannot exceed 100"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
  },
  { _id: false }
);

const gradingScaleSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    name: {
      type: String,
      required: [true, "Grading scale name is required"],
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 300,
    },
    bands: {
      type: [gradingBandSchema],
      required: true,
      validate: {
        validator(bands) {
          return Array.isArray(bands) && bands.length > 0;
        },
        message: "At least one grading band is required",
      },
    },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

gradingScaleSchema.pre("validate", function validateGradingBands() {
  if (!Array.isArray(this.bands) || this.bands.length === 0) return;

  const normalizedGrades = this.bands.map((band) => band.grade?.trim().toLocaleLowerCase());
  if (normalizedGrades.some((grade) => !grade) ||
      new Set(normalizedGrades).size !== normalizedGrades.length) {
    this.invalidate("bands", "Grade labels must be present and unique within a grading scale");
  }

  const orderedBands = [...this.bands].sort((a, b) => a.minPercentage - b.minPercentage);
  if (orderedBands.some((band) =>
    !Number.isFinite(band.minPercentage) ||
    !Number.isFinite(band.maxPercentage) ||
    band.minPercentage >= band.maxPercentage
  )) {
    this.invalidate("bands", "Each grading band must have a minimum percentage below its maximum");
    return;
  }

  if (orderedBands[0].minPercentage !== 0 ||
      orderedBands[orderedBands.length - 1].maxPercentage !== 100) {
    this.invalidate("bands", "Grading bands must cover the complete range from 0 to 100");
  }

  for (let index = 1; index < orderedBands.length; index += 1) {
    if (orderedBands[index].minPercentage !== orderedBands[index - 1].maxPercentage) {
      this.invalidate("bands", "Grading bands must be contiguous without overlaps or gaps");
      break;
    }
  }
});

// Percentage ranges are [minimum, maximum), except that the final band includes 100.
gradingScaleSchema.index(
  { tenantId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "unique_grading_scale_name_per_tenant",
  }
);
gradingScaleSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
    name: "one_active_grading_scale_per_tenant",
  }
);
gradingScaleSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });

export default mongoose.model("GradingScale", gradingScaleSchema);
