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

  it("shows the teacher weekly schedule returned by the scoped timetable API", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [{
      _id: "period-1", dayOfWeek: 1, periodNumber: 1, startTime: "09:00", endTime: "09:45", room: "Room 4",
      classId: { name: "Class 5" }, sectionId: { name: "A" },
      assignmentId: { subjectId: { name: "Mathematics" } },
    }] });

    render(<TeacherTimetablePortal />);
    expect(await screen.findByRole("heading", { name: "Teacher workspace" })).toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "Teacher workspace" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My timetable" }));
    expect(await screen.findByText("Science")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print timetable" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.getByText("Lab 2")).toBeInTheDocument();
  });
});