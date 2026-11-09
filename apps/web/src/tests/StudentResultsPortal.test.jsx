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
        "/portal/profile": {
          data: [
            {
              student: {
                _id: "student-a", firstName: "Amina", lastName: "Khan",
                admissionNumber: "A-01", dateOfBirth: "2015-04-12",
                admissionDate: "2022-03-01", gender: "female", status: "active",
                address: { city: "Srinagar", district: "Srinagar", state: "Jammu and Kashmir" },
                guardianName: "Parent One", guardianRelationship: "mother",
                guardianPhone: "9999999999", guardianEmail: "parent@example.test",
              },
              currentEnrollment: { classId: { name: "Class 5" }, sectionId: { name: "A" }, academicYearId: { name: "2026–27" } },
            },
            {
              student: {
                _id: "student-b", firstName: "Bilal", lastName: "Khan",
                admissionNumber: "B-01", dateOfBirth: "2018-06-15",
                admissionDate: "2024-03-01", gender: "male", status: "active",
                guardianName: "Parent One", guardianRelationship: "father",
              },
              currentEnrollment: { classId: { name: "Class 2" }, sectionId: { name: "B" }, academicYearId: { name: "2026–27" } },
            },
          ],
        },
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
    expect(screen.getByRole("button", { name: /Amina Khan/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bilal Khan/ })).toBeTruthy();

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

  it("shows the authorized student profile and filters it by the selected child", async () => {
    render(<StudentResultsPortal />);

    expect(await screen.findByText("Family learning overview")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));

    expect(await screen.findByText("STUDENT PROFILE")).toBeTruthy();
    expect(screen.getByText("Srinagar, Srinagar, Jammu and Kashmir")).toBeTruthy();
    expect(screen.getByText("9999999999 · parent@example.test")).toBeTruthy();
    expect(screen.getByText("Class 5 · A · 2026–27")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Select child" }), {
      target: { value: "student-b" },
    });

    await waitFor(() => {
      expect(screen.getByText("Bilal Khan")).toBeTruthy();
      expect(screen.queryByText("Srinagar, Srinagar, Jammu and Kashmir")).toBeNull();
    });
  });

  it("renders academic context and subject remarks on a published report card", async () => {
    mocks.apiRequest.mockImplementation((path) => Promise.resolve({
      data: path === "/portal/results" ? [{
        school: { name: "Green Valley School", contactEmail: "office@example.test" },
        examination: {
          _id: "exam-a",
          name: "Mid Term",
          startDate: "2026-09-01",
          endDate: "2026-09-10",
          academicYear: { name: "2026-27" },
          class: { name: "Class 5" },
          section: { name: "A" },
          gradingScale: "School bands 2026",
        },
        student: { _id: "student-a", firstName: "Amina", lastName: "Khan", admissionNumber: "A-01" },
        result: {
          enrollmentId: "enroll-a",
          subjects: [{
            examSubjectId: "subject-a",
            subject: { name: "Mathematics" },
            maxMarks: 100,
            passMarks: 35,
            marksObtained: 82,
            percentage: 82,
            grade: "B",
            absent: false,
            status: "passed",
            remarks: "Good progress",
          }],
          totalObtained: 82,
          totalMaximum: 100,
          percentage: 82,
          grade: "B",
          status: "passed",
        },
      }] : [],
    }));

    render(<StudentResultsPortal />);

    expect(await screen.findByText("Mid Term")).toBeTruthy();
    expect(screen.getByText("Green Valley School")).toBeTruthy();
    expect(screen.getByText("office@example.test")).toBeTruthy();
    expect(screen.getByText("2026-27")).toBeTruthy();
    expect(screen.getByText("Class 5")).toBeTruthy();
    expect(screen.getByText("A", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("Good progress")).toBeTruthy();
    expect(screen.getByText("Grading scale: School bands 2026")).toBeTruthy();
    expect(screen.getAllByText("B")).toHaveLength(2);
  });
});
