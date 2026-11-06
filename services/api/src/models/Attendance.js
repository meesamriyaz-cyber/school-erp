import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, immutable: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null, immutable: true },
    date: { type: Date, required: true, immutable: true },
    status: { type: String, enum: ["present", "absent", "late", "excused"], required: true },
    remarks: { type: String, trim: true, default: "", maxlength: 300 },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

attendanceSchema.index(
  { tenantId: 1, studentId: 1, date: 1 },
  { unique: true, name: "one_attendance_record_per_student_per_day" }
);
attendanceSchema.index({ tenantId: 1, classId: 1, sectionId: 1, date: 1 });
attendanceSchema.index({ tenantId: 1, academicYearId: 1, date: -1 });

export default mongoose.model("Attendance", attendanceSchema);
