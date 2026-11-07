import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import Enrollment from "../models/Enrollment.js";

const linkedStudentFields = "_id admissionNumber firstName lastName status";

const getStudentChildren = async (req) => {
  if (req.auth.role === "student") {
    const student = await Student.findOne({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      status: "active",
    })
      .select(linkedStudentFields)
      .lean();

    if (!student) {
      return { error: { status: 409, message: "Your student account has not been linked by the school" } };
    }

    return {
      children: [{ student, relationship: null, isPrimary: false }],
    };
  }

  const guardian = await Guardian.findOne({
    tenantId: req.tenantId,
    userId: req.auth.userId,
    status: "active",
  })
    .select("_id")
    .lean();

  if (!guardian) {
    return { error: { status: 409, message: "Your parent account has not been linked by the school" } };
  }

  const links = await StudentGuardian.find({
    tenantId: req.tenantId,
    guardianId: guardian._id,
    status: "active",
  })
    .select("studentId relationship isPrimary")
    .lean();

  if (!links.length) return { children: [] };

  const students = await Student.find({
    tenantId: req.tenantId,
    _id: { $in: links.map((link) => link.studentId) },
    status: "active",
  })
    .select(linkedStudentFields)
    .sort({ firstName: 1, lastName: 1, _id: 1 })
    .lean();

  const linkByStudentId = new Map(
    links.map((link) => [String(link.studentId), link]),
  );

  return {
    children: students.map((student) => {
      const link = linkByStudentId.get(String(student._id));
      return {
        student,
        relationship: link?.relationship ?? null,
        isPrimary: Boolean(link?.isPrimary),
      };
    }),
  };
};

/**
 * Returns the authenticated student's own record or every active child linked
 * to the authenticated parent. All identity and relationship lookups are
 * constrained to the active tenant supplied by requireActiveTenant.
 */
export const getMyChildren = async (req, res, next) => {
  try {
    const result = await getStudentChildren(req);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message,
      });
    }

    const studentIds = result.children.map((item) => item.student._id);
    const enrollments = studentIds.length
      ? await Enrollment.find({
          tenantId: req.tenantId,
          studentId: { $in: studentIds },
          status: "active",
        })
          .populate("academicYearId", "name startDate endDate")
          .populate("classId", "name")
          .populate("sectionId", "name")
          .lean()
      : [];

    const enrollmentByStudentId = new Map(
      enrollments.map((enrollment) => [
        String(enrollment.studentId),
        enrollment,
      ]),
    );

    const data = result.children.map((item) => ({
      ...item,
      currentEnrollment: enrollmentByStudentId.get(String(item.student._id)) ?? null,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};
