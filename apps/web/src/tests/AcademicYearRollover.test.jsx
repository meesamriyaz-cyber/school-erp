import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AcademicYearRollover from "../components/AcademicYearRollover.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const source = { _id: "source", name: "2026-2027", status: "active" };
const target = { _id: "target", name: "2027-2028", status: "draft" };
const student = { _id: "student-1", firstName: "Ayaan", lastName: "Khan", admissionNumber: "ADM-1" };
const enrollment = { _id: "enrollment-1", studentId: student, classId: { _id: "old-class", name: "Class 4", sortOrder: 4 }, sectionId: null };
const preview = {
  sourceYear: source, targetYear: target, eligibleCount: 1, enrollments: [enrollment],
  targetClasses: [{ _id: "new-class", name: "Class 5", sortOrder: 5 }],
  targetSections: [{ _id: "new-section", classId: "new-class", name: "A", capacity: 30 }],
};

describe("AcademicYearRollover", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ accessToken: "token", user: { role: "school_admin" } });
    apiRequest.mockImplementation(async (path) => {
      if (path === "/academic-years") return { success: true, data: [source, target] };
      if (path.startsWith("/enrollments/promotion-preview")) return { success: true, data: preview };
      return { success: true, data: { promoted: 1, retained: 0, transferred: 0, withdrawn: 0, targetAcademicYear: { _id: "target", name: "2027-2028" } } };
    });
  });

  it("previews placements and executes the confirmed rollover", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<AcademicYearRollover onComplete={onComplete} />);
    await screen.findByRole("option", { name: "2026-2027" });
    await user.click(screen.getByRole("button", { name: "Prepare preview" }));
    expect(await screen.findByText("Ayaan Khan")).toBeInTheDocument();
    expect(screen.getByLabelText("Target class for Ayaan Khan")).toHaveValue("new-class");
    await user.click(screen.getByRole("button", { name: "Review and confirm rollover" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Confirm academic-year rollover?");
    await user.click(screen.getByRole("button", { name: "Confirm rollover" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/enrollments/rollover", expect.objectContaining({
      method: "POST",
      body: {
        sourceAcademicYearId: "source", targetAcademicYearId: "target",
        placements: [{ enrollmentId: "enrollment-1", outcome: "promote", classId: "new-class", sectionId: null }],
      },
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("1 promoted");
    expect(onComplete).toHaveBeenCalled();
  });

  it("allows individual retention and transfer decisions", async () => {
    const user = userEvent.setup();
    render(<AcademicYearRollover />);
    await screen.findByRole("option", { name: "2026-2027" });
    await user.click(screen.getByRole("button", { name: "Prepare preview" }));
    await screen.findByText("Ayaan Khan");
    await user.selectOptions(screen.getByLabelText("Decision for Ayaan Khan"), "transfer");
    expect(screen.getByLabelText("Target class for Ayaan Khan")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and confirm rollover" })).toBeEnabled();
  });

  it("keeps the preview available when the rollover API rejects the request", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async (path) => {
      if (path === "/academic-years") return { success: true, data: [source, target] };
      if (path.startsWith("/enrollments/promotion-preview")) return { success: true, data: preview };
      throw new Error("A target section does not have enough capacity");
    });
    render(<AcademicYearRollover />);
    await screen.findByRole("option", { name: "2026-2027" });
    await user.click(screen.getByRole("button", { name: "Prepare preview" }));
    await screen.findByText("Ayaan Khan");
    await user.click(screen.getByRole("button", { name: "Review and confirm rollover" }));
    await user.click(screen.getByRole("button", { name: "Confirm rollover" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A target section does not have enough capacity");
    expect(screen.getByText("Ayaan Khan")).toBeInTheDocument();
  });
});
