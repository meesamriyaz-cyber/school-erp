
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
      enum: ["pending", "active", "suspended", "trial_expired"],
      default: "pending",
      index: true,
    },

    suspensionReason: { type: String, trim: true, maxlength: 500, default: null },
    subscriptionSuspendedAt: { type: Date, default: null, index: true },
    suspensionHistory: [{
      reason: { type: String, required: true, trim: true, maxlength: 500 },
      suspendedAt: { type: Date, required: true },
      suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    }],
    trialStartedAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null, index: true },
    trialExpiredAt: { type: Date, default: null },
    trialHistory: [{
      startedAt: { type: Date, required: true },
      endsAt: { type: Date, required: true },
      startedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    }],

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
