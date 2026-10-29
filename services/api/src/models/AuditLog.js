import mongoose from "mongoose";

const AUDIT_ACTIONS = [
  "USER_CREATED",
  "USER_PROFILE_UPDATED",
  "USER_STATUS_CHANGED",
  "USER_ROLE_CHANGED",
];

const auditLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      immutable: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
      maxlength: 40,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetTenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
      index: true,
    },
    changedFields: {
      type: [String],
      default: [],
      validate: {
        validator: (fields) => fields.every((field) =>
          ["firstName", "lastName", "email", "phone", "role", "status"].includes(field)
        ),
        message: "Audit changedFields contains an unsupported field",
      },
    },
    previousValue: {
      type: String,
      default: null,
      maxlength: 80,
    },
    newValue: {
      type: String,
      default: null,
      maxlength: 80,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    strict: "throw",
  },
);

// Audit records are append-only through Mongoose; corrections should be new events.
const immutableAuditOperations = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
];
auditLogSchema.pre(immutableAuditOperations, function rejectAuditMutation() {
  throw new Error("Audit log records are immutable");
});

auditLogSchema.index({ targetUserId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export { AUDIT_ACTIONS };
export default AuditLog;
