import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassesManagement from "../components/ClassesManagement.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const activeYear = { _id: "year-a", name: "2026-2027", startDate: "2026-04-01T00:00:00.000Z", endDate: "2027-03-31T00:00:00.000Z", status: "active" };
const draftYear = { _id: "year-b", name: "2027-2028", startDate: "2027-04-01T00:00:00.000Z", endDate: "2028-03-31T00:00:00.000Z", status: "draft" };
const sampleClass = { _id: "class-a", academicYearId: "year-a", name: "Class 1", sortOrder: 1, status: "active" };

describe("ClassesManagement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "school_admin" } });
  });

  it("loads academic years and classes for the active year", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [draftYear, activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleClass] });
    render(<ClassesManagement />);
    expect(await screen.findByText("Class 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Academic year")).toHaveValue("year-a");
    expect(apiRequest).toHaveBeenCalledWith("/classes?academicYearId=year-a", expect.objectContaining({ accessToken: "test-token" }));
  });

  it("creates a class within the selected academic year", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    apiRequest.mockResolvedValueOnce({ success: true, data: { ...sampleClass } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleClass] });
    render(<ClassesManagement />);
    await screen.findByText("No classes for 2026-2027");
    await user.click(screen.getByRole("button", { name: /Create class/ }));
    await user.type(screen.getByLabelText("Class name"), "Class 1");
    await user.clear(screen.getByLabelText(/Display order/));
    await user.type(screen.getByLabelText(/Display order/), "1");
    await user.click(screen.getByRole("button", { name: "Create class" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/classes", expect.objectContaining({
      method: "POST",
      body: { name: "Class 1", sortOrder: 1, academicYearId: "year-a" },
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Class created successfully.");
  });

  it("validates class name and sort order before submitting", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    render(<ClassesManagement />);
    await screen.findByText("No classes for 2026-2027");
    await user.click(screen.getByRole("button", { name: /Create class/ }));
    await user.type(screen.getByLabelText("Class name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create class" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a class name.");
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation before deactivating a class", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleClass] });
    apiRequest.mockResolvedValueOnce({ success: true, data: { ...sampleClass, status: "inactive" } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [{ ...sampleClass, status: "inactive" }] });
    render(<ClassesManagement />);
    await screen.findByText("Class 1");
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Deactivate class?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/classes/class-a", expect.objectContaining({ method: "PATCH", body: { status: "inactive" } })));
  });

  it("keeps teachers read-only", async () => {
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "teacher" } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [activeYear] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [sampleClass] });
    render(<ClassesManagement />);
    await screen.findByText("Class 1");
    expect(screen.getByText("You have read-only access to classes.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create class/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("does not allow creating classes for a closed academic year", async () => {
    const closed = { ...activeYear, status: "closed" };
    apiRequest.mockResolvedValueOnce({ success: true, data: [closed] });
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    render(<ClassesManagement />);
    await screen.findByText("This academic year is closed. New classes cannot be created.");
    expect(screen.queryByRole("button", { name: /Create class/ })).not.toBeInTheDocument();
  });

  it("shows a retry action when academic years fail to load", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<ClassesManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
