import { describe, expect, it } from "vitest";
import { buildExaminationAnalytics } from "../utils/examinationAnalytics.js";

const bands = [
  { grade: "A", minPercentage: 80, maxPercentage: 100 },
  { grade: "F", minPercentage: 0, maxPercentage: 40 },
  { grade: "B", minPercentage: 40, maxPercentage: 80 },
];

describe("examination performance analytics", () => {
  it("separates scored, absent, and pending subject records", () => {
    const subject = {
      _id: "subject-a",
      subjectId: { _id: "catalogue-subject-a", name: "Mathematics" },
      maxMarks: 100,
      passMarks: 50,
    };
    const enrollments = ["enrol-1", "enrol-2", "enrol-3", "enrol-4"].map((_id) => ({ _id }));
    const marks = [
      { examSubjectId: "subject-a", enrollmentId: "enrol-1", marksObtained: 90, absent: false },
      { examSubjectId: "subject-a", enrollmentId: "enrol-2", marksObtained: 40, absent: false },
      { examSubjectId: "subject-a", enrollmentId: "enrol-3", marksObtained: null, absent: true },
    ];
    const results = [
      { status: "passed", grade: "A" },
      { status: "failed", grade: "B" },
      { status: "failed", grade: null },
      { status: "incomplete", grade: null },
    ];

    const analytics = buildExaminationAnalytics({
      subjects: [subject],
      enrollments,
      marks,
      results,
      gradingBands: bands,
    });

    expect(analytics.classPassRate).toBe(50);
    expect(analytics.gradeDistribution).toEqual([
      { grade: "F", count: 0, percentage: 0 },
      { grade: "B", count: 1, percentage: 50 },
      { grade: "A", count: 1, percentage: 50 },
    ]);
    expect(analytics.subjectAnalytics[0]).toMatchObject({
      subject: subject.subjectId,
      enrolledCount: 4,
      recordedCount: 3,
      scoredCount: 2,
      absentCount: 1,
      pendingCount: 1,
      passedCount: 1,
      failedCount: 1,
      passRate: 50,
      averagePercentage: 65,
      highestPercentage: 90,
      lowestPercentage: 40,
    });
    expect(analytics.subjectAnalytics[0].gradeDistribution).toEqual([
      { grade: "F", count: 1, percentage: 50 },
      { grade: "B", count: 0, percentage: 0 },
      { grade: "A", count: 1, percentage: 50 },
    ]);
  });

  it("returns null metrics when there are no scored or complete results", () => {
    const analytics = buildExaminationAnalytics({
      subjects: [{ _id: "subject-a", subjectId: null, maxMarks: 100, passMarks: 35 }],
      enrollments: [{ _id: "enrol-1" }],
      marks: [],
      results: [{ status: "incomplete", grade: null }],
      gradingBands: bands,
    });

    expect(analytics.classPassRate).toBeNull();
    expect(analytics.gradeDistribution.every((item) => item.count === 0)).toBe(true);
    expect(analytics.subjectAnalytics[0]).toMatchObject({
      scoredCount: 0,
      absentCount: 0,
      pendingCount: 1,
      passRate: null,
      averagePercentage: null,
      highestPercentage: null,
      lowestPercentage: null,
    });
  });
});
