import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SchoolDashboard from "../components/SchoolDashboard.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const report = {
  generatedAt: "2026-11-10T08:00:00.000Z",
  academicYear: { id: "year-1", name: "2026-2027", status: "active" },
  students: { total: 120, active: 115 },
  enrollments: { active: 115, completed: 4, transferred: 1, withdrawn: 0, total: 120 },
  staff: { totalActive: 18, teaching: 14, nonTeaching: 4 },
  attendance: {
    date: "2026-11-10",
    today: { present: 100, absent: 10, late: 5, excused: 2, marked: 117, attended: 105, percentage: 91.3 },
    trend: [{ month: "2026-11", present: 100, late: 5, absent: 10, excused: 2, marked: 117 }],
  },
  fees: { posted: 50000, reversed: 2000, net: 48000, outstanding: 12000 },
  examinations: {
    published: 2,
    latestResult: { examinationId: "exam-1", name: "Term 1", averagePercentage: 76.5, passed: 90, failed: 10, students: 100, passRate: 90 },
  },
};

describe("SchoolDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue({ success: true, data: report });
  });
  afterEach(() => cleanup());

  it("renders live school, attendance, staff, fee and academic indicators", async () => {
    render(<SchoolDashboard accessToken="token" academicYearId="year-1" />);
    expect(await screen.findByText("School at a glance")).toBeInTheDocument();
    expect(screen.getAllByText("115").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("₹48,000")).toBeInTheDocument();
    expect(screen.getByText("Term 1")).toBeInTheDocument();
    expect(screen.getByText("76.5%")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/reports/dashboard?academicYearId=year-1", expect.objectContaining({ accessToken: "token" }));
  });

  it("navigates to attendance reports from the dashboard", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SchoolDashboard accessToken="token" academicYearId="year-1" onNavigate={onNavigate} />);
    await user.click(await screen.findByRole("button", { name: "View reports →" }));
    expect(onNavigate).toHaveBeenCalledWith("Attendance Reports");
  });

  it("shows an actionable error and retries the analytics request", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValueOnce(new Error("Dashboard unavailable")).mockResolvedValueOnce({ success: true, data: report });
    render(<SchoolDashboard accessToken="token" academicYearId="year-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Dashboard unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("School at a glance")).toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
