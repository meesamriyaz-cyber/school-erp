import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, immutable: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  senderRole: { type: String, enum: ["parent", "teacher"], required: true, immutable: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000, immutable: true },
  readAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false, strict: "throw" });

messageSchema.index({ tenantId: 1, conversationId: 1, createdAt: 1, _id: 1 });
messageSchema.index({ tenantId: 1, conversationId: 1, readAt: 1 });

const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
export default Message;
