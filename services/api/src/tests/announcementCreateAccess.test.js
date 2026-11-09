import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  academicYearFindOne: vi.fn(), classFindOne: vi.fn(), sectionFindOne: vi.fn(),
  assignmentExists: vi.fn(), announcementCreate: vi.fn(),
}));
vi.mock("../models/Announcement.js", () => ({ default: { create: mocks.announcementCreate } }));
vi.mock("../models/AcademicYear.js", () => ({ default: { findOne: mocks.academicYearFindOne } }));
vi.mock("../models/SchoolClass.js", () => ({ default: { findOne: mocks.classFindOne } }));
vi.mock("../models/Section.js", () => ({ default: { findOne: mocks.sectionFindOne } }));
vi.mock("../models/TeacherAssignment.js", () => ({ default: { exists: mocks.assignmentExists } }));
vi.mock("../models/Enrollment.js", () => ({ default: {} }));
vi.mock("../models/Student.js", () => ({ default: {} }));
vi.mock("../models/Guardian.js", () => ({ default: {} }));
vi.mock("../models/StudentGuardian.js", () => ({ default: {} }));

import { createAnnouncement } from "../controllers/announcementController.js";

const query = (value) => ({
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});
const validBody = (overrides = {}) => ({
  title: "School holiday",
  body: "The school will remain closed on Friday.",
  audienceType: "SCHOOL",
  academicYearId: "year-a",
  ...overrides,
});

describe("announcement creation authorization", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenantId: "tenant-a",
      auth: { userId: "admin-a", role: "school_admin" },
      body: validBody(),
    };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
    mocks.academicYearFindOne.mockReturnValue(query({ _id: "year-a" }));
    mocks.classFindOne.mockReturnValue(query({ _id: "class-a" }));
    mocks.sectionFindOne.mockReturnValue(query({ _id: "section-a" }));
    mocks.assignmentExists.mockResolvedValue(true);
    mocks.announcementCreate.mockResolvedValue({ _id: "notice-a", status: "draft" });
  });

  it("creates a tenant-owned school notice and treats expiry as optional", async () => {
    await createAnnouncement(req, res, next);

    expect(mocks.academicYearFindOne).toHaveBeenCalledWith({
      _id: "year-a", tenantId: "tenant-a", status: "active",
    });
    expect(mocks.announcementCreate).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      createdBy: "admin-a",
      updatedBy: "admin-a",
      audienceType: "SCHOOL",
      classId: null,
      sectionId: null,
      expiresAt: null,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a class outside the authenticated tenant", async () => {
    req.body = validBody({ audienceType: "CLASS", classId: "class-foreign" });
    mocks.classFindOne.mockReturnValue(query(null));

    await createAnnouncement(req, res, next);

    expect(mocks.classFindOne).toHaveBeenCalledWith({
      _id: "class-foreign", tenantId: "tenant-a", academicYearId: "year-a", status: "active",
    });
    expect(mocks.announcementCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("denies a teacher who is not assigned to the target class", async () => {
    req.auth = { userId: "teacher-a", role: "teacher" };
    req.body = validBody({ audienceType: "CLASS", classId: "class-a" });
    mocks.assignmentExists.mockResolvedValue(false);

    await createAnnouncement(req, res, next);

    expect(mocks.assignmentExists).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", teacherId: "teacher-a", academicYearId: "year-a",
      classId: "class-a", status: "active", sectionId: null,
    }));
    expect(mocks.announcementCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows a teacher with an active class assignment to create a draft", async () => {
    req.auth = { userId: "teacher-a", role: "teacher" };
    req.body = validBody({ audienceType: "CLASS", classId: "class-a" });

    await createAnnouncement(req, res, next);

    expect(mocks.announcementCreate).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", createdBy: "teacher-a", audienceType: "CLASS",
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed expiry values", async () => {
    req.body = validBody({ expiresAt: "not-a-date" });
    await createAnnouncement(req, res, next);
    expect(mocks.announcementCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
