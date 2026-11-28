import mongoose from "mongoose";

const platformCommercialEventSchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, immutable: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolSubscription", default: null, immutable: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformInvoice", default: null, immutable: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformPayment", default: null, immutable: true },
  action: { type: String, enum: ["PLAN_CREATED", "PLAN_UPDATED", "PLAN_ARCHIVED", "SUBSCRIPTION_ASSIGNED", "SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_RENEWED", "PAYMENT_RECORDED", "PAYMENT_REVERSED", "RENEWAL_INVOICED", "TRIAL_STARTED", "SUBSCRIPTION_GRACE_EXPIRED"], required: true, immutable: true, index: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: "throw" });

platformCommercialEventSchema.pre("save", function rejectMutation() {
  if (!this.isNew && this.isModified()) throw new Error("Commercial audit events are immutable");
});
platformCommercialEventSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"], function rejectQueryMutation() {
  throw new Error("Commercial audit events are immutable");
});
platformCommercialEventSchema.pre("bulkWrite", function rejectBulkMutation() {
  throw new Error("Commercial audit events are immutable");
});

export default mongoose.model("PlatformCommercialEvent", platformCommercialEventSchema);
