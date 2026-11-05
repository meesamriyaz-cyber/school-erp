import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SchoolUserDirectory from "../components/SchoolUserDirectory.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "school-admin-token" }),
}));

const response = (data, total = data.length) => ({
  success: true,
  data,
  pagination: { page: 1, limit: 10, total, totalPages: Math.ceil(total / 10) },
});

describe("SchoolUserDirectory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads and displays school users without exposing internal fields", async () => {
    apiRequest.mockResolvedValueOnce(response([{
      id: "user-1",
      firstName: "Ayaan",
      lastName: "Khan",
      email: "ayaan@example.com",
      role: "teacher",
      status: "active",
      lastLoginAt: "2026-11-01T10:00:00.000Z",
      createdAt: "2026-04-01T10:00:00.000Z",
      passwordHash: "must-not-render",
      tenantId: "internal-tenant-id",
    }], 1));

    render(<SchoolUserDirectory />);

    expect(await screen.findAllByText("Ayaan Khan")).not.toHaveLength(0);
    expect(screen.getByText("ayaan@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("Teacher")).not.toHaveLength(0);
    expect(screen.getAllByText("active")).not.toHaveLength(0);
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();
    expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
    expect(screen.queryByText("internal-tenant-id")).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/school/users?page=1&limit=10",
      expect.objectContaining({ accessToken: "school-admin-token", signal: expect.any(AbortSignal) }),
    );
  });

  it("searches users by name or email", async () => {
    apiRequest.mockResolvedValueOnce(response([]));
    apiRequest.mockResolvedValueOnce(response([{
      id: "user-2", firstName: "Sara", lastName: "Ahmad",
      email: "sara@example.com", role: "principal", status: "pending",
    }], 1));

    render(<SchoolUserDirectory />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search school users" }), {
      target: { value: "Sara" },
    });

    await waitFor(() => {
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/school/users?page=1&limit=10&search=Sara",
        expect.any(Object),
      );
    }, { timeout: 2000 });
    expect(await screen.findAllByText("Sara Ahmad")).not.toHaveLength(0);
  });

  it("applies role and status filters to the server query", async () => {
    apiRequest.mockResolvedValueOnce(response([]));
    apiRequest.mockResolvedValueOnce(response([]));
    apiRequest.mockResolvedValueOnce(response([]));

    render(<SchoolUserDirectory />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole("combobox", { name: "Filter users by role" }), {
      target: { value: "teacher" },
    });
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith(
      "/school/users?page=1&limit=10&role=teacher",
      expect.any(Object),
    ));

    fireEvent.change(screen.getByRole("combobox", { name: "Filter users by status" }), {
      target: { value: "suspended" },
    });
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith(
      "/school/users?page=1&limit=10&role=teacher&status=suspended",
      expect.any(Object),
    ));
  });

  it("loads the next page", async () => {
    apiRequest.mockResolvedValueOnce(response(
      Array.from({ length: 10 }, (_, index) => ({
        id: `user-${index + 1}`, firstName: `User${index + 1}`, role: "teacher", status: "active",
      })), 11,
    ));
    apiRequest.mockResolvedValueOnce(response([
      { id: "user-11", firstName: "User11", role: "teacher", status: "active" },
    ], 11));

    render(<SchoolUserDirectory />);
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Showing 11–11 of 11")).toBeInTheDocument();
    expect(screen.getAllByText("User11")).not.toHaveLength(0);
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/school/users?page=2&limit=10",
      expect.objectContaining({ accessToken: "school-admin-token" }),
    );
  });

  it("shows an empty state when no users match", async () => {
    apiRequest.mockResolvedValueOnce(response([]));
    render(<SchoolUserDirectory />);
    expect(screen.getAllByText("No records")).not.toHaveLength(0);
    expect(screen.getAllByText("No users found. Try changing your search or filters.")).not.toHaveLength(0);
  });

  it("shows an error and retries after a failed request", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Service unavailable"));
    apiRequest.mockResolvedValueOnce(response([]));

    render(<SchoolUserDirectory />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("No records")).not.toHaveLength(0);
  });

  it("handles an unexpected response shape", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: null });
    render(<SchoolUserDirectory />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server returned an unexpected response.",
    );
  });

  it("does not display an error for an aborted request", async () => {
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    apiRequest.mockRejectedValueOnce(abortError);
    render(<SchoolUserDirectory />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
