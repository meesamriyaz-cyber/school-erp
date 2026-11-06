import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudentGuardianManagement from "../components/StudentGuardianManagement.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  apiRequest: vi.fn(),
}));

const guardian = {
  _id: "guardian-1",
  firstName: "Imran",
  lastName: "Khan",
  phone: "9999999999",
  email: "imran@example.com",
  status: "active",
};

const link = {
  _id: "student-guardian-1",
  guardianId: guardian,
  relationship: "father",
  isPrimary: true,
  isEmergencyContact: true,
  canPickup: true,
  receivesCommunication: true,
  status: "active",
};

describe("StudentGuardianManagement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiRequest.mockImplementation(async (path) => {
      if (path === "/students/student-1/guardians") return { success: true, data: [] };
      if (path === "/guardians") return { success: true, data: [] };
      return { success: true, data: [] };
    });
  });

  it("creates a guardian and links the new record to the student", async () => {
    const user = userEvent.setup();
    let linkRequests = 0;

    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/students/student-1/guardians" && options.method === "POST") {
        return { success: true, data: { ...link, guardianId: "guardian-2" } };
      }
      if (path === "/guardians" && options.method === "POST") {
        return { success: true, data: { _id: "guardian-2", firstName: "Sara", lastName: "Khan" } };
      }
      if (path === "/students/student-1/guardians") {
        linkRequests += 1;
        return {
          success: true,
          data: linkRequests > 1
            ? [{ ...link, _id: "student-guardian-2", guardianId: { _id: "guardian-2", firstName: "Sara", lastName: "Khan" }, relationship: "mother" }]
            : [],
        };
      }
      if (path === "/guardians") return { success: true, data: [] };
      return { success: true, data: [] };
    });

    render(
      <StudentGuardianManagement
        studentId="student-1"
        accessToken="test-token"
        canManage
      />,
    );

    await screen.findByText("No guardians are linked to this student yet.");
    await user.click(screen.getByRole("button", { name: "Add guardian" }));
    await user.type(screen.getByLabelText("First name *"), "Sara");
    await user.type(screen.getByLabelText("Last name"), "Khan");
    await user.type(screen.getByLabelText("Phone"), "8888888888");
    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.selectOptions(screen.getByLabelText("Relationship *"), "mother");
    await user.click(screen.getByLabelText("Primary guardian"));
    await user.click(screen.getByRole("button", { name: "Save guardian" }));

    await screen.findByText("Sara Khan");
    expect(apiRequest).toHaveBeenCalledWith(
      "/guardians",
      expect.objectContaining({
        method: "POST",
        accessToken: "test-token",
        body: expect.objectContaining({ firstName: "Sara", email: "sara@example.com" }),
      }),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/students/student-1/guardians",
      expect.objectContaining({
        method: "POST",
        accessToken: "test-token",
        body: expect.objectContaining({
          guardianId: "guardian-2",
          relationship: "mother",
          isPrimary: true,
        }),
      }),
    );
  });

  it("updates a guardian relationship and its permissions", async () => {
    const user = userEvent.setup();
    let currentLink = { ...link };

    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/students/student-1/guardians" && options.method === "PATCH") {
        currentLink = { ...currentLink, ...options.body };
        return { success: true, data: currentLink };
      }
      if (path === "/students/student-1/guardians") return { success: true, data: [currentLink] };
      if (path === "/guardians") return { success: true, data: [guardian] };
      return { success: true, data: [] };
    });

    render(
      <StudentGuardianManagement
        studentId="student-1"
        accessToken="test-token"
        canManage
      />,
    );

    await screen.findByText("Imran Khan");
    await user.click(screen.getByRole("button", { name: "Edit relationship" }));
    await user.selectOptions(screen.getByLabelText("Relationship"), "legal_guardian");
    await user.click(screen.getByLabelText("May pick up student"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "/students/student-1/guardians/student-guardian-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.objectContaining({
            relationship: "legal_guardian",
            canPickup: false,
          }),
        }),
      );
    });
    expect(await screen.findByText("Legal guardian")).toBeInTheDocument();
  });

  it("deactivates a relationship without deleting the guardian link", async () => {
    const user = userEvent.setup();
    let currentLink = { ...link };

    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/students/student-1/guardians/student-guardian-1" && options.method === "PATCH") {
        currentLink = { ...currentLink, ...options.body };
        return { success: true, data: currentLink };
      }
      if (path === "/students/student-1/guardians") return { success: true, data: [currentLink] };
      if (path === "/guardians") return { success: true, data: [guardian] };
      return { success: true, data: [] };
    });

    render(
      <StudentGuardianManagement
        studentId="student-1"
        accessToken="test-token"
        canManage
      />,
    );

    await screen.findByText("Imran Khan");
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("inactive")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/students/student-1/guardians/student-guardian-1",
      expect.objectContaining({
        method: "PATCH",
        body: { status: "inactive" },
      }),
    );
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("keeps guardian records read-only when management permission is absent", async () => {
    render(
      <StudentGuardianManagement
        studentId="student-1"
        accessToken="test-token"
        canManage={false}
      />,
    );

    expect(await screen.findByText("No guardians are linked to this student yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add guardian" })).not.toBeInTheDocument();
  });
});
