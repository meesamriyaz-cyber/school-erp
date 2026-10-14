
import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "School name is required"],
      trim: true,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: [true, "School slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 80,
      
    match: [
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain lowercase letters, numbers, and single hyphens",
    ],

    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
      index: true,
    },

    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Tenant = mongoose.model("Tenant", tenantSchema);

export default Tenant;
