import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  logout: vi.fn(),
  user: { role: "parent", firstName: "Parent", lastName: "Account" },
  accessToken: "access-token",
}));

vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ user: mocks.user, accessToken: mocks.accessToken, logout: mocks.logout }),
}));

import StudentResultsPortal from "../components/StudentResultsPortal.jsx";

describe("Parent school communications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { role: "parent", firstName: "Parent", lastName: "Account" };
    mocks.apiRequest.mockImplementation((path) => Promise.resolve(
      path === "/portal/notifications" ? { success: true, data: [], unreadCount: 0 } : { success: true, data: [] },
    ));
  });

  it("shows only notices, notifications and messages for parent accounts", async () => {
    render(<StudentResultsPortal />);
    expect(await screen.findByRole("heading", { name: "School communications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Notices/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Messages" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Results" })).not.toBeInTheDocument();
    expect(mocks.apiRequest).toHaveBeenCalledWith("/portal/announcements", expect.objectContaining({ accessToken: "access-token" }));
    expect(mocks.apiRequest).toHaveBeenCalledWith("/portal/notifications", expect.objectContaining({ accessToken: "access-token" }));
  });

  it("renders school notices returned by the parent communication endpoint", async () => {
    mocks.apiRequest.mockImplementation((path) => Promise.resolve({
      success: true,
      data: path === "/portal/announcements" ? [{
        _id: "notice-1", title: "Parent meeting", body: "Please attend the meeting on Friday.",
        category: "event", publishedAt: "2026-11-08T09:00:00.000Z",
      }] : [],
    }));
    render(<StudentResultsPortal />);
    expect(await screen.findByText("Parent meeting")).toBeInTheDocument();
    expect(screen.getByText("Please attend the meeting on Friday.")).toBeInTheDocument();
  });

  it("marks a parent notification as read", async () => {
    mocks.apiRequest.mockImplementation((path) => {
      if (path === "/portal/notifications") return Promise.resolve({
        success: true,
        data: [{ _id: "notification-a", title: "Parent meeting", body: "Please attend.", createdAt: "2026-11-09T09:00:00.000Z", readAt: null }],
        unreadCount: 1,
      });
      if (path === "/portal/notifications/notification-a/read") return Promise.resolve({ success: true, data: { readAt: "2026-11-09T10:00:00.000Z" } });
      return Promise.resolve({ success: true, data: [] });
    });
    render(<StudentResultsPortal />);
    expect(await screen.findByText("Parent meeting")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull());
    expect(mocks.apiRequest).toHaveBeenCalledWith("/portal/notifications/notification-a/read", {
      method: "PATCH", accessToken: "access-token",
    });
  });
});
