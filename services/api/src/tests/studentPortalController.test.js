import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  studentFindOne: vi.fn(),
  studentFind: vi.fn(),
  guardianFindOne: vi.fn(),
  relationshipFind: vi.fn(),
  enrollmentFind: vi.fn(),
}));

vi.mock("../models/Student.js", () => ({
  default: { findOne: mocks.studentFindOne, find: mocks.studentFind },
}));
vi.mock("../models/Guardian.js", () => ({
  default: { findOne: mocks.guardianFindOne },
}));
vi.mock("../models/StudentGuardian.js", () => ({
  default: { find: mocks.relationshipFind },
}));
vi.mock("../models/Enrollment.js", () => ({
  default: { find: mocks.enrollmentFind },
}));

import { getMyChildren } from "../controllers/studentPortalController.js";

const query = (value, chainMethods = []) => {
  const result = {
    lean: vi.fn().mockResolvedValue(value),
  };
  for (const method of chainMethods) {
    result[method] = vi.fn().mockReturnValue(result);
  }
  return result;
};

describe("student portal linked children", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenantId: "tenant-a",
      auth: { userId: "user-a", role: "parent" },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it("returns every active child linked to a parent with each current enrollment", async () => {
    const guardianId = "guardian-a";
    const firstStudent = { _id: "student-a", firstName: "Amina", status: "active" };
    const secondStudent = { _id: "student-b", firstName: "Bilal", status: "active" };
    mocks.guardianFindOne.mockReturnValue(query({ _id: guardianId }, ["select"]));
    mocks.relationshipFind.mockReturnValue(query([
      { studentId: firstStudent._id, relationship: "mother", isPrimary: true },
      { studentId: secondStudent._id, relationship: "mother", isPrimary: true },
    ], ["select"]));
    mocks.studentFind.mockReturnValue(query([firstStudent, secondStudent], ["select", "sort"]));
    mocks.enrollmentFind.mockReturnValue(query([
      { studentId: firstStudent._id, classId: { name: "Class 5" } },
      { studentId: secondStudent._id, classId: { name: "Class 2" } },
    ], ["populate", "populate", "populate"]));

    await getMyChildren(req, res, next);

    expect(mocks.guardianFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "user-a",
      status: "active",
    });
    expect(mocks.relationshipFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      guardianId,
      status: "active",
    });
    expect(mocks.studentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      _id: { $in: ["student-a", "student-b"] },
      status: "active",
    }));
    expect(mocks.enrollmentFind).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      studentId: { $in: ["student-a", "student-b"] },
      status: "active",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          student: firstStudent,
          relationship: "mother",
          currentEnrollment: expect.objectContaining({ classId: { name: "Class 5" } }),
        }),
        expect.objectContaining({
          student: secondStudent,
          relationship: "mother",
          currentEnrollment: expect.objectContaining({ classId: { name: "Class 2" } }),
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns only the authenticated student's own linked record", async () => {
    req.auth.role = "student";
    const student = { _id: "student-a", firstName: "Amina", status: "active" };
    mocks.studentFindOne.mockReturnValue(query(student, ["select"]));
    mocks.enrollmentFind.mockReturnValue(query([], ["populate", "populate", "populate"]));

    await getMyChildren(req, res, next);

    expect(mocks.studentFindOne).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "user-a",
      status: "active",
    });
    expect(mocks.guardianFindOne).not.toHaveBeenCalled();
    expect(mocks.relationshipFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{
        student,
        relationship: null,
        isPrimary: false,
        currentEnrollment: null,
      }],
    });
  });

  it("does not return children when the parent account is not actively linked", async () => {
    mocks.guardianFindOne.mockReturnValue(query(null, ["select"]));

    await getMyChildren(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Your parent account has not been linked by the school",
    });
    expect(mocks.relationshipFind).not.toHaveBeenCalled();
    expect(mocks.studentFind).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns an empty overview when a parent has no active child links", async () => {
    mocks.guardianFindOne.mockReturnValue(query({ _id: "guardian-a" }, ["select"]));
    mocks.relationshipFind.mockReturnValue(query([], ["select"]));

    await getMyChildren(req, res, next);

    expect(mocks.studentFind).not.toHaveBeenCalled();
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it("forwards unexpected database errors", async () => {
    const error = new Error("database unavailable");
    mocks.guardianFindOne.mockImplementation(() => {
      throw error;
    });

    await getMyChildren(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
