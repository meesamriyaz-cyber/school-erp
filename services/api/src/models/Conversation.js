import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
  guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", required: true, immutable: true },
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  teacherAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "TeacherAssignment", required: true, immutable: true },
  status: { type: String, enum: ["open", "closed"], default: "open", required: true },
  lastMessageAt: { type: Date, default: null },
  lastMessagePreview: { type: String, default: "", maxlength: 180 },
  parentUnreadCount: { type: Number, default: 0, min: 0 },
  teacherUnreadCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  closedAt: { type: Date, default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, versionKey: false });

conversationSchema.index(
  { tenantId: 1, studentId: 1, guardianId: 1, teacherUserId: 1 },
  { unique: true, name: "unique_student_guardian_teacher_conversation" },
);
conversationSchema.index({ tenantId: 1, parentUserId: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ tenantId: 1, teacherUserId: 1, status: 1, lastMessageAt: -1 });

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
export default Conversation;
