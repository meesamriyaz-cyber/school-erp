import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: { role: "school_admin" },
  accessToken: "test-token",
}));

vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ user: mocks.user, accessToken: mocks.accessToken }),
}));

import GradingScaleManagement from "../components/GradingScaleManagement.jsx";

const bands = [
  { grade: "F", minPercentage: 0, maxPercentage: 35 },
  { grade: "D", minPercentage: 35, maxPercentage: 50 },
  { grade: "C", minPercentage: 50, maxPercentage: 65 },
  { grade: "B", minPercentage: 65, maxPercentage: 80 },
  { grade: "A", minPercentage: 80, maxPercentage: 100 },
];
const draft = {
  _id: "scale-draft",
  name: "School grading",
  description: "School-defined bands",
  status: "draft",
  bands,
};

describe("GradingScaleManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { role: "school_admin" };
    mocks.apiRequest.mockResolvedValue({ success: true, data: [draft] });
  });

  it("loads and displays school grading scales and their percentage bands", async () => {
    render(<GradingScaleManagement />);
    expect(await screen.findByText("School grading")).toBeInTheDocument();
    expect(screen.getByText("35% – 50%")).toBeInTheDocument();
    expect(mocks.apiRequest).toHaveBeenCalledWith("/grading-scales", {
      accessToken: "test-token",
      signal: expect.any(AbortSignal),
    });
  });

  it("creates a draft with school-entered grade labels and ranges", async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: { _id: "new-scale" } })
      .mockResolvedValueOnce({ success: true, data: [] });
    render(<GradingScaleManagement />);
    await screen.findByText(/No grading scales configured/);
    fireEvent.change(screen.getByLabelText("Scale name"), { target: { value: "Primary grading" } });
    fireEvent.click(screen.getByRole("button", { name: "Add band" }));
    fireEvent.change(screen.getByLabelText("Grade label"), { target: { value: "Pass" } });
    fireEvent.change(screen.getByLabelText("Minimum %"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Maximum %"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/grading-scales", expect.objectContaining({
      method: "POST",
      body: {
        name: "Primary grading",
        description: "",
        bands: [{ grade: "Pass", minPercentage: 0, maxPercentage: 100 }],
      },
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Grading scale saved as a draft.");
  });

  it("blocks invalid gaps before sending a save request", async () => {
    mocks.apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    render(<GradingScaleManagement />);
    await screen.findByText(/No grading scales configured/);
    fireEvent.change(screen.getByLabelText("Scale name"), { target: { value: "Invalid scale" } });
    fireEvent.click(screen.getByRole("button", { name: "Add band" }));
    fireEvent.change(screen.getByLabelText("Grade label"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Minimum %"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Maximum %"), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("complete percentage range from 0 to 100");
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
  });

  it("edits a draft through the draft update endpoint", async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({ success: true, data: [draft] })
      .mockResolvedValueOnce({ success: true, data: { ...draft, name: "Updated grading" } })
      .mockResolvedValueOnce({ success: true, data: [{ ...draft, name: "Updated grading" }] });
    render(<GradingScaleManagement />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
    expect(screen.getByDisplayValue("School grading")).toBeInTheDocument();
    expect(screen.getByDisplayValue("F")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Scale name"), { target: { value: "Updated grading" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/grading-scales/scale-draft", expect.objectContaining({
      method: "PATCH",
      body: expect.objectContaining({ name: "Updated grading", bands }),
    })));
  });

  it("does not offer draft editing or activation for an active scale", async () => {
    mocks.apiRequest.mockResolvedValueOnce({ success: true, data: [{ ...draft, status: "active" }] });
    render(<GradingScaleManagement />);
    expect(await screen.findByText("School grading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate scale" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive active scale" })).toBeInTheDocument();
  });

  it("activates a draft through the status endpoint", async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({ success: true, data: [draft] })
      .mockResolvedValueOnce({ success: true, data: { ...draft, status: "active" } })
      .mockResolvedValueOnce({ success: true, data: [{ ...draft, status: "active" }] });
    render(<GradingScaleManagement />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate scale" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/grading-scales/scale-draft/status", {
      method: "PATCH",
      accessToken: "test-token",
      body: { status: "active" },
    }));
  });

  it("archives the active scale through the lifecycle endpoint", async () => {
    const active = { ...draft, status: "active" };
    mocks.apiRequest
      .mockResolvedValueOnce({ success: true, data: [active] })
      .mockResolvedValueOnce({ success: true, data: { ...active, status: "archived" } })
      .mockResolvedValueOnce({ success: true, data: [{ ...active, status: "archived" }] });
    render(<GradingScaleManagement />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive active scale" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/grading-scales/scale-draft/status", {
      method: "PATCH",
      accessToken: "test-token",
      body: { status: "archived" },
    }));
  });

  it("provides a read-only view to roles without scale-management permission", async () => {
    mocks.user = { role: "teacher" };
    render(<GradingScaleManagement />);
    expect(await screen.findByText("School grading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create grading scale" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate scale" })).not.toBeInTheDocument();
  });
});
