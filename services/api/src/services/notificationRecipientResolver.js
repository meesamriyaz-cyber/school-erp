import Student from "../models/Student.js";
import User from "../models/User.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Enrollment from "../models/Enrollment.js";
import { guardianPortalAccessFilter } from "../utils/guardianPortalAccess.js";

const withSession = (query, session) => session ? query.session(session) : query;

export async function resolveAnnouncementRecipients({ tenantId, announcement, session = null }) {
  const enrollmentFilter = {
    tenantId,
    academicYearId: announcement.academicYearId,
    status: "active",
    ...(announcement.audienceType === "CLASS" || announcement.audienceType === "SECTION"
      ? { classId: announcement.classId } : {}),
    ...(announcement.audienceType === "SECTION" ? { sectionId: announcement.sectionId } : {}),
  };
  const enrollments = await withSession(
    Enrollment.find(enrollmentFilter).select("studentId").lean(), session,
  );
  const studentIds = [...new Set(enrollments.map((item) => String(item.studentId)))];
  if (!studentIds.length) return [];

  const students = await withSession(
    Student.find({
      tenantId, _id: { $in: studentIds }, status: "active",
      userId: { $ne: null },
    }).select("_id userId").lean(), session,
  );
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const studentUsers = students.map((student) => student.userId).filter(Boolean);
  const activeStudentUsers = studentUsers.length
    ? await withSession(User.find({
      _id: { $in: studentUsers }, tenantId, role: "student", status: "active",
    }).select("_id").lean(), session)
    : [];
  const recipients = new Map();
  const activeStudentUserIds = new Set(activeStudentUsers.map((user) => String(user._id)));

  for (const student of students) {
    if (!activeStudentUserIds.has(String(student.userId))) continue;
    recipients.set(String(student.userId), {
      recipientUserId: student.userId,
      recipientRole: "student",
      relatedStudentIds: [student._id],
    });
  }

  const links = await withSession(
    StudentGuardian.find({
      tenantId,
      studentId: { $in: studentIds },
      status: "active",
      receivesCommunication: true,
      ...guardianPortalAccessFilter(),
    }).select("studentId guardianId").lean(), session,
  );
  const activeStudentIds = new Set(students.map((student) => String(student._id)));
  const eligibleLinks = links.filter((link) => activeStudentIds.has(String(link.studentId)));
  if (!eligibleLinks.length) return [...recipients.values()];

  const guardianIds = [...new Set(eligibleLinks.map((link) => String(link.guardianId)))];
  const guardians = await withSession(
    Guardian.find({
      tenantId, _id: { $in: guardianIds }, status: "active",
      userId: { $ne: null },
    }).select("_id userId").lean(), session,
  );
  const guardianById = new Map(guardians.map((guardian) => [String(guardian._id), guardian]));
  const guardianUsers = guardians.map((guardian) => guardian.userId).filter(Boolean);
  const activeParentUsers = guardianUsers.length
    ? await withSession(User.find({
      _id: { $in: guardianUsers }, tenantId, role: "parent", status: "active",
    }).select("_id").lean(), session)
    : [];
  const activeParentUserIds = new Set(activeParentUsers.map((user) => String(user._id)));
  const studentIdsByParent = new Map();

  for (const link of eligibleLinks) {
    const guardian = guardianById.get(String(link.guardianId));
    if (!guardian || !activeParentUserIds.has(String(guardian.userId))) continue;
    const key = String(guardian.userId);
    if (!studentIdsByParent.has(key)) studentIdsByParent.set(key, new Set());
    studentIdsByParent.get(key).add(String(link.studentId));
  }

  for (const [userId, relatedIds] of studentIdsByParent) {
    const guardian = guardians.find((item) => String(item.userId) === userId);
    const existing = recipients.get(userId);
    recipients.set(userId, {
      recipientUserId: guardian.userId,
      recipientRole: "parent",
      relatedStudentIds: [...new Set([...(existing?.relatedStudentIds || []), ...relatedIds])]
        .filter((id) => studentById.has(id)),
    });
  }

  return [...recipients.values()];
}
