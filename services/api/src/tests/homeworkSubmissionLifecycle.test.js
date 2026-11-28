import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  homeworkFindOne: vi.fn(),
  enrollmentFind: vi.fn(),
  enrollmentFindOne: vi.fn(),
  submissionFind: vi.fn(),
  submissionFindOneAndUpdate: vi.fn(),
  studentFindOne: vi.fn(),
  teacherAssignmentExists: vi.fn(),
}));

vi.mock("../models/Homework.js", () => ({ default: { findOne: mocks.homeworkFindOne } }));
vi.mock("../models/Enrollment.js", () => ({
  default: { find: mocks.enrollmentFind, findOne: mocks.enrollmentFindOne },
}));
vi.mock("../models/HomeworkSubmission.js", () => ({
  default: { find: mocks.submissionFind, findOneAndUpdate: mocks.submissionFindOneAndUpdate },
}));
vi.mock("../models/Student.js", () => ({ default: { findOne: mocks.studentFindOne } }));
vi.mock("../models/Guardian.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../models/StudentGuardian.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/TeacherAssignment.js", () => ({ default: { exists: mocks.teacherAssignmentExists } }));

import {
  listHomeworkSubmissions,
  reviewHomeworkSubmission,
  submitHomework,
} from "../controllers/homeworkSubmissionController.js";

const query = (value) => ({
  select: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value),
});

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

describe("homework submission lifecycle", () => {
  const homeworkId = "64b000000000000000000001";
  const submissionId = "64b000000000000000000002";
  const enrollmentId = "64b000000000000000000003";
  const studentId = "64b000000000000000000004";
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenantId: "tenant-a",
      auth: { userId: "admin-a", role: "school_admin" },
      params: { homeworkId, submissionId },
      query: {},
      body: {},
    };
    res = makeResponse();
    next = vi.fn();
  });

  it("returns a complete tenant-scoped assigned roster with submitted and pending counts", async () => {
    mocks.homeworkFindOne.mockReturnValue(query({
      _id: homeworkId, tenantId: "tenant-a", academicYearId: "year-a",
      classId: "class-a", sectionId: null, subjectId: "subject-a",
    }));
    mocks.enrollmentFind.mockReturnValue(query([
      { _id: enrollmentId, studentId: { _id: studentId, firstName: "Amina", lastName: "Khan", admissionNumber: "A-01" } },
      { _id: "64b000000000000000000005", studentId: { _id: "student-b", firstName: "Bilal", lastName: "Khan", admissionNumber: "B-01" } },
    ]));
    mocks.submissionFind.mockReturnValue(query([{
      _id: submissionId, enrollmentId, studentId: { _id: studentId, firstName: "Amina", lastName: "Khan" },
      status: "submitted", answer: "Completed exercise",
    }]));

    await listHomeworkSubmissions(req, res, next);

    expect(mocks.homeworkFindOne).toHaveBeenCalledWith({ _id: homeworkId, tenantId: "tenant-a" });
    expect(mocks.enrollmentFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", academicYearId: "year-a", classId: "class-a",
      status: { $in: ["active", "completed", "transferred"] },
    }));
    expect(mocks.submissionFind).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", homeworkId, enrollmentId: { $in: [enrollmentId, "64b000000000000000000005"] },
    }));
    const payload = res.json.mock.calls[0][0];
    expect(payload.roster).toHaveLength(2);
    expect(payload.roster.map((row) => row.submissionStatus)).toEqual(["submitted", "not_submitted"]);
    expect(payload.summary).toEqual({ assigned: 2, submitted: 1, pending: 1, reviewed: 0 });
    expect(payload.data).toHaveLength(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("hides homework from a teacher who no longer has the matching active assignment", async () => {
    req.auth = { userId: "teacher-a", role: "teacher" };
    mocks.homeworkFindOne.mockReturnValue(query({
      _id: homeworkId, tenantId: "tenant-a", teacherId: "teacher-a",
      academicYearId: "year-a", classId: "class-a", subjectId: "subject-a", sectionId: null,
    }));
    mocks.teacherAssignmentExists.mockResolvedValue(false);

    await listHomeworkSubmissions(req, res, next);

    expect(mocks.homeworkFindOne).toHaveBeenCalledWith({
      _id: homeworkId, tenantId: "tenant-a", teacherId: "teacher-a",
    });
    expect(mocks.teacherAssignmentExists).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", teacherId: "teacher-a", academicYearId: "year-a",
      classId: "class-a", subjectId: "subject-a", status: "active", sectionId: null,
    }));
    expect(mocks.enrollmentFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("uses an atomic submitted-only transition when a teacher reviews work", async () => {
    req.body = { marksObtained: 8, maxMarks: 10, feedback: "Good work" };
    mocks.homeworkFindOne.mockReturnValue(query({ _id: homeworkId, tenantId: "tenant-a" }));
    mocks.submissionFindOneAndUpdate.mockResolvedValue({
      _id: submissionId, status: "reviewed", marksObtained: 8, maxMarks: 10,
    });

    await reviewHomeworkSubmission(req, res, next);

    expect(mocks.submissionFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: submissionId, tenantId: "tenant-a", homeworkId, status: "submitted" },
      { $set: expect.objectContaining({
        status: "reviewed", marksObtained: 8, maxMarks: 10,
        feedback: "Good work", reviewedBy: "admin-a",
      }) },
      { new: true, runValidators: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid marks before attempting to review a submission", async () => {
    req.body = { marksObtained: 11, maxMarks: 10, feedback: "" };

    await reviewHomeworkSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.submissionFindOneAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("uses an atomic upsert that cannot overwrite an already reviewed submission", async () => {
    req.auth = { userId: "student-user", role: "student" };
    req.body = { answer: "  My completed answer  " };
    mocks.studentFindOne.mockReturnValue(query({ _id: studentId }));
    mocks.homeworkFindOne.mockReturnValue(query({
      _id: homeworkId, tenantId: "tenant-a", academicYearId: "year-a",
      classId: "class-a", sectionId: null, status: "published",
    }));
    mocks.enrollmentFindOne.mockReturnValue(query({ _id: enrollmentId }));
    mocks.submissionFindOneAndUpdate.mockResolvedValue({ _id: submissionId, answer: "My completed answer" });

    await submitHomework(req, res, next);

    expect(mocks.submissionFindOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: "tenant-a", homeworkId, enrollmentId, status: { $ne: "reviewed" } },
      expect.objectContaining({
        $set: expect.objectContaining({ answer: "My completed answer", status: "submitted" }),
        $setOnInsert: { tenantId: "tenant-a", homeworkId, enrollmentId, studentId },
      }),
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});
