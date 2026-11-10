import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CertificatesReports from "../components/CertificatesReports.jsx";

const apiRequest = vi.fn();
vi.mock("../lib/api.js", () => ({ apiRequest: (...args) => apiRequest(...args) }));
vi.mock("../context/authContext.js", () => ({ useAuth: () => ({ accessToken: "test-token" }) }));

describe("CertificatesReports", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/students?limit=100") return { success: true, data: [{ _id: "student-1", admissionNumber: "A-1", firstName: "Amina", lastName: "Khan" }] };
      if (path === "/academic-years") return { success: true, data: [{ _id: "year-1", name: "2026-27", status: "active" }] };
      if (path === "/certificates?limit=100") return { success: true, data: [] };
      if (path === "/enrollments?studentId=student-1") return { success: true, data: [{ _id: "enrollment-1", academicYearId: { name: "2026-27" }, classId: { name: "Class 5" }, status: "active" }] };
      if (path === "/certificates" && options.method === "POST") return { success: true, data: {
        _id: "certificate-1", certificateNumber: "BON/2026/00001", type: "bonafide",
        issuedAt: "2026-11-10T00:00:00.000Z", verificationCode: "a".repeat(36),
        snapshot: { school: "Test School", studentName: "Amina Khan", admissionNumber: "A-1", className: "Class 5", academicYear: "2026-27" },
      }};
      return { success: true, data: [] };
    });
  });

  it("loads students and issues a certificate using selected school records", async () => {
    render(<CertificatesReports />);
    await screen.findByText("A-1 — Amina Khan");
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "student-1" } });
    await screen.findByText(/Class 5/);
    fireEvent.change(screen.getByLabelText("Enrollment"), { target: { value: "enrollment-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue certificate" }));
    await screen.findByText("BON/2026/00001");
    expect(apiRequest).toHaveBeenCalledWith("/certificates", expect.objectContaining({
      method: "POST", accessToken: "test-token",
      body: { studentId: "student-1", enrollmentId: "enrollment-1", type: "bonafide", reason: "", remarks: "" },
    }));
    expect(screen.getByText(/Amina Khan/)).toBeTruthy();
  });

  it("switches to reports and requests the selected student's academic history", async () => {
    render(<CertificatesReports />);
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    await screen.findByLabelText("Report type");
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "student-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/reports/student-history?studentId=student-1", expect.objectContaining({ accessToken: "test-token" })));
  });
});
