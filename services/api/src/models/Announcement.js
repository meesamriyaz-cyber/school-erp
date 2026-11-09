import mongoose from "mongoose";

const ANNOUNCEMENT_CATEGORIES = [
  "general", "academic", "examination", "event", "holiday", "urgent",
];
const ANNOUNCEMENT_AUDIENCES = ["SCHOOL", "CLASS", "SECTION"];
const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"];

const auditEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ["created", "updated", "published", "archived"],
    required: true,
  },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorRole: { type: String, required: true, maxlength: 40 },
  changedFields: { type: [String], default: [] },
  changedAt: { type: Date, default: Date.now, required: true },
}, { _id: false });

const announcementSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    immutable: true,
  },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
  category: { type: String, enum: ANNOUNCEMENT_CATEGORIES, default: "general", required: true },
  audienceType: { type: String, enum: ANNOUNCEMENT_AUDIENCES, required: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", default: null, immutable: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null, immutable: true },
  status: { type: String, enum: ANNOUNCEMENT_STATUSES, default: "draft", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  publishedAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  auditTrail: { type: [auditEntrySchema], default: [] },
}, {
  timestamps: true,
  versionKey: false,
  strict: "throw",
});

announcementSchema.pre("validate", function validateAudience(next) {
  if (this.audienceType === "SCHOOL" && (this.classId || this.sectionId)) {
    this.invalidate("classId", "School-wide announcements cannot target a class or section");
  }
  if (this.audienceType === "CLASS" && (!this.classId || this.sectionId)) {
    this.invalidate("classId", "Class announcements require a class and no section");
  }
  if (this.audienceType === "SECTION" && (!this.classId || !this.sectionId)) {
    this.invalidate("sectionId", "Section announcements require both class and section");
  }
  if (this.expiresAt && this.publishedAt && this.expiresAt <= this.publishedAt) {
    this.invalidate("expiresAt", "Expiry must be after publication");
  }
  next();
});

announcementSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });
announcementSchema.index({ tenantId: 1, academicYearId: 1, audienceType: 1, classId: 1, sectionId: 1, status: 1 });
announcementSchema.index({ tenantId: 1, expiresAt: 1, status: 1 });

const Announcement = mongoose.models.Announcement
  || mongoose.model("Announcement", announcementSchema);

export {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUSES,
};
export default Announcement;
