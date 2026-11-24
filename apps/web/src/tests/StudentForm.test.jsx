import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import StudentForm from "../components/StudentForm.jsx";
import { apiRequest } from "../lib/api.js";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({ useAuth: () => ({ accessToken: "test-access-token" }) }));

describe("StudentForm", () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const year = { _id: "year-1", name: "2026-27", status: "active" };
  const schoolClass = { _id: "class-1", name: "Class 1", status: "active" };

  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockImplementation(async (path) => {
      if (path === "/academic-years?status=active") return { success: true, data: [year] };
      if (path === "/classes?academicYearId=year-1&status=active") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-1&status=active") return { success: true, data: [] };
      return { success: true, data: [] };
    });
  });

  it("requires student, guardian and initial academic placement", async () => {
    render(<StudentForm onClose={onClose} onCreated={onCreated} />);
    expect(screen.getByRole("dialog", { name: "Add student" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Admission number/i)).toBeRequired();
    expect(screen.getByLabelText(/First name/i)).toBeRequired();
    expect(screen.getByLabelText(/Primary guardian name/i)).toBeRequired();
    expect(await screen.findByLabelText("Academic year *")).toHaveValue("year-1");
    expect(await screen.findByLabelText("Class *")).toHaveValue("class-1");
    expect(screen.getByLabelText("Section (optional)")).toHaveValue("");
  });

  it("creates a student and then creates their academic enrollment", async () => {
    const user = userEvent.setup();
    const student = { _id: "student-1", firstName: "Ayaan", status: "active" };
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years?status=active") return { success: true, data: [year] };
      if (path === "/classes?academicYearId=year-1&status=active") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-1&status=active") return { success: true, data: [] };
      if (path === "/students" && options.method === "POST") return { success: true, data: student };
      if (path === "/enrollments" && options.method === "POST") return { success: true, data: { _id: "enrollment-1" } };
      return { success: true, data: [] };
    });
    render(<StudentForm onClose={onClose} onCreated={onCreated} />);
    await user.type(screen.getByLabelText(/Admission number/i), " ADM-101 ");
    await user.type(screen.getByLabelText(/First name/i), " Ayaan ");
    await user.type(screen.getByLabelText(/Primary guardian name/i), " Imran Khan ");
    await user.click(await screen.findByRole("button", { name: "Save student & placement" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(student));
    expect(apiRequest).toHaveBeenCalledWith("/students", expect.objectContaining({
      method: "POST", accessToken: "test-access-token",
      body: expect.objectContaining({ admissionNumber: "ADM-101", firstName: "Ayaan", guardianName: "Imran Khan" }),
    }));
    expect(apiRequest).toHaveBeenCalledWith("/enrollments", expect.objectContaining({
      method: "POST", accessToken: "test-access-token",
      body: { studentId: "student-1", academicYearId: "year-1", classId: "class-1", sectionId: null, enrollmentDate: expect.any(String), reAdmissionReason: "" },
    }));
  });

  it("does not duplicate the student when enrollment needs to be retried", async () => {
    const user = userEvent.setup();
    const student = { _id: "student-1", firstName: "Sara" };
    let enrollmentAttempts = 0;
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years?status=active") return { success: true, data: [year] };
      if (path === "/classes?academicYearId=year-1&status=active") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-1&status=active") return { success: true, data: [] };
      if (path === "/students" && options.method === "POST") return { success: true, data: student };
      if (path === "/enrollments" && options.method === "POST") {
        enrollmentAttempts += 1;
        if (enrollmentAttempts === 1) throw new Error("Section capacity reached");
        return { success: true, data: { _id: "enrollment-1" } };
      }
      return { success: true, data: [] };
    });
    render(<StudentForm onClose={onClose} onCreated={onCreated} />);
    await user.type(screen.getByLabelText(/Admission number/i), "ADM-202");
    await user.type(screen.getByLabelText(/First name/i), "Sara");
    await user.type(screen.getByLabelText(/Primary guardian name/i), "Imran Khan");
    await user.click(await screen.findByRole("button", { name: "Save student & placement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Section capacity reached");
    await user.click(screen.getByRole("button", { name: "Retry placement" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(student));
    expect(apiRequest.mock.calls.filter(([path, options]) => path === "/students" && options?.method === "POST")).toHaveLength(1);
    expect(enrollmentAttempts).toBe(2);
  });

  it("closes the form when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<StudentForm onClose={onClose} onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
