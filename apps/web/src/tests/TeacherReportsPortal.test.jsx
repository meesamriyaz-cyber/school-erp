import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TeacherReportsPortal from "../components/TeacherReportsPortal.jsx";
import { apiRequest } from "../lib/api.js";
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

describe("TeacherReportsPortal", () => {
  beforeEach(() => vi.resetAllMocks());
  it("requests an attendance report for the selected assigned class", async () => {
    apiRequest.mockResolvedValue({ success: true, summary: { students: 1, present: 8, absent: 1, percentage: 88.9 }, students: [{
      studentId: "student-1", name: "Amina Khan", admissionNumber: "ADM-01",
      sectionName: "A", present: 8, absent: 1, late: 0, percentage: 88.9,
    }] });
    const assignments = [{
      academicYearId: { _id: "year-1", name: "2026–27", startDate: "2026-04-01", endDate: "2027-03-31" },
      classId: { _id: "class-1", name: "Class 5" },
    }];
    render(<TeacherReportsPortal accessToken="teacher-token" assignments={assignments} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect(await screen.findByText("Amina Khan")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      expect.stringContaining("/attendance/reports?academicYearId=year-1&classId=class-1"),
      { accessToken: "teacher-token" },
    );
  });
});
