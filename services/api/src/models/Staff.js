import mongoose from "mongoose";

const staffSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  employeeCode: { type: String, trim: true, uppercase: true, maxlength: 30, default: null },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, trim: true, maxlength: 80, default: "" },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
  phone: { type: String, trim: true, maxlength: 20, default: null },
  employeeType: { type: String, enum: ["teaching", "non_teaching"], required: true },
  designation: { type: String, required: true, trim: true, maxlength: 100 },
  department: { type: String, trim: true, maxlength: 100, default: null },
  employmentType: { type: String, enum: ["full_time", "part_time", "contractual", "temporary"], required: true },
  joiningDate: { type: Date, required: true },
  qualification: { type: String, trim: true, maxlength: 500, default: null },
  experienceYears: { type: Number, min: 0, max: 60, default: 0 },
  employmentStatus: { type: String, enum: ["active", "on_leave", "suspended", "separated"], default: "active", required: true },
  separationDate: { type: Date, default: null },
  auditTrail: {
    type: [{
      action: { type: String, enum: ["created", "profile_updated", "status_changed"], required: true },
      actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      changedFields: { type: [String], default: [] },
      previousStatus: { type: String, default: null },
      newStatus: { type: String, default: null },
      changedAt: { type: Date, default: Date.now },
    }],
    default: [],
    select: false,
  },
}, { timestamps: true, versionKey: false });

staffSchema.index({ tenantId: 1, employeeCode: 1 }, {
  unique: true,
  partialFilterExpression: { employeeCode: { $type: "string" } },
  name: "unique_staff_employee_code_per_school",
});
staffSchema.index({ tenantId: 1, userId: 1 }, {
  unique: true,
  partialFilterExpression: { userId: { $type: "objectId" } },
  name: "unique_staff_user_link_per_school",
});
staffSchema.index({ tenantId: 1, employeeType: 1, employmentStatus: 1, firstName: 1, lastName: 1 });

export default mongoose.models.Staff || mongoose.model("Staff", staffSchema);
