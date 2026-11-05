import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SchoolUserDetails from "../components/SchoolUserDetails.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "school-admin-token" }),
}));

const userRecord = {
  id: "user-101",
  firstName: "Ayaan",
  lastName: "Khan",
  email: "ayaan@example.com",
  phone: "9876543210",
  role: "teacher",
  status: "active",
  lastLoginAt: "2026-11-01T10:00:00.000Z",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

describe("SchoolUserDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads and displays the selected user's profile", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: { user: userRecord } });
    render(<SchoolUserDetails userId="user-101" onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Ayaan Khan" })).toBeInTheDocument();
    expect(screen.getByText("ayaan@example.com")).toBeInTheDocument();
    expect(screen.getByText("9876543210")).toBeInTheDocument();
    expect(screen.getByText("Teacher")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/school/users/user-101",
      expect.objectContaining({ accessToken: "school-admin-token", signal: expect.any(AbortSignal) }),
    );
  });

  it("returns to the directory when Back is selected", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    apiRequest.mockResolvedValueOnce({ success: true, data: { user: userRecord } });
    render(<SchoolUserDetails userId="user-101" onBack={onBack} />);

    await user.click(await screen.findByRole("button", { name: /Back to users/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("opens profile editing and saves permitted fields", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({ success: true, data: { user: userRecord } })
      .mockResolvedValueOnce({
        success: true,
        message: "User profile updated",
        data: { user: { ...userRecord, firstName: "Ayaan Updated", phone: "9000000000" } },
      });

    render(<SchoolUserDetails userId="user-101" onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Edit profile/i }));

    await user.clear(screen.getByLabelText("First name"));
    await user.type(screen.getByLabelText("First name"), "Ayaan Updated");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "9000000000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { name: "Ayaan Updated Khan" })).toBeInTheDocument();
    expect(screen.getByText("9000000000")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/school/users/user-101",
      {
        method: "PATCH",
        accessToken: "school-admin-token",
        body: {
          firstName: "Ayaan Updated",
          lastName: "Khan",
          email: "ayaan@example.com",
          phone: "9000000000",
        },
      },
    );
  });

  it("keeps the form open and shows the API error when saving fails", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({ success: true, data: { user: userRecord } })
      .mockRejectedValueOnce(new Error("Email already exists"));

    render(<SchoolUserDetails userId="user-101" onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Edit profile/i }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already exists");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("validates required name and email before sending an update", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: { user: userRecord } });
    render(<SchoolUserDetails userId="user-101" onBack={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /Edit profile/i }));
    await user.clear(screen.getByLabelText("First name"));
    await user.clear(screen.getByLabelText("Email"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("First name is required");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("shows a not-found error and allows returning to the directory", async () => {
    apiRequest.mockRejectedValueOnce(new Error("User not found"));
    render(<SchoolUserDetails userId="missing-user" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("User not found");
    expect(screen.getByRole("button", { name: /Back to users/i })).toBeInTheDocument();
  });

  it("does not expose internal identifiers or authorization fields", async () => {
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: { user: { ...userRecord, tenantId: "tenant-secret", authVersion: 17, passwordHash: "secret-hash" } },
    });
    render(<SchoolUserDetails userId="user-101" onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "Ayaan Khan" });
    expect(screen.queryByText("tenant-secret")).not.toBeInTheDocument();
    expect(screen.queryByText("17")).not.toBeInTheDocument();
    expect(screen.queryByText("secret-hash")).not.toBeInTheDocument();
  });
});
