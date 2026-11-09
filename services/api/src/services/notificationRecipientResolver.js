import Student from "../models/Student.js";
import User from "../models/User.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Enrollment from "../models/Enrollment.js";
import { guardianPortalAccessFilter } from "../utils/guardianPortalAccess.js";

const withSession = (query, session) => session ? query.session(session) : query;

async function resolveRecipientsForStudentIds({ tenantId, studentIds, session = null }) {
  const ids = [...new Set((studentIds || []).map(String))];
  if (!ids.length) return [];
  const students = await withSession(Student.find({
    tenantId, _id: { $in: ids }, status: "active",
  }).select("_id userId").lean(), session);
  const recipients = new Map();
  const studentUsers = students.map((student) => student.userId).filter(Boolean);
  const activeStudentUsers = studentUsers.length ? await withSession(User.find({
    _id: { $in: studentUsers }, tenantId, role: "student", status: "active",
  }).select("_id").lean(), session) : [];
  const activeStudentUserIds = new Set(activeStudentUsers.map((user) => String(user._id)));
  for (const student of students) {
    if (student.userId && activeStudentUserIds.has(String(student.userId))) recipients.set(String(student.userId), {
      recipientUserId: student.userId, recipientRole: "student", relatedStudentIds: [student._id],
    });
  }
  const links = students.length ? await withSession(StudentGuardian.find({
    tenantId, studentId: { $in: students.map((student) => student._id) }, status: "active",
    receivesCommunication: true, ...guardianPortalAccessFilter(),
  }).select("studentId guardianId").lean(), session) : [];
  if (!links.length) return [...recipients.values()];
  const guardianIds = [...new Set(links.map((link) => String(link.guardianId)))];
  const guardians = await withSession(Guardian.find({
    tenantId, _id: { $in: guardianIds }, status: "active", userId: { $ne: null },
  }).select("_id userId").lean(), session);
  const guardianById = new Map(guardians.map((guardian) => [String(guardian._id), guardian]));
  const activeParentUsers = guardians.length ? await withSession(User.find({
    _id: { $in: guardians.map((guardian) => guardian.userId) }, tenantId, role: "parent", status: "active",
  }).select("_id").lean(), session) : [];
  const activeParentIds = new Set(activeParentUsers.map((user) => String(user._id)));
  const studentIdsByParent = new Map();
  for (const link of links) {
    const guardian = guardianById.get(String(link.guardianId));
    if (!guardian || !activeParentIds.has(String(guardian.userId))) continue;
    const key = String(guardian.userId);
    if (!studentIdsByParent.has(key)) studentIdsByParent.set(key, new Set());
    studentIdsByParent.get(key).add(String(link.studentId));
  }
  for (const [userId, relatedIds] of studentIdsByParent) {
    const guardian = guardians.find((item) => String(item.userId) === userId);
    recipients.set(userId, {
      recipientUserId: guardian.userId, recipientRole: "parent",
      relatedStudentIds: [...relatedIds],
    });
  }
  return [...recipients.values()];
}

export async function resolveStudentScopedRecipients({ tenantId, enrollmentIds, session = null }) {
  const ids = [...new Set((enrollmentIds || []).map(String))];
  if (!ids.length) return [];
  const enrollments = await withSession(Enrollment.find({
    tenantId, _id: { $in: ids }, status: "active",
  }).select("studentId").lean(), session);
  return resolveRecipientsForStudentIds({ tenantId, studentIds: enrollments.map((item) => item.studentId), session });
}

export async function resolveAnnouncementRecipients({ tenantId, announcement, session = null }) {
  const enrollmentFilter = {
    tenantId, academicYearId: announcement.academicYearId, status: "active",
    ...(announcement.audienceType === "CLASS" || announcement.audienceType === "SECTION" ? { classId: announcement.classId } : {}),
    ...(announcement.audienceType === "SECTION" ? { sectionId: announcement.sectionId } : {}),
  };
  const enrollments = await withSession(Enrollment.find(enrollmentFilter).select("studentId").lean(), session);
  return resolveRecipientsForStudentIds({ tenantId, studentIds: enrollments.map((item) => item.studentId), session });
}
