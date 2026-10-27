import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionsManagement from "../components/SectionsManagement.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const activeYear = { _id: "year-a", name: "2026-2027", status: "active" };
const closedYear = { _id: "year-closed", name: "2025-2026", status: "closed" };
const activeClass = { _id: "class-a", academicYearId: "year-a", name: "Class 1", status: "active" };
const sampleSection = { _id: "section-a", classId: "class-a", name: "A", capacity: 35, status: "active" };

describe("SectionsManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "school_admin" } });
  });

  it("loads years, classes, and sections for the active year and class", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleSection] });
    render(<SectionsManagement />);
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.getByLabelText("Academic year")).toHaveValue("year-a");
    expect(screen.getByLabelText("Class")).toHaveValue("class-a");
    expect(apiRequest).toHaveBeenCalledWith("/sections?classId=class-a", expect.objectContaining({ accessToken: "test-token" }));
    expect(screen.getByText("35")).toBeInTheDocument();
  });

  it("creates a section with optional capacity in the selected class", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    apiRequest.mockResolvedValueOnce({ success: true, data: { ...sampleSection } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleSection] });
    render(<SectionsManagement />);
    await screen.findByText("No sections for Class 1");
    await user.click(screen.getByRole("button", { name: /Create section/ }));
    await user.type(screen.getByLabelText("Section name"), "A");
    await user.type(screen.getByLabelText(/Capacity/), "35");
    await user.click(screen.getByRole("button", { name: "Create section" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/sections", expect.objectContaining({
      method: "POST",
      body: { name: "A", capacity: 35, classId: "class-a" },
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Section created successfully.");
  });

  it("allows capacity to be omitted and validates an invalid capacity", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    render(<SectionsManagement />);
    await screen.findByText("No sections for Class 1");
    await user.click(screen.getByRole("button", { name: /Create section/ }));
    await user.type(screen.getByLabelText("Section name"), "B");
    await user.type(screen.getByLabelText(/Capacity/), "501");
    await user.click(screen.getByRole("button", { name: "Create section" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Capacity must be a whole number between 1 and 500.");
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });

  it("requires confirmation before deactivating a section", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleSection] });
    apiRequest.mockResolvedValueOnce({ success: true, data: { ...sampleSection, status: "inactive" } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [{ ...sampleSection, status: "inactive" }] });
    render(<SectionsManagement />);
    await screen.findByText("A");
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Deactivate section?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/sections/section-a", expect.objectContaining({ method: "PATCH", body: { status: "inactive" } })));
  });

  it("keeps teachers read-only", async () => {
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "teacher" } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleSection] });
    render(<SectionsManagement />);
    await screen.findByText("A");
    expect(screen.getByText("You have read-only access to sections.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create section/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("does not allow creating sections for a closed year or inactive class", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [closedYear, activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    render(<SectionsManagement />);
    await screen.findByText("No sections for Class 1");
    await user.selectOptions(screen.getByLabelText("Academic year"), "year-closed");
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/classes?academicYearId=year-closed", expect.anything()));
    expect(screen.queryByRole("button", { name: /Create section/ })).not.toBeInTheDocument();
  });

  it("shows a retry action when academic years fail to load", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<SectionsManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
