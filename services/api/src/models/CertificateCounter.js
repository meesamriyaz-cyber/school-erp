import mongoose from "mongoose";

const certificateCounterSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  year: { type: Number, required: true, min: 2000, max: 9999, immutable: true },
  type: { type: String, enum: ["bonafide", "transfer"], required: true, immutable: true },
  sequence: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

certificateCounterSchema.index({ tenantId: 1, year: 1, type: 1 }, { unique: true, name: "unique_certificate_counter_scope" });

export default mongoose.model("CertificateCounter", certificateCounterSchema);
