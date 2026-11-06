import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TeacherTimetablePortal from "../components/TeacherTimetablePortal.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "teacher-token", user: { firstName: "Ayaan", lastName: "Khan" }, logout: vi.fn() }),
}));

describe("TeacherTimetablePortal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the teacher weekly schedule returned by the scoped timetable API", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [{
      _id: "period-1", dayOfWeek: 1, periodNumber: 1, startTime: "09:00", endTime: "09:45", room: "Room 4",
      classId: { name: "Class 5" }, sectionId: { name: "A" },
      assignmentId: { subjectId: { name: "Mathematics" } },
    }] });

    render(<TeacherTimetablePortal />);
    expect(await screen.findByRole("heading", { name: "My weekly timetable" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Class 5 · Section A")).toBeInTheDocument();
    expect(screen.getByText("Room 4")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/timetable", { accessToken: "teacher-token", signal: expect.any(AbortSignal) });
  });
});