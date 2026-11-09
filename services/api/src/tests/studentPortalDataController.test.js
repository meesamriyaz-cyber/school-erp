import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  studentFindOne: vi.fn(),
  studentFind: vi.fn(),
  guardianFindOne: vi.fn(),
  relationshipFind: vi.fn(),
  enrollmentFind: vi.fn(),
  attendanceFind: vi.fn(),
  feeInvoiceFind: vi.fn(),
  feePaymentFind: vi.fn(),
  teacherAssignmentFind: vi.fn(),
  timetableEntryFind: vi.fn(),
}));

vi.mock("../models/Student.js", () => ({ default: { findOne: mocks.studentFindOne, find: mocks.studentFind } }));
vi.mock("../models/Guardian.js", () => ({ default: { findOne: mocks.guardianFindOne } }));
vi.mock("../models/StudentGuardian.js", () => ({ default: { find: mocks.relationshipFind } }));
vi.mock("../models/Enrollment.js", () => ({ default: { find: mocks.enrollmentFind } }));
vi.mock("../models/Attendance.js", () => ({ default: { find: mocks.attendanceFind } }));
vi.mock("../models/FeeInvoice.js", () => ({ default: { find: mocks.feeInvoiceFind } }));
vi.mock("../models/FeePayment.js", () => ({ default: { find: mocks.feePaymentFind } }));
vi.mock("../models/TeacherAssignment.js", () => ({ default: { find: mocks.teacherAssignmentFind } }));
vi.mock("../models/TimetableEntry.js", () => ({ default: { find: mocks.timetableEntryFind } }));

import {
  getMyAttendance,
  getMyFees,
  getMyProfile,
  getMyTimetable,
} from "../controllers/studentPortalDataController.js";

const query = (value, methods = []) => {
  const result = { lean: vi.fn().mockResolvedValue(value) };
  for (const method of methods) result[method] = vi.fn().mockReturnValue(result);
  return result;
};

const configureParent = () => {
  mocks.guardianFindOne.mockReturnValue(query({ _id: "guardian-a" }, ["select"]));
  mocks.relationshipFind.mockReturnValue(query([{ studentId: "student-a" }], ["select"]));
  mocks.studentFind.mockReturnValue(query([
    { _id: "student-a", firstName: "Amina", lastName: "Khan" },
  ], ["select", "sort"]));
};

