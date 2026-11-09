import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TeacherRosterPortal from "../components/TeacherRosterPortal.jsx";
import { apiRequest } from "../lib/api.js";
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

describe("TeacherRosterPortal", () => {
  it("loads a roster using only the selected assignment scope", async () => {
    apiRequest.mockResolvedValue({ success: true, data: [{
      _id: "enrollment-1", status: "active", enrollmentDate: "2026-04-01",
      studentId: { admissionNumber: "ADM-01", firstName: "Amina", lastName: "Khan" },
      sectionId: { name: "A" },
    }] });
    const assignments = [{
      academicYearId: { _id: "year-1", name: "2026–27" },
      classId: { _id: "class-1", name: "Class 5" },
      sectionId: { _id: "section-1", name: "A" },
    }];
    render(<TeacherRosterPortal accessToken="teacher-token" assignments={assignments} />);
    expect(await screen.findByText("ADM-01")).toBeInTheDocument();
    expect(screen.getByText("Amina Khan")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/enrollments?academicYearId=year-1&classId=class-1&status=active&sectionId=section-1",
      { accessToken: "teacher-token", signal: expect.any(AbortSignal) },
    );
  });

  it("does not request a roster without assignments", () => {
    render(<TeacherRosterPortal accessToken="teacher-token" assignments={[]} />);
    expect(screen.getByText("No active teaching assignments found.")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
