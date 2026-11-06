import mongoose from "mongoose";

const guardianSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
    },
    // Explicitly linked by a school administrator to a parent login account.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, default: "", trim: true, maxlength: 80 },
    phone: { type: String, default: null, trim: true, maxlength: 20 },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

guardianSchema.index({ tenantId: 1, phone: 1 });
guardianSchema.index({ tenantId: 1, email: 1 });
guardianSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);

const Guardian =
  mongoose.models.Guardian || mongoose.model("Guardian", guardianSchema);

export default Guardian;
