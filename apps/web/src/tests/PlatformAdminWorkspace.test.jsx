import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(within(screen.getByRole("table", { name: "School directory" })).getByText("Active")).toBeInTheDocument();

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
    const pageTwo = {
      ...pageOne,
      data: [{ ...pageOne.data[0], id: "school-21", name: "North School", slug: "north-school" }],
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
    };
    apiRequest.mockResolvedValueOnce(pageOne).mockResolvedValueOnce(pageTwo);
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

  it("creates a school and its initial administrator", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");
    await user.click(screen.getByRole("button", { name: /Create school/ }));

    await user.type(screen.getByLabelText(/School name/), "North School");
    await user.type(screen.getByLabelText(/School ID \/ slug/), "north-school");
    await user.type(screen.getByLabelText(/School contact email/), "office@north.example");
    await user.type(screen.getByLabelText(/First name/), "Amina");
    await user.type(screen.getByLabelText(/Last name/), "Khan");
    await user.type(screen.getByLabelText(/Administrator email/), "admin@north.example");
    await user.type(screen.getByLabelText(/Temporary password/), "SecurePass123");

    apiRequest.mockResolvedValueOnce({
      success: true,
      data: { school: { id: "school-2", name: "North School" }, admin: { id: "admin-2" } },
    });
    await user.click(screen.getByRole("button", { name: "Create school" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/created successfully/i);
    expect(apiRequest).toHaveBeenLastCalledWith("/platform/schools", expect.objectContaining({
      method: "POST",
      accessToken: "platform-access-token",
      body: {
        school: {
          name: "North School",
          slug: "north-school",
          contactEmail: "office@north.example",
          timezone: "Asia/Kolkata",
        },
        admin: {
          firstName: "Amina",
          lastName: "Khan",
          email: "admin@north.example",
          password: "SecurePass123",
        },
      },
    }));
  });

  it("shows a helpful error when school creation conflicts", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");
    await user.click(screen.getByRole("button", { name: /Create school/ }));
    await user.type(screen.getByLabelText(/School name/), "North School");
    await user.type(screen.getByLabelText(/School ID \/ slug/), "north-school");
    await user.type(screen.getByLabelText(/First name/), "Amina");
    await user.type(screen.getByLabelText(/Administrator email/), "admin@north.example");
    await user.type(screen.getByLabelText(/Temporary password/), "SecurePass123");
    const conflict = Object.assign(new Error("A school with this slug already exists."), { status: 409 });
    apiRequest.mockRejectedValueOnce(conflict);

    await user.click(screen.getByRole("button", { name: "Create school" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/slug already exists/i);
  });

  it("opens school details and displays the school administrators", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        school: {
          id: "school-1", name: "Green Valley School", slug: "green-valley",
          contactEmail: "office@greenvalley.example", status: "active",
          timezone: "Asia/Kolkata", createdAt: "2025-01-15T00:00:00.000Z",
        },
        administrators: [{ id: "admin-1", firstName: "Amina", lastName: "Khan", email: "admin@greenvalley.example", status: "active" }],
      },
    });
    await user.click(screen.getByRole("button", { name: "Green Valley School" }));

    expect(await screen.findByText("School administrators")).toBeInTheDocument();
    expect(await screen.findByText("admin@greenvalley.example")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith("/platform/schools/school-1", expect.objectContaining({
      accessToken: "platform-access-token",
    }));
  });

});
