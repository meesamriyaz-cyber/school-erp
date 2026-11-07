import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeacherExaminations from "../components/TeacherExaminations.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

describe("TeacherExaminations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ accessToken: "token" });
    apiRequest.mockImplementation(async (path) => {
      if (path === "/examinations") return { success: true, data: [{ _id: "exam", name: "Midterm", status: "scheduled" }] };
      if (path.endsWith("/teacher-roster")) return { success: true, data: {
        subjects: [{ _id: "config", subjectId: { _id: "math", name: "Math" }, maxMarks: 100 }],
        enrollments: [{ _id: "enroll", sectionId: { _id: "section", name: "A" }, studentId: { firstName: "Ayaan", lastName: "Khan" } }],
        assignments: [{ subjectId: "math", sectionId: "section" }],
      } };
      if (path.endsWith("/marks") && path.startsWith("/examinations")) return { success: true, data: [] };
      return { success: true, count: 1 };
    });
  });

  it("loads assigned exam roster and submits entered marks", async () => {
    const user = userEvent.setup();
    render(<TeacherExaminations />);
    const field = await screen.findByRole("spinbutton", { name: "Marks for Ayaan Khan in Math" });
    await user.type(field, "78");
    await user.click(screen.getByRole("button", { name: "Save marks" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/examinations/exam/marks", expect.objectContaining({
      method: "POST",
      body: { marks: [{ enrollmentId: "enroll", examSubjectId: "config", absent: false, marksObtained: 78 }] },
    })));
  });

  it("does not expose mark inputs outside the teacher section", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/examinations") return { success: true, data: [{ _id: "exam", name: "Midterm", status: "scheduled" }] };
      if (path.endsWith("/teacher-roster")) return { success: true, data: {
        subjects: [{ _id: "config", subjectId: { _id: "math", name: "Math" }, maxMarks: 100 }],
        enrollments: [{ _id: "enroll", sectionId: { _id: "section-b" }, studentId: { firstName: "Ayaan", lastName: "Khan" } }],
        assignments: [{ subjectId: "math", sectionId: "section-a" }],
      } };
      return { success: true, data: [] };
    });
    render(<TeacherExaminations />);
    await screen.findByText("Ayaan Khan");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});
