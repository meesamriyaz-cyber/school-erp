import TeacherAssignment from "../models/TeacherAssignment.js";

export const getTeacherEnrollmentScope = async (req) => {
  const assignments = await TeacherAssignment.find({
    tenantId: req.tenantId, teacherId: req.auth.userId, status: "active",
  }).select("academicYearId classId sectionId").lean();
  return assignments.map((item) => ({
    academicYearId: item.academicYearId,
    classId: item.classId,
    ...(item.sectionId ? { sectionId: item.sectionId } : {}),
  }));
};

export const teacherCanAccessEnrollment = async (req, enrollment) => {
  if (req.auth?.role !== "teacher") return true;
  return Boolean(await TeacherAssignment.exists({
    tenantId: req.tenantId, teacherId: req.auth.userId,
    academicYearId: enrollment.academicYearId, classId: enrollment.classId,
    status: "active",
    ...(enrollment.sectionId
      ? { $or: [{ sectionId: null }, { sectionId: enrollment.sectionId }] }
      : { sectionId: null }),
  }));
};
