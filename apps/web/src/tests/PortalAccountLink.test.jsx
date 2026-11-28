import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PortalAccountLink from "../components/PortalAccountLink.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "test-token" }),
}));

describe("PortalAccountLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links a student record to an active student account", async () => {
    apiRequest
      .mockResolvedValueOnce({ success: true, data: [{ id: "user-1", firstName: "Ayaan", email: "ayaan@example.test" }] })
      .mockResolvedValueOnce({ success: true, data: { _id: "student-1", userId: "user-1" } });
    const onLinked = vi.fn();
    render(<PortalAccountLink record={{ _id: "student-1" }} recordType="student" onLinked={onLinked} />);

    fireEvent.click(screen.getByRole("button", { name: "Link portal account" }));
    await screen.findByRole("option", { name: "Ayaan · ayaan@example.test" });
    fireEvent.change(screen.getByRole("combobox", { name: "Student login account" }), { target: { value: "user-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm link" }));

    await waitFor(() => expect(onLinked).toHaveBeenCalledWith({ _id: "student-1", userId: "user-1" }));
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/school/users?role=student&status=active&limit=100&page=1", { accessToken: "test-token" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/students/student-1/account", {
      method: "POST", accessToken: "test-token", body: { userId: "user-1" },
    });
  });

  it("limits guardian choices to the matching email address", async () => {
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: [
        { id: "parent-1", firstName: "Imran", email: "imran@example.test" },
        { id: "parent-2", firstName: "Other", email: "other@example.test" },
      ],
    });
    render(<PortalAccountLink record={{ _id: "guardian-1", email: "IMRAN@example.test" }} recordType="guardian" />);
    fireEvent.click(screen.getByRole("button", { name: "Link portal account" }));

    expect(await screen.findByRole("option", { name: "Imran · imran@example.test" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Other · other@example.test" })).not.toBeInTheDocument();
  });

  it("shows linked state without offering a second account link", () => {
    render(<PortalAccountLink record={{ _id: "student-1", userId: "user-1" }} recordType="student" />);
    expect(screen.getByRole("status")).toHaveTextContent("Portal account linked");
    expect(screen.queryByRole("button", { name: "Link portal account" })).not.toBeInTheDocument();
  });
});
