import mongoose from "mongoose";

const schoolSubscriptionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true, index: true },
  planName: { type: String, required: true, trim: true, maxlength: 100 },
  billingInterval: { type: String, enum: ["monthly", "annual", "one_time"], required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
  annualDiscountPercent: { type: Number, min: 0, max: 100, default: 0 },
  status: { type: String, enum: ["pending", "active", "past_due", "cancelled", "expired"], default: "pending", index: true },
  startsAt: { type: Date, required: true },
  currentPeriodStartsAt: { type: Date, required: true },
  currentPeriodEndsAt: { type: Date, default: null },
  nextBillingAt: { type: Date, default: null, index: true },
  cancelledAt: { type: Date, default: null },
  lifetimeAccess: { type: Boolean, default: false, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  notes: { type: String, trim: true, default: "", maxlength: 500 },
}, { timestamps: true, versionKey: false });

schoolSubscriptionSchema.pre("validate", function validateBillingTerm() {
  if (this.billingInterval === "one_time") {
    this.lifetimeAccess = true;
    this.currentPeriodEndsAt = null;
    this.nextBillingAt = null;
    this.cancelledAt = null;
  } else {
    this.lifetimeAccess = false;
    if (this.currentPeriodEndsAt && this.currentPeriodEndsAt <= this.currentPeriodStartsAt) {
      this.invalidate("currentPeriodEndsAt", "Subscription period end must be after its start");
    }
  }
});

schoolSubscriptionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export default mongoose.model("SchoolSubscription", schoolSubscriptionSchema);