describe("student portal read-only academic data", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenantId: "tenant-a",
      auth: { userId: "parent-a", role: "parent" },
      query: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
    configureParent();
  });

  it("rejects a student ID that is not linked to the authenticated parent", async () => {
    req.query.studentId = "507f1f77bcf86cd799439099";

    await getMyAttendance(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "This student is not linked to your parent account",
    });
    expect(mocks.attendanceFind).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns tenant-scoped attendance and calculates the attendance summary", async () => {
    const records = [
      { _id: "a1", studentId: "student-a", date: new Date("2026-11-01T00:00:00.000Z"), status: "present" },
      { _id: "a2", studentId: "student-a", date: new Date("2026-11-02T00:00:00.000Z"), status: "late" },
      { _id: "a3", studentId: "student-a", date: new Date("2026-11-03T00:00:00.000Z"), status: "absent" },
      { _id: "a4", studentId: "student-a", date: new Date("2026-11-04T00:00:00.000Z"), status: "excused" },
    ];
    mocks.attendanceFind.mockReturnValue(query(records, ["sort", "limit"]));

    await getMyAttendance(req, res, next);

    expect(mocks.attendanceFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
      date: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      summary: {
        present: 1,
        absent: 1,
        late: 1,
        excused: 1,
        marked: 4,
        considered: 3,
        attended: 2,
        percentage: 66.7,
      },
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns fee invoices and receipt history without exposing payment mutation routes", async () => {
    const invoice = {
      _id: "invoice-a",
      studentId: "student-a",
      invoiceNumber: "INV-001",
      totalAmount: 1200,
      paidAmount: 500,
      dueDate: new Date("2026-11-30T00:00:00.000Z"),
    };
    const payment = {
      _id: "receipt-a",
      invoiceId: "invoice-a",
      receiptNumber: "RCP-001",
      amount: 500,
      status: "posted",
    };
    mocks.feeInvoiceFind.mockReturnValue(query([invoice], ["populate", "sort", "limit"]));
    mocks.feePaymentFind.mockReturnValue(query([payment], ["select", "sort"]));

    await getMyFees(req, res, next);

    expect(mocks.feeInvoiceFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
    });
    expect(mocks.feePaymentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      invoiceId: { $in: ["invoice-a"] },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [expect.objectContaining({
        invoiceNumber: "INV-001",
        balance: 700,
        payments: [payment],
      })],
      summary: {
        invoiceCount: 1,
        totalAmount: 1200,
        paidAmount: 500,
        balance: 700,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns the timetable only for the linked child's active enrollment", async () => {
    const enrollment = {
      _id: "enrollment-a",
      studentId: "student-a",
      academicYearId: { _id: "year-a", name: "2026–27" },
      classId: { _id: "class-a", name: "Class 5" },
      sectionId: { _id: "section-a", name: "A" },
    };
    const entry = { _id: "entry-a", dayOfWeek: 1, periodNumber: 1 };
    mocks.enrollmentFind.mockReturnValue(query([enrollment], ["populate", "populate", "populate"]));
    mocks.teacherAssignmentFind.mockReturnValue(query([{ _id: "assignment-a" }], ["select"]));
    mocks.timetableEntryFind.mockReturnValue(query([entry], ["populate", "sort"]));

    await getMyTimetable(req, res, next);

    expect(mocks.enrollmentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
      status: "active",
    });
    expect(mocks.teacherAssignmentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      academicYearId: "year-a",
      classId: "class-a",
      status: "active",
    }));
    expect(mocks.timetableEntryFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      academicYearId: "year-a",
      classId: "class-a",
      assignmentId: { $in: ["assignment-a"] },
      status: "active",
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{
        student: { _id: "student-a", firstName: "Amina", lastName: "Khan" },
        enrollment,
        entries: [entry],
      }],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns profile details and current enrollment for every actively linked child", async () => {
    const profile = {
      _id: "student-a",
      firstName: "Amina",
      lastName: "Khan",
      admissionNumber: "A-01",
      dateOfBirth: new Date("2015-04-12T00:00:00.000Z"),
      gender: "female",
      address: { city: "Srinagar" },
      guardianName: "Parent One",
      guardianRelationship: "mother",
      guardianPhone: "9999999999",
    };
    const enrollment = {
      _id: "enrollment-a",
      studentId: "student-a",
      academicYearId: { _id: "year-a", name: "2026–27" },
      classId: { _id: "class-a", name: "Class 5" },
      sectionId: { _id: "section-a", name: "A" },
    };
    mocks.studentFind.mockReturnValue(query([profile], ["select", "sort"]));
    mocks.enrollmentFind.mockReturnValue(query([enrollment], ["populate", "populate", "populate"]));

    await getMyProfile(req, res, next);

    expect(mocks.relationshipFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      guardianId: "guardian-a",
      status: "active",
      $or: [
        { canAccessPortal: true },
        { isPrimary: true, canAccessPortal: { $exists: false } },
      ],
    }));
    expect(mocks.studentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      _id: { $in: ["student-a"] },
      status: "active",
    }));
    expect(mocks.studentFind.mock.results[0].value.select).toHaveBeenCalledWith(
      expect.stringContaining("dateOfBirth photoUrl address gender admissionDate"),
    );
    expect(mocks.studentFind.mock.results[0].value.select).toHaveBeenCalledWith(
      expect.stringContaining("guardianName guardianRelationship guardianPhone guardianEmail"),
    );
    expect(mocks.enrollmentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
      status: "active",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ student: profile, currentEnrollment: enrollment }],
    });
    expect(next).not.toHaveBeenCalled();
  });


  it("does not expose any academic profile to a secondary guardian without portal permission", async () => {
    mocks.relationshipFind.mockReturnValue(query([], ["select"]));

    await getMyProfile(req, res, next);

    expect(mocks.studentFind).not.toHaveBeenCalled();
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    expect(next).not.toHaveBeenCalled();
  });

  it("does not return a profile when a parent requests an unlinked student", async () => {
    req.query.studentId = "507f1f77bcf86cd799439099";

    await getMyProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "This student is not linked to your parent account",
    });
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns only the authenticated student's own profile", async () => {
    req.auth.role = "student";
    const profile = {
      _id: "student-a",
      firstName: "Amina",
      lastName: "Khan",
      dateOfBirth: new Date("2015-04-12T00:00:00.000Z"),
    };
    mocks.studentFindOne.mockReturnValue(query(profile, ["select"]));
    mocks.enrollmentFind.mockReturnValue(query([], ["populate", "populate", "populate"]));

    await getMyProfile(req, res, next);

    expect(mocks.studentFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "parent-a",
      status: "active",
    });
    expect(mocks.studentFindOne.mock.results[0].value.select).toHaveBeenCalledWith(
      expect.stringContaining("dateOfBirth photoUrl address gender admissionDate"),
    );
    expect(mocks.studentFindOne.mock.results[0].value.select).not.toHaveBeenCalledWith(
      expect.stringContaining("guardianPhone"),
    );
    expect(mocks.guardianFindOne).not.toHaveBeenCalled();
    expect(mocks.relationshipFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ student: profile, currentEnrollment: null }],
    });
    expect(next).not.toHaveBeenCalled();
  });


});
