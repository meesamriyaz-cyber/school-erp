import mongoose from "mongoose";

const feePaymentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeInvoice", required: true, immutable: true },
  receiptNumber: { type: String, required: true, trim: true, maxlength: 40 },
  amount: { type: Number, required: true, min: 0.01 },
  paymentDate: { type: Date, required: true, default: Date.now },
  method: { type: String, enum: ["cash", "bank_transfer", "cheque", "upi", "card", "other"], required: true },
  reference: { type: String, trim: true, default: "", maxlength: 100 },
  notes: { type: String, trim: true, default: "", maxlength: 300 },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  status: { type: String, enum: ["posted", "reversed"], default: "posted", required: true },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reversalReason: { type: String, trim: true, default: "", maxlength: 300 },
}, { timestamps: true, versionKey: false });

feePaymentSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
feePaymentSchema.index({ tenantId: 1, invoiceId: 1, paymentDate: -1 });
export default mongoose.model("FeePayment", feePaymentSchema);
