import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), role: "school_admin" }));
vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "access-token", user: { role: mocks.role } }),
}));

import AnnouncementManagement from "../components/AnnouncementManagement.jsx";

describe("AnnouncementManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "school_admin";
    mocks.apiRequest.mockImplementation((path) => {
      if (path === "/academic-years") return Promise.resolve({ success: true, data: [{ _id: "year-1", name: "2026-27", status: "active" }] });
      if (path.startsWith("/classes?")) return Promise.resolve({ success: true, data: [{ _id: "class-1", name: "Class 5", status: "active" }] });
      if (path.startsWith("/sections?")) return Promise.resolve({ success: true, data: [{ _id: "section-1", name: "A", status: "active" }] });
      if (path === "/announcements") return Promise.resolve({ success: true, data: [] });\n      if (path === "/teacher-assignments?status=active") return Promise.resolve({ success: true, data: [{ classId: "class-1", sectionId: null }] });
      return Promise.resolve({ success: true, data: {} });
    });
  });

  it("creates a school-wide announcement as a draft", async () => {
    render(<AnnouncementManagement />);
    await waitFor(() => expect(screen.queryByText("Loading announcements…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /New announcement/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "School holiday" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "The school will remain closed on Friday." } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/announcements", expect.objectContaining({
      method: "POST",
      accessToken: "access-token",
      body: expect.objectContaining({
        title: "School holiday", audienceType: "SCHOOL", academicYearId: "year-1",
      }),
    })));
  });

  it("restricts teacher audience choices to class or section", async () => {
    mocks.role = "teacher";
    render(<AnnouncementManagement />);
    await waitFor(() => expect(screen.queryByText("Loading announcements…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /New announcement/ }));
    const audience = screen.getByLabelText("Audience");
    expect(Array.from(audience.options).map((option) => option.value)).toEqual(["CLASS", "SECTION"]);
    expect(screen.queryByRole("option", { name: "Entire school" })).toBeNull();
  });
});
