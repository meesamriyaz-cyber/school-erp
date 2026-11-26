import mongoose from "mongoose";

const platformInvoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 200 },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  unitAmount: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const platformInvoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolSubscription", default: null, index: true },
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 40 },
  items: { type: [platformInvoiceItemSchema], required: true, validate: value => value.length > 0 },
  subtotal: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
  issuedAt: { type: Date, required: true, default: Date.now },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ["draft", "issued", "partially_paid", "paid", "void", "overdue"], default: "issued", index: true },
  notes: { type: String, trim: true, default: "", maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true, versionKey: false });

platformInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
platformInvoiceSchema.index({ status: 1, dueAt: 1 });

export default mongoose.model("PlatformInvoice", platformInvoiceSchema);
