import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  studentFind: vi.fn(),
  guardianFindOne: vi.fn(),
  studentGuardianFind: vi.fn(),
  homeworkSubmissionFind: vi.fn(),
}));

vi.mock("../models/Student.js", () => ({
  default: { find: mocks.studentFind, findOne: vi.fn() },
}));
vi.mock("../models/Guardian.js", () => ({
  default: { findOne: mocks.guardianFindOne },
}));
vi.mock("../models/StudentGuardian.js", () => ({
  default: { find: mocks.studentGuardianFind },
}));
vi.mock("../models/HomeworkSubmission.js", () => ({
  default: { find: mocks.homeworkSubmissionFind },
}));
vi.mock("../models/Homework.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../models/Enrollment.js", () => ({ default: { find: vi.fn(), findOne: vi.fn() } }));
vi.mock("../models/TeacherAssignment.js", () => ({ default: { exists: vi.fn() } }));

import { getMyHomeworkSubmissions } from "../controllers/homeworkSubmissionController.js";

const query = (value, methods = []) => {
  const result = { lean: vi.fn().mockResolvedValue(value) };
  for (const method of methods) result[method] = vi.fn().mockReturnValue(result);
  return result;
};

describe("parent homework submission access", () => {
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
    mocks.guardianFindOne.mockReturnValue(query({ _id: "guardian-a" }, ["select"]));
    mocks.studentGuardianFind.mockReturnValue(query([{ studentId: "student-a" }], ["select"]));
    mocks.studentFind.mockReturnValue(query([{ _id: "student-a" }], ["select"]));
    mocks.homeworkSubmissionFind.mockReturnValue(query([], ["populate", "populate", "populate", "sort"]));
  });

  it("returns submissions only for active linked students in the authenticated tenant", async () => {
    await getMyHomeworkSubmissions(req, res, next);

    expect(mocks.guardianFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "parent-a",
      status: "active",
    });
    expect(mocks.studentGuardianFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      guardianId: "guardian-a",
      status: "active",
    });
    expect(mocks.studentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      _id: { $in: ["student-a"] },
      status: "active",
    });
    expect(mocks.homeworkSubmissionFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a"] },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns no submissions when a parent has no active linked children", async () => {
    mocks.studentGuardianFind.mockReturnValue(query([], ["select"]));

    await getMyHomeworkSubmissions(req, res, next);

    expect(mocks.studentFind).not.toHaveBeenCalled();
    expect(mocks.homeworkSubmissionFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      studentId: { $in: [] },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
