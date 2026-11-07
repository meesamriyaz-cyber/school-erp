import mongoose from "mongoose";

const homeworkSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, immutable: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null, immutable: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true, immutable: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  instructions: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
  assignedDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ["draft", "published"], default: "published", required: true },
}, { timestamps: true, versionKey: false });

homeworkSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, dueDate: 1 });
homeworkSchema.index({ tenantId: 1, teacherId: 1, createdAt: -1 });
export default mongoose.model("Homework", homeworkSchema);
