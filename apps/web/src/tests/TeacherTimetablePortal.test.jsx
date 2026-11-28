import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TeacherTimetablePortal from "../components/TeacherTimetablePortal.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "teacher-token", user: { firstName: "Ayaan", lastName: "Khan" }, logout: vi.fn() }),
}));

describe("TeacherTimetablePortal", () => {
  beforeEach(() => { vi.resetAllMocks(); apiRequest.mockResolvedValue({ success: true, data: [] }); });

  it("keeps teacher navigation and workspace content inside the shared page layout", async () => {
    render(<TeacherTimetablePortal />);
    expect(await screen.findByRole("navigation", { name: "Teacher workspace" })).toBeInTheDocument();
    expect(await screen.findByText("TEACHING OVERVIEW")).toBeInTheDocument();
    expect(document.querySelector(".teacher-overview.school-dashboard .school-dashboard-stats")).toBeInTheDocument();
    expect(document.querySelector(".teacher-overview .school-dashboard-panels")).toBeInTheDocument();
    expect(document.querySelector(".teacher-dashboard-actions")).toBeInTheDocument();
    expect(document.querySelector(".teacher-workspace-content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Examination marks" })).toBeInTheDocument();
    expect(screen.queryByText("\\n")).not.toBeInTheDocument();
  });

  it("shows the teacher weekly schedule returned by the scoped timetable API", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [{
      _id: "period-1", dayOfWeek: 1, periodNumber: 1, startTime: "09:00", endTime: "09:45", room: "Room 4",
      classId: { name: "Class 5" }, sectionId: { name: "A" },
      assignmentId: { subjectId: { name: "Mathematics" } },
    }] });

    render(<TeacherTimetablePortal />);
    expect(await screen.findByRole("heading", { name: "My teacher dashboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My timetable" }));
    expect(screen.getByRole("heading", { name: /^Monday/ })).toBeInTheDocument();
    expect(screen.getAllByText("No periods assigned")).toHaveLength(5);
    expect(screen.getByText("Weekly periods")).toBeInTheDocument();
    expect(screen.getByText("Classes assigned")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Class 5 · Section A")).toBeInTheDocument();
    expect(screen.getByText("Room 4")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/timetable", { accessToken: "teacher-token", signal: expect.any(AbortSignal) });
  });

  it("switches to a chronological list of the teacher's periods", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [{
      _id: "period-2", dayOfWeek: 2, periodNumber: 2, startTime: "10:00", endTime: "10:45", room: "Lab 2",
      classId: { name: "Class 6" }, assignmentId: { subjectId: { name: "Science" } },
    }] });

    render(<TeacherTimetablePortal />);
    expect(await screen.findByRole("heading", { name: "My teacher dashboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My timetable" }));
    expect(await screen.findByText("Science")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print timetable" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.getByText("Lab 2")).toBeInTheDocument();
  });
  it("uses the shared operational layout for attendance and examination marks", async () => {
    render(<TeacherTimetablePortal />);
    fireEvent.click(screen.getByRole("navigation", { name: "Teacher workspace" }).querySelector('button:nth-child(3)'));
    expect(document.querySelector(".teacher-workspace-content .teacher-attendance")).toBeInTheDocument();
    expect(document.querySelector(".teacher-workspace-content .teacher-attendance-summary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Examination marks" }));
    expect(document.querySelector(".teacher-workspace-content .teacher-exams")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Examination marks" })).toBeInTheDocument();
  });

  it("uses the shared operational layout for homework and reports", async () => {
    render(<TeacherTimetablePortal />);
    fireEvent.click(await screen.findByRole("button", { name: "Homework & classwork" }));
    expect(document.querySelector(".teacher-workspace-content .homework-page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(document.querySelector(".teacher-workspace-content .teacher-reports")).toBeInTheDocument();
  });

  it("uses the school dashboard design primitives for the teacher overview", async () => {
    render(<TeacherTimetablePortal />);
    expect(await screen.findByText("TEACHING OVERVIEW")).toBeInTheDocument();
    expect(document.querySelector(".teacher-overview.school-dashboard .school-dashboard-stats")).toBeInTheDocument();
    expect(document.querySelectorAll(".teacher-overview .school-dashboard-stat")).toHaveLength(4);
    expect(document.querySelector(".teacher-overview .school-dashboard-panels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View timetable/ })).toBeInTheDocument();
  });

  it("opens the parent messaging workspace from teacher navigation", async () => {
    render(<TeacherTimetablePortal />);
    fireEvent.click(await screen.findByRole("button", { name: "Parent messages" }));
    expect(await screen.findByRole("heading", { name: "Parent–teacher messages" })).toBeInTheDocument();
    expect(await screen.findByText("No open conversations yet.")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/messaging/conversations", { accessToken: "teacher-token" });
    expect(apiRequest).toHaveBeenCalledWith("/messaging/contacts", { accessToken: "teacher-token" });
  });

  it("opens the announcements workspace from the teacher navigation", async () => {
    render(<TeacherTimetablePortal />);
    fireEvent.click(await screen.findByRole("button", { name: "Announcements" }));
    expect(await screen.findByRole("heading", { name: "Announcements & notices" })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/announcements", { accessToken: "teacher-token", signal: expect.any(AbortSignal) });
  });

});