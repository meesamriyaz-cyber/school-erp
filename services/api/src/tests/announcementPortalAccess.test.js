import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  studentFindOne: vi.fn(), guardianFindOne: vi.fn(), relationshipFind: vi.fn(),
  enrollmentFind: vi.fn(), announcementFind: vi.fn(),
}));
vi.mock("../models/Student.js", () => ({ default: { findOne: mocks.studentFindOne } }));
vi.mock("../models/Guardian.js", () => ({ default: { findOne: mocks.guardianFindOne } }));
vi.mock("../models/StudentGuardian.js", () => ({ default: { find: mocks.relationshipFind } }));
vi.mock("../models/Enrollment.js", () => ({ default: { find: mocks.enrollmentFind } }));
vi.mock("../models/Announcement.js", () => ({ default: { find: mocks.announcementFind } }));
vi.mock("../models/AcademicYear.js", () => ({ default: {} }));
vi.mock("../models/SchoolClass.js", () => ({ default: {} }));
vi.mock("../models/Section.js", () => ({ default: {} }));
vi.mock("../models/TeacherAssignment.js", () => ({ default: {} }));

import { getPortalAnnouncements } from "../controllers/announcementController.js";

const query = (value, methods = []) => {
  const chain = { lean: vi.fn().mockResolvedValue(value) };
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain);
  return chain;
};

describe("announcement portal audience access", () => {
  let req;
  let res;
  let next;
  const studentId = "student-a";
  const enrollment = {
    studentId, academicYearId: "year-a", classId: "class-a", sectionId: "section-a",
  };
  const notices = [{ _id: "notice-a", title: "Class notice" }];

  beforeEach(() => {
    vi.clearAllMocks();
    req = { tenantId: "tenant-a", auth: { userId: "student-user", role: "student" } };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
    mocks.studentFindOne.mockReturnValue(query({ _id: studentId }, ["select"]));
    mocks.guardianFindOne.mockReturnValue(query({ _id: "guardian-a" }, ["select"]));
    mocks.relationshipFind.mockReturnValue(query([{ studentId }], ["select"]));
    mocks.enrollmentFind.mockReturnValue(query([enrollment], ["select"]));
    mocks.announcementFind.mockReturnValue(query(notices, ["select", "sort", "limit"]));
  });

  it("resolves student notices only through the authenticated student's active enrollment and tenant", async () => {
    await getPortalAnnouncements(req, res, next);

    expect(mocks.studentFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a", userId: "student-user", status: "active",
    });
    expect(mocks.enrollmentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a", studentId: { $in: [studentId] }, status: "active",
    });
    expect(mocks.announcementFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      status: "published",
      publishedAt: { $lte: expect.any(Date) },
      $and: expect.arrayContaining([
        { $or: [
          { academicYearId: "year-a", $or: [
            { audienceType: "SCHOOL" },
            { audienceType: "CLASS", classId: "class-a" },
            { audienceType: "SECTION", classId: "class-a", sectionId: "section-a" },
          ] },
        ] },
      ]),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: notices });
    expect(next).not.toHaveBeenCalled();
  });

  it("requires guardian communication and portal access permissions before resolving parent notices", async () => {
    req.auth = { userId: "parent-user", role: "parent" };
    await getPortalAnnouncements(req, res, next);

    expect(mocks.guardianFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a", userId: "parent-user", status: "active",
    });
    expect(mocks.relationshipFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      guardianId: "guardian-a",
      status: "active",
      receivesCommunication: true,
      $or: [
        { canAccessPortal: true },
        { isPrimary: true, canAccessPortal: { $exists: false } },
      ],
    });
    expect(mocks.enrollmentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", studentId: { $in: [studentId] }, status: "active",
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns no notices when the parent has no authorized communication links", async () => {
    req.auth = { userId: "parent-user", role: "parent" };
    mocks.relationshipFind.mockReturnValue(query([], ["select"]));
    await getPortalAnnouncements(req, res, next);

    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(mocks.announcementFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it("does not return announcements for a student without an active profile", async () => {
    mocks.studentFindOne.mockReturnValue(query(null, ["select"]));
    await getPortalAnnouncements(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(mocks.announcementFind).not.toHaveBeenCalled();
  });

  it("forwards unexpected persistence errors", async () => {
    const error = new Error("database unavailable");
    mocks.studentFindOne.mockImplementation(() => { throw error; });
    await getPortalAnnouncements(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
