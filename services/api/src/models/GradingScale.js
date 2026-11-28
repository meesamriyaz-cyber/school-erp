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
          if (!Array.isArray(bands) || bands.length === 0) return false;

          const normalizedGrades = bands.map((band) =>
            band.grade?.trim().toLocaleLowerCase()
          );
          if (
            normalizedGrades.some((grade) => !grade) ||
            new Set(normalizedGrades).size !== normalizedGrades.length
          ) return false;

          const orderedBands = [...bands].sort(
            (a, b) => a.minPercentage - b.minPercentage
          );
          if (orderedBands.some((band) =>
            !Number.isFinite(band.minPercentage) ||
            !Number.isFinite(band.maxPercentage) ||
            band.minPercentage < 0 ||
            band.maxPercentage > 100 ||
            band.minPercentage >= band.maxPercentage
          )) return false;

          if (
            orderedBands[0].minPercentage !== 0 ||
            orderedBands[orderedBands.length - 1].maxPercentage !== 100
          ) return false;

          return orderedBands.every((band, index) =>
            index === 0 ||
            band.minPercentage === orderedBands[index - 1].maxPercentage
          );
        },
        message: "Grading bands must have unique labels and cover 0 to 100 without gaps, overlaps, or invalid bounds",
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
