import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "School tenant is required"],
      immutable: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: [true, "Class is required"],
      immutable: true,
    },

    name: {
      type: String,
      required: [true, "Section name is required"],
      trim: true,
      maxlength: 50,
    },

    capacity: {
      type: Number,
      default: null,
      min: 1,
      max: 500,
    },
    // Incremented inside enrollment-capacity transactions to serialize concurrent placements.
    capacityRevision: {
      type: Number,
      default: 0,
      select: false,
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

// Section names are unique within a class, case-insensitively.
sectionSchema.index(
  { tenantId: 1, classId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "unique_section_name_per_class",
  }
);

sectionSchema.index({ tenantId: 1, classId: 1, status: 1 });

const Section = mongoose.model("Section", sectionSchema);

export default Section;
