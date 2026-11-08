import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ExaminationManagement from "../components/ExaminationManagement.jsx";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({ useAuth: mocks.useAuth }));

const exam = {
  _id: "exam-1",
  name: "Mid Term",
  status: "completed",
  academicYearId: { _id: "year-1", name: "2026-27" },
  classId: { _id: "class-1", name: "Class 5" },
  subjects: [{
    _id: "exam-subject-1",
    subjectId: { _id: "subject-1", name: "Mathematics" },
    maxMarks: 100,
    passMarks: 35,
  }],
};

const completeResult = {
  enrollmentId: "enrollment-1",
  student: { firstName: "Amina", lastName: "Khan", admissionNumber: "A-01" },
  totalObtained: 82,
  totalMaximum: 100,
  percentage: 82,
  grade: "B",
  status: "passed",
  subjects: [{
    examSubjectId: "exam-subject-1",
    subject: { name: "Mathematics" },
    maxMarks: 100,
    marksObtained: 82,
    percentage: 82,
    grade: "B",
    status: "passed",
    absent: false,
  }],
};

const summary = {
  passedCount: 1,
  failedCount: 0,
  incompleteCount: 0,
  classPassRate: 100,
  averagePercentage: 82,
  highestPercentage: 82,
  lowestPercentage: 82,
  gradingScaleName: "School bands 2026",
  gradeDistribution: [
    { grade: "B", count: 1, percentage: 100 },
    { grade: "A", count: 0, percentage: 0 },
  ],
  subjectAnalytics: [{
    examSubjectId: "exam-subject-1",
    subject: { name: "Mathematics" },
    maxMarks: 100,
    passMarks: 35,
    enrolledCount: 3,
    recordedCount: 2,
    scoredCount: 1,
    absentCount: 1,
    pendingCount: 1,
    passedCount: 1,
    failedCount: 0,
    passRate: 100,
    averagePercentage: 82,
    highestPercentage: 82,
    lowestPercentage: 82,
    gradeDistribution: [{ grade: "B", count: 1, percentage: 100 }],
  }],
};

const configureApi = (resultSummary = summary) => {
  mocks.apiRequest.mockImplementation(async (path) => {
    if (path === "/academic-years") return { success: true, data: [] };
    if (path === "/subjects?status=active") return { success: true, data: [] };
    if (path === "/examinations") return { success: true, data: [exam] };
    if (path === "/examinations/exam-1") return { success: true, data: exam };
    if (path.startsWith("/enrollments?")) return { success: true, data: [] };
    if (path === "/examinations/exam-1/marks") return { success: true, data: [] };
    if (path === "/examinations/exam-1/results") {
      return { success: true, data: [completeResult], summary: resultSummary };
    }
    if (path.startsWith("/examinations/exam-1/marks/audit")) return { success: true, data: [] };
    return { success: true, data: [] };
  });
};

describe("ExaminationManagement result analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ accessToken: "test-token" });
    configureApi();
  });

  it("renders class grade distribution and subject analytics with absent and pending counts", async () => {
    const user = userEvent.setup();
    render(<ExaminationManagement />);

    await user.click(await screen.findByRole("button", { name: /Mid Term/ }));

    expect(await screen.findByText("Consolidated results")).toBeInTheDocument();
    expect(screen.getByText("Pass rate · complete only").parentElement).toHaveTextContent("100%");
    expect(screen.getByText("Average · complete only").parentElement).toHaveTextContent("82%");
    expect(screen.getByText("Overall grade distribution")).toBeInTheDocument();
    const classDistribution = document.querySelector(".grade-distribution-list");
    expect(classDistribution).toHaveTextContent("B");
    expect(classDistribution).toHaveTextContent("1 student");
    expect(classDistribution).toHaveTextContent("100%");

    const analyticsTable = document.querySelector(".subject-analytics-table");
    expect(analyticsTable).not.toBeNull();
    expect(within(analyticsTable).getByText("Mathematics")).toBeInTheDocument();
    expect(analyticsTable).toHaveTextContent("82%");
    expect(analyticsTable).toHaveTextContent("Absent");
    expect(analyticsTable).toHaveTextContent("Pending");
    expect(analyticsTable).toHaveTextContent("B: 1");
    expect(screen.getByText(/averages and pass rates exclude absent and pending records/)).toBeInTheDocument();
  });

  it("renders unavailable class metrics as dashes when no complete results exist", async () => {
    configureApi({
      ...summary,
      classPassRate: null,
      averagePercentage: null,
      highestPercentage: null,
      lowestPercentage: null,
      gradeDistribution: [],
      subjectAnalytics: [{
        ...summary.subjectAnalytics[0],
        passRate: null,
        averagePercentage: null,
        highestPercentage: null,
        lowestPercentage: null,
        gradeDistribution: [],
        scoredCount: 0,
        absentCount: 0,
        pendingCount: 1,
        passedCount: 0,
        failedCount: 0,
      }],
    });
    render(<ExaminationManagement />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Mid Term/ }));

    await waitFor(() => expect(screen.getByText("Pass rate · complete only").parentElement).toHaveTextContent("—"));
    expect(screen.getByText("Average · complete only").parentElement).toHaveTextContent("—");
    const analyticsTable = document.querySelector(".subject-analytics-table");
    expect(analyticsTable).toHaveTextContent("—");
    expect(analyticsTable).toHaveTextContent("Pending");
  });
});
