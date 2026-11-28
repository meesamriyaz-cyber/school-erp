import mongoose from "mongoose";

const academicTermSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ["draft", "active", "completed", "cancelled"], default: "draft", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

academicTermSchema.pre("validate", function validateTermRange() {
  if (this.startDate && this.endDate && this.endDate < this.startDate) this.invalidate("endDate", "Term end date cannot be before its start date");
});
academicTermSchema.index({ tenantId: 1, academicYearId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 }, name: "unique_term_name_per_year" });
academicTermSchema.index({ tenantId: 1, academicYearId: 1, startDate: 1, endDate: 1 });
academicTermSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });
academicTermSchema.index({ tenantId: 1, academicYearId: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_term_per_year" });

export default mongoose.model("AcademicTerm", academicTermSchema);
