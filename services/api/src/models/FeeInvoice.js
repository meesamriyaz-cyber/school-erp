import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  amount: { type: Number, required: true, min: 0 },
  frequency: { type: String, enum: ["one_time", "monthly", "quarterly", "half_yearly", "annually"], default: "annually" },
}, { _id: false });

const feeInvoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeStructure", required: true, immutable: true },
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 40 },
  items: { type: [invoiceItemSchema], required: true },
  totalAmount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid", required: true },
}, { timestamps: true, versionKey: false });

feeInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
feeInvoiceSchema.index({ tenantId: 1, enrollmentId: 1, academicYearId: 1 });
export default mongoose.model("FeeInvoice", feeInvoiceSchema);
