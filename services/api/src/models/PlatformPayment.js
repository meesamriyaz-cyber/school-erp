import mongoose from "mongoose";

const platformPaymentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformInvoice", required: true, immutable: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
  paymentDate: { type: Date, required: true, default: Date.now },
  method: { type: String, enum: ["bank_transfer", "upi", "card", "cash", "cheque", "other"], required: true },
  reference: { type: String, trim: true, default: "", maxlength: 120 },
  status: { type: String, enum: ["recorded", "reversed"], default: "recorded", index: true },
  notes: { type: String, trim: true, default: "", maxlength: 500 },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reversalReason: { type: String, trim: true, default: "", maxlength: 300 },
}, { timestamps: true, versionKey: false });

platformPaymentSchema.index({ tenantId: 1, paymentDate: -1 });
platformPaymentSchema.index({ invoiceId: 1, status: 1, paymentDate: -1 });

export default mongoose.model("PlatformPayment", platformPaymentSchema);
