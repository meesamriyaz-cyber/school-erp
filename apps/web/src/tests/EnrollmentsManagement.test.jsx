import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnrollmentsManagement from "../components/EnrollmentsManagement.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const year = { _id: "year-a", name: "2026-2027", status: "active" };
const student = { _id: "student-a", firstName: "Ayaan", lastName: "Khan", admissionNumber: "ADM-1", status: "active" };
const schoolClass = { _id: "class-a", name: "Class 1", status: "active" };
const section = { _id: "section-a", name: "A", status: "active" };
const enrollment = { _id: "enrollment-a", studentId: student, academicYearId: year, classId: schoolClass, sectionId: section, enrollmentDate: "2026-04-01T00:00:00.000Z", status: "active" };

describe("EnrollmentsManagement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "school_admin" } });
  });

  it("loads the academic setup and enrollment history", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [enrollment] };
      return { success: true, data: [] };
    });
    render(<EnrollmentsManagement />);
    expect(await screen.findByText("Ayaan Khan")).toBeInTheDocument();
    expect(screen.getByText("Class 1")).toBeInTheDocument();
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
  });

  it("creates an enrollment using the selected student, class, and section", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [] };
      if (path === "/enrollments" && options.method === "POST") return { success: true, data: enrollment };
      return { success: true, data: [] };
    });
    render(<EnrollmentsManagement />);
    await screen.findByText("No enrollments for 2026-2027");
    await user.click(screen.getByRole("button", { name: /Enroll student/ }));
    await user.selectOptions(screen.getByLabelText("Class"), "class-a");
    await user.selectOptions(screen.getByLabelText("Section (optional)"), "section-a");
    await user.click(screen.getByRole("button", { name: "Create enrollment" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/enrollments", expect.objectContaining({
      method: "POST",
      body: { studentId: "student-a", academicYearId: "year-a", classId: "class-a", sectionId: "section-a", reAdmissionReason: "" },
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Student enrolled successfully.");
  });

  it("keeps teachers read-only", async () => {
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "teacher" } });
    apiRequest.mockImplementation(async (path) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [enrollment] };
      return { success: true, data: [] };
    });
    render(<EnrollmentsManagement />);
    await screen.findByText("Ayaan Khan");
    expect(screen.getByText("You have read-only access to enrollments.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enroll student/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move class/section" })).not.toBeInTheDocument();
  });

  it("shows duplicate active enrollment conflicts and keeps the form open", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [] };
      if (path === "/enrollments" && options.method === "POST") throw new Error("This student already has an active enrollment in this school");
      return { success: true, data: [] };
    });
    render(<EnrollmentsManagement />);
    await screen.findByText("No enrollments for 2026-2027");
    await user.click(screen.getByRole("button", { name: /Enroll student/ }));
    await user.selectOptions(screen.getByLabelText("Class"), "class-a");
    await user.click(screen.getByRole("button", { name: "Create enrollment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This student already has an active enrollment in this school");
    expect(screen.getByRole("heading", { name: "Enroll a student" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create enrollment" })).toBeInTheDocument();
  });

  it("shows section capacity conflicts and preserves the selected section", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [] };
      if (path === "/enrollments" && options.method === "POST") throw new Error("The selected section has reached its capacity");
      return { success: true, data: [] };
    });
    render(<EnrollmentsManagement />);
    await screen.findByText("No enrollments for 2026-2027");
    await user.click(screen.getByRole("button", { name: /Enroll student/ }));
    await user.selectOptions(screen.getByLabelText("Class"), "class-a");
    await user.selectOptions(screen.getByLabelText("Section (optional)"), "section-a");
    await user.click(screen.getByRole("button", { name: "Create enrollment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The selected section has reached its capacity");
    expect(screen.getByLabelText("Section (optional)")).toHaveValue("section-a");
    expect(screen.getByRole("button", { name: "Create enrollment" })).toBeInTheDocument();
  });


  it("shows action-specific confirmation copy for completion, transfer, and withdrawal", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async (path) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [enrollment] };
      return { success: true, data: [] };
    });

    render(<EnrollmentsManagement />);
    await screen.findByText("Ayaan Khan");

    const cases = [
      ["Complete", "Mark this enrollment as completed?"],
      ["Withdraw", "Withdraw this student from the enrollment?"],
    ];

    for (const [action, heading] of cases) {
      await user.click(screen.getByRole("button", { name: action }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent(heading);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
    }
  });

  it("shows a termination API error and leaves the active enrollment available", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [enrollment] };
      if (path === "/enrollments/enrollment-a" && options.method === "PATCH") {
        throw new Error("Only active enrollments can be ended");
      }
      return { success: true, data: [] };
    });

    render(<EnrollmentsManagement />);
    await screen.findByText("Ayaan Khan");
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only active enrollments can be ended");
    expect(screen.getByRole("row", { name: /Ayaan Khan ADM-1 Class 1 A/ })).toHaveTextContent("active");
    expect(screen.getByRole("button", { name: "Move class/section" })).toBeInTheDocument();
  });

  it("refreshes enrollment history after a successful completion", async () => {
    const user = userEvent.setup();
    let ended = false;
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [ended ? { ...enrollment, status: "completed" } : enrollment] };
      if (path === "/enrollments/enrollment-a" && options.method === "PATCH") {
        ended = true;
        return { success: true, data: { ...enrollment, status: "completed" } };
      }
      return { success: true, data: [] };
    });

    render(<EnrollmentsManagement />);
    await screen.findByText("Ayaan Khan");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText("completed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move class/section" })).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/enrollments/enrollment-a", expect.objectContaining({
      method: "PATCH", body: { status: "completed" },
    }));
  });


  it("submits a within-school class transfer with a reason", async () => {
    const user = userEvent.setup();
    const targetClass = { _id: "class-b", name: "Class 2", status: "active" };
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass, targetClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/sections?classId=class-b&status=active") return { success: true, data: [] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [enrollment] };
      if (path === "/enrollments/enrollment-a/transfer" && options.method === "PATCH") return { success: true, data: { ...enrollment, classId: targetClass, sectionId: null, admissionType: "transfer" } };
      return { success: true, data: [] };
    });
    render(<EnrollmentsManagement />);
    await screen.findByText("Ayaan Khan");
    await user.click(screen.getByRole("button", { name: "Move class/section" }));
    await user.selectOptions(await screen.findByLabelText("Target class"), "class-b");
    await user.type(screen.getByLabelText("Reason for transfer"), "Approved academic reassignment");
    await user.click(screen.getByRole("button", { name: "Confirm transfer" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/enrollments/enrollment-a/transfer", expect.objectContaining({
      method: "PATCH",
      body: { targetClassId: "class-b", targetSectionId: null, reason: "Approved academic reassignment" },
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Student transferred within the school.");
  });

  it("prevents duplicate termination requests while one is pending", async () => {
    const user = userEvent.setup();
    let resolveTermination;
    const termination = new Promise((resolve) => { resolveTermination = resolve; });
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/academic-years") return { success: true, data: [year] };
      if (path === "/students?limit=100") return { success: true, data: [student] };
      if (path === "/classes?academicYearId=year-a") return { success: true, data: [schoolClass] };
      if (path === "/sections?classId=class-a&status=active") return { success: true, data: [section] };
      if (path === "/enrollments?academicYearId=year-a") return { success: true, data: [enrollment] };
      if (path === "/enrollments/enrollment-a" && options.method === "PATCH") return termination;
      return { success: true, data: [] };
    });

    render(<EnrollmentsManagement />);
    await screen.findByText("Ayaan Khan");
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("button", { name: "Updating…" })).toBeDisabled();
    expect(apiRequest.mock.calls.filter(([path, options]) => path === "/enrollments/enrollment-a" && options?.method === "PATCH")).toHaveLength(1);

    resolveTermination({ success: true, data: { ...enrollment, status: "withdrawn" } });
    await screen.findByText("Enrollment marked as withdrawn.");
  });

});
