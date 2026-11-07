import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  logout: vi.fn(),
  user: { role: "parent", firstName: "Parent", lastName: "Account" },
  accessToken: "access-token",
}));

vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({
    user: mocks.user,
    accessToken: mocks.accessToken,
    logout: mocks.logout,
  }),
}));

import StudentResultsPortal from "../components/StudentResultsPortal.jsx";

describe("StudentResultsPortal family overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { role: "parent", firstName: "Parent", lastName: "Account" };
    mocks.apiRequest.mockImplementation((path) => {
      const responses = {
        "/portal/children": {
          data: [
            {
              student: { _id: "student-a", firstName: "Amina", lastName: "Khan", admissionNumber: "A-01" },
              currentEnrollment: { classId: { name: "Class 5" }, sectionId: { name: "A" } },
            },
            {
              student: { _id: "student-b", firstName: "Bilal", lastName: "Khan", admissionNumber: "B-01" },
              currentEnrollment: { classId: { name: "Class 2" }, sectionId: { name: "B" } },
            },
          ],
        },
        "/portal/results": { data: [] },
        "/portal/homework": { data: [] },
        "/portal/homework-submissions": { data: [] },
        "/portal/attendance": {
          data: [
            { _id: "attendance-a", student: { _id: "student-a", firstName: "Amina" }, date: "2026-11-01", status: "present" },
            { _id: "attendance-b", student: { _id: "student-b", firstName: "Bilal" }, date: "2026-11-02", status: "absent" },
          ],
        },
        "/portal/fees": { data: [] },
        "/portal/timetable": { data: [] },
      };
      return Promise.resolve(responses[path] || { data: [] });
    });
  });

  it("shows all linked children and filters the detail view to the selected child", async () => {
    render(<StudentResultsPortal />);

    expect(await screen.findByText("Family learning overview")).toBeTruthy();
    expect(screen.getByText("Amina Khan")).toBeTruthy();
    expect(screen.getByText("Bilal Khan")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    expect(await screen.findByText("Attendance history")).toBeTruthy();
    expect(screen.getByText("Amina")).toBeTruthy();
    expect(screen.getByText("Bilal")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Select child" }), {
      target: { value: "student-a" },
    });

    await waitFor(() => {
      expect(screen.getByText("Amina")).toBeTruthy();
      expect(screen.queryByText("Bilal")).toBeNull();
    });
  });
});
