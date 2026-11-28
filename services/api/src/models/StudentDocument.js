import mongoose from "mongoose";

const studentDocumentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, enum: ["birth_certificate", "identity_proof", "address_proof", "previous_school", "transfer_certificate", "medical", "photograph", "other"], required: true },
  fileUrl: { type: String, required: true, maxlength: 2048 },
  publicId: { type: String, required: true, maxlength: 255 },
  resourceType: { type: String, enum: ["image", "raw"], required: true },
  format: { type: String, required: true, maxlength: 20 },
  bytes: { type: Number, required: true, min: 1, max: 10485760 },
  notes: { type: String, trim: true, default: "", maxlength: 500 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true, versionKey: false });

studentDocumentSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });
export default mongoose.model("StudentDocument", studentDocumentSchema);
