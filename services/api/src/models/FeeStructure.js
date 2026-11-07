import mongoose from "mongoose";

const feeItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  amount: { type: Number, required: true, min: 0 },
  frequency: { type: String, enum: ["one_time", "monthly", "quarterly", "half_yearly", "annually"], default: "annually" },
}, { _id: true });

const feeStructureSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  items: { type: [feeItemSchema], validate: [(items) => items.length > 0, "At least one fee head is required"] },
  status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
}, { timestamps: true, versionKey: false });

feeStructureSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, status: 1 });
feeStructureSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, name: 1 }, { unique: true });
export default mongoose.model("FeeStructure", feeStructureSchema);
