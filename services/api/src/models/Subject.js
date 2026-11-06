import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "School tenant is required"],
      immutable: true,
    },
    name: {
      type: String,
      required: [true, "Subject name is required"],
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      maxlength: 20,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    category: {
      type: String,
      enum: ["core", "elective"],
      default: "core",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

subjectSchema.index(
  { tenantId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "unique_subject_name_per_school",
  }
);
subjectSchema.index(
  { tenantId: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $type: "string", $gt: "" } },
    name: "unique_subject_code_per_school",
  }
);
subjectSchema.index({ tenantId: 1, status: 1, category: 1 });

export default mongoose.model("Subject", subjectSchema);
