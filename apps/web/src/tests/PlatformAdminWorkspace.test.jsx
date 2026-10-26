import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlatformAdminWorkspace from "../components/PlatformAdminWorkspace.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const pageOne = {
  success: true,
  data: [
    {
      id: "school-1",
      name: "Green Valley School",
      slug: "green-valley",
      contactEmail: "office@greenvalley.example",
      status: "active",
      createdAt: "2025-01-15T00:00:00.000Z",
    },
  ],
  pagination: { page: 1, limit: 20, total: 21, totalPages: 2 },
};

describe("PlatformAdminWorkspace school directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { firstName: "Riyaz", lastName: "Ahmed", role: "platform_admin" },
      accessToken: "platform-access-token",
      logout: vi.fn(),
    });
    apiRequest.mockResolvedValue(pageOne);
  });

  it("loads and displays schools when the Schools page opens", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);

    await user.click(screen.getByRole("button", { name: /Schools/ }));

    expect(await screen.findByText("Green Valley School")).toBeInTheDocument();
    expect(screen.getByText("green-valley")).toBeInTheDocument();
    expect(screen.getByText("office@greenvalley.example")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith(
      "/platform/schools?page=1&limit=20",
      expect.objectContaining({ accessToken: "platform-access-token" }),
    );
  });

  it("submits search text to the directory API", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));

    await screen.findByText("Green Valley School");
    await user.type(screen.getByRole("searchbox", { name: "Search schools" }), "north school");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/platform/schools?page=1&limit=20&search=north+school",
        expect.objectContaining({ accessToken: "platform-access-token" }),
      );
    });
  });

  it("applies a status filter and resets to page one", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter schools by status" }), "suspended");

    await waitFor(() => {
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/platform/schools?page=1&limit=20&status=suspended",
        expect.objectContaining({ accessToken: "platform-access-token" }),
      );
    });
  });

  it("moves between result pages", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/platform/schools?page=2&limit=20",
        expect.objectContaining({ accessToken: "platform-access-token" }),
      );
    });
  });

  it("shows an error when the directory API fails and allows retry", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValueOnce(new Error("Directory unavailable"));
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Directory unavailable");

    apiRequest.mockResolvedValueOnce(pageOne);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Green Valley School")).toBeInTheDocument();
  });

  it("shows an empty state when no schools match the query", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));

    expect(await screen.findByText("No schools match these filters.")).toBeInTheDocument();
  });

  it("opens the directory from the overview card", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);

    await user.click(screen.getByRole("button", { name: /Open school directory/ }));

    expect(await screen.findByRole("table", { name: "School directory" })).toBeInTheDocument();
  });
});
