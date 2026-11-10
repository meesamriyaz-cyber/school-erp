import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: { role: "school_admin" },
}));

vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "admin-token", user: mocks.user }),
}));

import HomeworkManagement from "../components/HomeworkManagement.jsx";

describe("HomeworkManagement submission register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { role: "school_admin" };
    mocks.apiRequest.mockImplementation((path) => {
      const responses = {
        "/academic-years": { data: [{ _id: "year-1", name: "2026–27", status: "active" }] },
        "/classes": { data: [{ _id: "class-1", name: "Class 5", academicYearId: "year-1" }] },
        "/sections": { data: [] },
        "/subjects": { data: [{ _id: "subject-1", name: "Mathematics" }] },
        "/homework": { data: [{
          _id: "homework-1", title: "Chapter 4 exercise", instructions: "Complete questions 1–5.",
          status: "published", assignedDate: "2026-11-01", dueDate: "2026-11-12",
          classId: { name: "Class 5" }, subjectId: { name: "Mathematics" },
        }] },
        "/homework/homework-1/submissions": {
          data: [{
            _id: "submission-1", status: "submitted", answer: "Completed",
            studentId: { firstName: "Amina", lastName: "Khan", admissionNumber: "A-01" },
          }],
          roster: [
            { enrollmentId: "enrollment-1", studentId: { firstName: "Amina", lastName: "Khan", admissionNumber: "A-01" }, submissionId: "submission-1", submissionStatus: "submitted" },
            { enrollmentId: "enrollment-2", studentId: { firstName: "Bilal", lastName: "Khan", admissionNumber: "B-01" }, submissionId: null, submissionStatus: "not_submitted" },
          ],
          summary: { assigned: 2, submitted: 1, pending: 1, reviewed: 0 },
        },
      };
      return Promise.resolve(responses[path] || { data: [] });
    });
  });

  it("shows assigned students, missing submissions and lifecycle totals", async () => {
    render(<HomeworkManagement />);

    expect(await screen.findByText("Chapter 4 exercise")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View submissions" }));

    expect(await screen.findByText("Submission register")).toBeTruthy();
    expect(screen.getByText("Assigned")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Not submitted")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(screen.getByText("Amina Khan · A-01")).toBeTruthy();
    expect(screen.getByText("Bilal Khan · B-01")).toBeTruthy();
    expect(screen.getByText("not submitted")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("refreshes an expanded register without collapsing it", async () => {
    render(<HomeworkManagement />);
    fireEvent.click(await screen.findByRole("button", { name: "View submissions" }));
    await screen.findByText("Submission register");
    const before = mocks.apiRequest.mock.calls.filter(([path]) => path === "/homework/homework-1/submissions").length;

    fireEvent.click(screen.getByRole("button", { name: "Refresh register" }));

    await waitFor(() => {
      const after = mocks.apiRequest.mock.calls.filter(([path]) => path === "/homework/homework-1/submissions").length;
      expect(after).toBe(before + 1);
    });
    expect(screen.getByText("Submission register")).toBeTruthy();
  });
});
