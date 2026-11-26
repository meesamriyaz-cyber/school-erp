import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, default: "", maxlength: 500 },
  billingInterval: { type: String, enum: ["monthly", "annual", "one_time"], required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true, default: "INR", match: /^[A-Z]{3}$/ },
  annualDiscountPercent: { type: Number, min: 0, max: 100, default: 0 },
  features: { type: [String], default: [] },
  isActive: { type: Boolean, default: true, index: true },
  isArchived: { type: Boolean, default: false, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true, versionKey: false });

subscriptionPlanSchema.index({ name: 1, billingInterval: 1, currency: 1, isArchived: 1 });

export default mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
