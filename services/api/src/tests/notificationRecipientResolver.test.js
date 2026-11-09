import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrollmentFind: vi.fn(), studentFind: vi.fn(), studentGuardianFind: vi.fn(),
  guardianFind: vi.fn(), userFind: vi.fn(),
}));
vi.mock("../models/Enrollment.js", () => ({ default: { find: mocks.enrollmentFind } }));
vi.mock("../models/Student.js", () => ({ default: { find: mocks.studentFind } }));
vi.mock("../models/StudentGuardian.js", () => ({ default: { find: mocks.studentGuardianFind } }));
vi.mock("../models/Guardian.js", () => ({ default: { find: mocks.guardianFind } }));
vi.mock("../models/User.js", () => ({ default: { find: mocks.userFind } }));

import { resolveAnnouncementRecipients } from "../services/notificationRecipientResolver.js";

const query = (value) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const studentA = "aaaaaaaaaaaaaaaaaaaaaaaa";
const studentB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const studentUserA = "111111111111111111111111";
const studentUserB = "222222222222222222222222";
const parentUser = "333333333333333333333333";
const guardianId = "444444444444444444444444";

describe("notification recipient resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrollmentFind.mockReturnValue(query([{ studentId: studentA }, { studentId: studentB }, { studentId: studentA }]));
    mocks.studentFind.mockReturnValue(query([
      { _id: studentA, userId: studentUserA },
      { _id: studentB, userId: studentUserB },
    ]));
    mocks.studentGuardianFind.mockReturnValue(query([
      { studentId: studentA, guardianId },
      { studentId: studentB, guardianId },
    ]));
    mocks.guardianFind.mockReturnValue(query([{ _id: guardianId, userId: parentUser }]));
    mocks.userFind.mockImplementation((filter) => query(
      filter.role === "student"
        ? [{ _id: studentUserA }, { _id: studentUserB }]
        : [{ _id: parentUser }],
    ));
  });

  it("resolves active student and parent users once per recipient for a school notice", async () => {
    const recipients = await resolveAnnouncementRecipients({
      tenantId: "555555555555555555555555",
      announcement: {
        _id: "666666666666666666666666",
        audienceType: "SCHOOL",
        academicYearId: "777777777777777777777777",
      },
    });

    expect(mocks.enrollmentFind).toHaveBeenCalledWith({
      tenantId: "555555555555555555555555",
      academicYearId: "777777777777777777777777",
      status: "active",
    });
    expect(mocks.studentGuardianFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "555555555555555555555555",
      studentId: { $in: [studentA, studentB] },
      status: "active",
      receivesCommunication: true,
      $or: [
        { canAccessPortal: true },
        { isPrimary: true, canAccessPortal: { $exists: false } },
      ],
    }));
    expect(recipients).toEqual(expect.arrayContaining([
      { recipientUserId: studentUserA, recipientRole: "student", relatedStudentIds: [studentA] },
      { recipientUserId: studentUserB, recipientRole: "student", relatedStudentIds: [studentB] },
      { recipientUserId: parentUser, recipientRole: "parent", relatedStudentIds: [studentA, studentB] },
    ]));
    expect(recipients).toHaveLength(3);
  });

  it("restricts class and section audiences to the matching active enrollment", async () => {
    mocks.enrollmentFind.mockReturnValue(query([{ studentId: studentA }]));
    mocks.studentFind.mockReturnValue(query([{ _id: studentA, userId: studentUserA }]));
    mocks.studentGuardianFind.mockReturnValue(query([]));

    await resolveAnnouncementRecipients({
      tenantId: "555555555555555555555555",
      announcement: {
        _id: "666666666666666666666666",
        audienceType: "SECTION",
        academicYearId: "777777777777777777777777",
        classId: "888888888888888888888888",
        sectionId: "999999999999999999999999",
      },
    });

    expect(mocks.enrollmentFind).toHaveBeenCalledWith({
      tenantId: "555555555555555555555555",
      academicYearId: "777777777777777777777777",
      status: "active",
      classId: "888888888888888888888888",
      sectionId: "999999999999999999999999",
    });
  });

  it("does not create recipients when there are no active enrollments", async () => {
    mocks.enrollmentFind.mockReturnValue(query([]));
    const recipients = await resolveAnnouncementRecipients({
      tenantId: "555555555555555555555555",
      announcement: { audienceType: "SCHOOL", academicYearId: "777777777777777777777777" },
    });
    expect(recipients).toEqual([]);
    expect(mocks.studentFind).not.toHaveBeenCalled();
    expect(mocks.studentGuardianFind).not.toHaveBeenCalled();
  });
  it("does not notify guardians for a student profile that is no longer active", async () => {
    mocks.studentFind.mockReturnValue(query([]));
    mocks.studentGuardianFind.mockReturnValue(query([{ studentId: studentA, guardianId }]));
    const recipients = await resolveAnnouncementRecipients({
      tenantId: "555555555555555555555555",
      announcement: { audienceType: "SCHOOL", academicYearId: "777777777777777777777777" },
    });
    expect(recipients).toEqual([]);
    expect(mocks.guardianFind).not.toHaveBeenCalled();
  });

  it("still resolves authorized parents when students do not have separate portal logins", async () => {
    mocks.studentFind.mockReturnValue(query([{ _id: studentA, userId: null }]));
    mocks.studentGuardianFind.mockReturnValue(query([{ studentId: studentA, guardianId }]));
    mocks.userFind.mockImplementation((filter) => query(
      filter.role === "student" ? [] : [{ _id: parentUser }],
    ));
    const recipients = await resolveAnnouncementRecipients({
      tenantId: "555555555555555555555555",
      announcement: { audienceType: "SCHOOL", academicYearId: "777777777777777777777777" },
    });
    expect(recipients).toEqual([{
      recipientUserId: parentUser,
      recipientRole: "parent",
      relatedStudentIds: [studentA],
    }]);
  });

});
