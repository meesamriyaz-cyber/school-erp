import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "admin-token", user: { role: "school_admin" } }),
}));

import TimetableManagement from "../components/TimetableManagement.jsx";

const year = { _id: "year-1", name: "2026–27", status: "active" };
const schoolClass = { _id: "class-1", name: "Class 5", academicYearId: "year-1" };
const assignment = {
  _id: "assignment-1",
  status: "active",
  academicYearId: { _id: "year-1", name: "2026–27" },
  classId: { _id: "class-1", name: "Class 5" },
  teacherId: { firstName: "Ayaan", lastName: "Khan" },
  subjectId: { name: "Mathematics" },
  sectionId: null,
};
const entry = {
  _id: "entry-1",
  academicYearId: { _id: "year-1", name: "2026–27" },
  classId: { _id: "class-1", name: "Class 5" },
  sectionId: null,
  assignmentId: assignment,
  dayOfWeek: 1,
  periodNumber: 1,
  startTime: "09:00",
  endTime: "09:45",
  room: "Room 4",
  status: "active",
};

describe("TimetableManagement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.apiRequest.mockImplementation((path, options = {}) => {
      if (path === "/academic-years") return Promise.resolve({ success: true, data: [year] });
      if (path === "/classes?status=active") return Promise.resolve({ success: true, data: [schoolClass] });
      if (path === "/teacher-assignments?status=active") return Promise.resolve({ success: true, data: [assignment] });
      if (path.startsWith("/academic-schedule?")) return Promise.resolve({
        success: true,
        data: { periods: [{ periodNumber: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" }], breaks: [] },
      });
      if (path.startsWith("/sections?")) return Promise.resolve({ success: true, data: [] });
      if (path.startsWith("/timetable?")) return Promise.resolve({ success: true, data: [entry] });
      if (path === "/timetable" && options.method === "POST") return Promise.resolve({ success: true, data: entry });
      return Promise.resolve({ success: true, data: [] });
    });
  });

  it("shows the weekly timetable and switches to the detailed list", async () => {
    render(<TimetableManagement />);

    expect(await screen.findByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("Ayaan Khan")).toBeTruthy();
    expect(screen.getAllByText("Class 5").length).toBeGreaterThan(0);
    expect(screen.getByText("Room 4")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("columnheader", { name: "Day" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Teacher" })).toBeTruthy();
  });

  it("creates a period using the selected active assignment and configured bell period", async () => {
    render(<TimetableManagement />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add period" }));

    const form = screen.getByRole("heading", { name: "New timetable period" }).closest("form");
    const formControls = within(form);
    fireEvent.change(formControls.getByLabelText("Academic year"), { target: { value: year._id } });
    await waitFor(() => {
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        `/academic-schedule?academicYearId=${year._id}`,
        expect.objectContaining({ accessToken: "admin-token" }),
      );
      expect(formControls.getByLabelText("Period number").tagName).toBe("SELECT");
    });

    fireEvent.change(formControls.getByLabelText("Class"), { target: { value: schoolClass._id } });
    fireEvent.change(formControls.getByLabelText("Teacher & subject assignment"), { target: { value: assignment._id } });
    fireEvent.click(screen.getByRole("button", { name: "Save period" }));

    await waitFor(() => {
      expect(mocks.apiRequest).toHaveBeenCalledWith("/timetable", expect.objectContaining({
        method: "POST",
        accessToken: "admin-token",
        body: expect.objectContaining({
          academicYearId: year._id,
          classId: schoolClass._id,
          assignmentId: assignment._id,
          periodNumber: 1,
          startTime: "09:00",
          endTime: "09:45",
        }),
      }));
    });
    expect(await screen.findByRole("status")).toBeTruthy();
  });
});
