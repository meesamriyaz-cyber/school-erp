import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenantFindOne: vi.fn(),
  studentFindOne: vi.fn(),
  studentFind: vi.fn(),
  guardianFindOne: vi.fn(),
  studentGuardianFind: vi.fn(),
  enrollmentFind: vi.fn(),
  examinationFind: vi.fn(),
  homeworkFind: vi.fn(),
  loadResultContext: vi.fn(),
}));

vi.mock("../models/Tenant.js", () => ({
  default: { findOne: mocks.tenantFindOne },
}));
vi.mock("../models/Student.js", () => ({
  default: { findOne: mocks.studentFindOne, find: mocks.studentFind },
}));
vi.mock("../models/Guardian.js", () => ({
  default: { findOne: mocks.guardianFindOne },
}));
vi.mock("../models/StudentGuardian.js", () => ({
  default: { find: mocks.studentGuardianFind },
}));
vi.mock("../models/Enrollment.js", () => ({
  default: { find: mocks.enrollmentFind },
}));
vi.mock("../models/Examination.js", () => ({
  default: { find: mocks.examinationFind },
}));
vi.mock("../models/Homework.js", () => ({
  default: { find: mocks.homeworkFind },
}));
vi.mock("../controllers/examResultController.js", () => ({
  loadResultContext: mocks.loadResultContext,
}));

import {
  getMyHomework,
  getMyPublishedResults,
} from "../controllers/studentResultPortalController.js";

const query = (value, methods = []) => {
  const result = { lean: vi.fn().mockResolvedValue(value) };
  for (const method of methods) result[method] = vi.fn().mockReturnValue(result);
  return result;
};

const configureParent = () => {
  mocks.guardianFindOne.mockReturnValue(query({ _id: "guardian-a" }, ["select"]));
  mocks.studentGuardianFind.mockReturnValue(query([{ studentId: "student-a" }], ["select"]));
  mocks.studentFind.mockReturnValue(query([
    { _id: "student-a", firstName: "Amina", status: "active" },
  ], ["select", "sort"]));
};

describe("student and parent portal results and homework access", () => {
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
    mocks.tenantFindOne.mockReturnValue(query({ name: "Test School", contactEmail: "office@example.com" }, ["select"]));
  });

  it("limits parent results to active students linked in the same tenant", async () => {
    const enrollment = {
      _id: "enrollment-a",
      studentId: "student-a",
      academicYearId: "year-a",
      classId: "class-a",
      sectionId: "section-a",
    };
    const exam = {
      _id: "exam-a",
      name: "Term 1",
      academicYearId: "year-a",
      classId: "class-a",
      sectionId: null,
    };
    const result = { enrollmentId: "enrollment-a", percentage: 85 };
    mocks.enrollmentFind.mockReturnValue(query([enrollment], ["select"]));
    mocks.examinationFind.mockReturnValue(query([exam], ["populate", "sort"]));
    mocks.loadResultContext.mockResolvedValue({ results: [result] });

    await getMyPublishedResults(req, res, next);

    expect(mocks.guardianFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "parent-a",
      status: "active",
    });
    expect(mocks.studentGuardianFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      guardianId: "guardian-a",
      status: "active",
      $or: [
        { canAccessPortal: true },
        { isPrimary: true, canAccessPortal: { $exists: false } },
      ],
    });
    expect(mocks.studentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      _id: { $in: ["student-a"] },
      status: "active",
    });
    expect(mocks.enrollmentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{
        examination: expect.objectContaining({ name: "Term 1" }),
        school: { name: "Test School", contactEmail: "office@example.com" },
        student: expect.objectContaining({ _id: "student-a" }),
        result,
      }],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("does not let a student account read results after its student record is inactive", async () => {
    req.auth = { userId: "student-user-a", role: "student" };
    mocks.studentFindOne.mockReturnValue(query(null, ["select"]));

    await getMyPublishedResults(req, res, next);

    expect(mocks.studentFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "student-user-a",
      status: "active",
    });
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  it("limits parent homework to active students linked in the same tenant", async () => {
    const enrollment = {
      _id: "enrollment-a",
      studentId: "student-a",
      academicYearId: "year-a",
      classId: "class-a",
      sectionId: "section-a",
    };
    const task = {
      _id: "homework-a",
      academicYearId: "year-a",
      classId: { _id: "class-a", name: "Class 5" },
      sectionId: null,
      dueDate: new Date("2026-11-20T00:00:00.000Z"),
    };
    mocks.enrollmentFind.mockReturnValue(query([enrollment], ["select"]));
    mocks.homeworkFind.mockReturnValue(query([task], ["populate", "populate", "populate", "populate", "sort", "limit"]));

    await getMyHomework(req, res, next);

    expect(mocks.studentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      _id: { $in: ["student-a"] },
      status: "active",
    });
    expect(mocks.enrollmentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
    }));
    expect(mocks.homeworkFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      status: "published",
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [expect.objectContaining({
        homework: task,
        student: expect.objectContaining({ _id: "student-a" }),
        enrollmentId: "enrollment-a",
      })],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("does not let an inactive student account read homework", async () => {
    req.auth = { userId: "student-user-a", role: "student" };
    mocks.studentFindOne.mockReturnValue(query(null, ["select"]));

    await getMyHomework(req, res, next);

    expect(mocks.studentFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "student-user-a",
      status: "active",
    });
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(mocks.homeworkFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });
});
