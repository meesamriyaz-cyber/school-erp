import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AcademicYearManagement from "../components/AcademicYearManagement.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const active = { _id: "year-a", name: "2026-2027", startDate: "2026-04-01T00:00:00.000Z", endDate: "2027-03-31T00:00:00.000Z", status: "active" };
const draft = { _id: "year-b", name: "2027-2028", startDate: "2027-04-01T00:00:00.000Z", endDate: "2028-03-31T00:00:00.000Z", status: "draft" };

describe("AcademicYearManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "school_admin" } });
  });

  it("lists academic years and highlights the active year", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [active, draft] });
    render(<AcademicYearManagement />);
    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
    expect(screen.getByText("2027-2028")).toBeInTheDocument();
    expect(screen.getByText("Current active academic year")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/academic-years", expect.objectContaining({ accessToken: "test-token" }));
  });

  it("creates a year and refreshes the list", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    apiRequest.mockResolvedValueOnce({ success: true, data: draft });
    apiRequest.mockResolvedValueOnce({ success: true, data: [draft] });
    render(<AcademicYearManagement />);
    await screen.findByText("No academic years yet");
    await user.click(screen.getByRole("button", { name: /Create academic year/ }));
    await user.type(screen.getByLabelText("Academic year name"), "2027-2028");
    await user.type(screen.getByLabelText("Start date"), "2027-04-01");
    await user.type(screen.getByLabelText("End date"), "2028-03-31");
    await user.click(screen.getByRole("button", { name: "Create year" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/academic-years", expect.objectContaining({ method: "POST", body: { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" } })));
    expect(await screen.findByRole("status")).toHaveTextContent("Academic year created successfully.");
  });

  it("rejects an end date that is not after the start date", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    render(<AcademicYearManagement />);
    await screen.findByText("No academic years yet");
    await user.click(screen.getByRole("button", { name: /Create academic year/ }));
    await user.type(screen.getByLabelText("Academic year name"), "2027-2028");
    await user.type(screen.getByLabelText("Start date"), "2027-04-01");
    await user.type(screen.getByLabelText("End date"), "2027-03-31");
    await user.click(screen.getByRole("button", { name: "Create year" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The end date must be after the start date.");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("activates a draft year only after confirmation", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ success: true, data: [draft] });
    apiRequest.mockResolvedValueOnce({ success: true, data: { ...draft, status: "active" } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [{ ...draft, status: "active" }] });
    render(<AcademicYearManagement />);
    await screen.findByText("2027-2028");
    await user.click(screen.getByRole("button", { name: "Activate" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Activate academic year?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/academic-years/year-b", expect.objectContaining({ method: "PATCH", body: { status: "active" } })));
  });

  it("allows principals to view without management controls", async () => {
    useAuth.mockReturnValue({ accessToken: "test-token", user: { role: "principal" } });
    apiRequest.mockResolvedValueOnce({ success: true, data: [active] });
    render(<AcademicYearManagement />);
    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
    expect(screen.getByText("You have read-only access to academic years.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create academic year/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("shows retry when loading fails", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<AcademicYearManagement />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("does not expose management actions for closed years", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, data: [{ ...draft, status: "closed" }] });
    render(<AcademicYearManagement />);
    await screen.findByText("2027-2028");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
