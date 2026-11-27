import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlatformAdminWorkspace from "../components/PlatformAdminWorkspace.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const businessOverview = {
  success: true,
  data: {
    schools: { total: 3, active: 2, byStatus: [{ _id: "active", count: 2 }, { _id: "pending", count: 1 }] },
    subscriptions: {
      INR: { mrr: 2400, arr: 28800, lifetimeSales: 0, activeSubscriptions: 2, pendingSubscriptions: 0, pastDueSubscriptions: 0, renewalsDueSoon: 1 },
    },
    subscriptionStatusCounts: { active: 2, past_due: 1, pending: 1 },
    renewalsDueSoon: 1,
    invoiced: [{ _id: "INR", invoiced: 5000, outstanding: 1200, overdue: 400, invoiceCount: 2, outstandingInvoiceCount: 1, overdueInvoiceCount: 1 }],
    collected: [{ _id: "INR", collected: 3800, paymentCount: 2 }],
    recentActivity: [{ _id: "event-1", action: "PAYMENT_RECORDED", tenantId: { name: "Green Valley School" }, createdAt: "2026-11-26T10:00:00.000Z" }],
  },
};

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

describe("PlatformAdminWorkspace overview reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { firstName: "Riyaz", lastName: "Ahmed", role: "platform_admin" },
      accessToken: "platform-access-token",
      logout: vi.fn(),
    });
  });

  it("clears the initial error after a successful retry", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValueOnce(new Error("Overview unavailable"))
      .mockResolvedValueOnce(businessOverview);
    render(<PlatformAdminWorkspace />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Overview unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Registered schools")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a loading state while a refreshed overview is pending", async () => {
    const user = userEvent.setup();
    let resolveRefresh;
    apiRequest.mockResolvedValueOnce(businessOverview)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    render(<PlatformAdminWorkspace />);

    expect(await screen.findByText("Registered schools")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh overview" }));

    expect(screen.getByRole("status")).toHaveTextContent("Loading platform intelligence");
    resolveRefresh(businessOverview);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("keeps the last successful KPIs visible and reports an error when refresh fails", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce(businessOverview)
      .mockRejectedValueOnce(new Error("Refresh failed"));
    render(<PlatformAdminWorkspace />);

    expect(await screen.findByText("Registered schools")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh overview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
    expect(screen.getByText("Registered schools")).toBeInTheDocument();
    expect(screen.getByText("Green Valley School")).toBeInTheDocument();
  });
});

describe("PlatformAdminWorkspace school directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { firstName: "Riyaz", lastName: "Ahmed", role: "platform_admin" },
      accessToken: "platform-access-token",
      logout: vi.fn(),
    });
    apiRequest.mockResolvedValueOnce(businessOverview);
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

  it("presents business performance, receivables, operational health and recent activity", async () => {
    render(<PlatformAdminWorkspace />);

    expect(await screen.findByText("Registered schools")).toBeInTheDocument();
    expect(screen.getByText("Outstanding receivables")).toBeInTheDocument();
    expect(screen.getByText(/₹1,200/)).toBeInTheDocument();
    expect(screen.getByText("₹400")).toBeInTheDocument();
    expect(screen.getByText("Revenue and collections")).toBeInTheDocument();
    expect(screen.getByText("Operational health")).toBeInTheDocument();
    expect(screen.getByText("Past-due subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Recent commercial activity")).toBeInTheDocument();
    expect(screen.getByText("Payment Recorded")).toBeInTheDocument();
    expect(screen.getByText("Green Valley School")).toBeInTheDocument();
  });

  it("opens the directory from the overview card", async () => {
    const user = userEvent.setup();
    render(<PlatformAdminWorkspace />);

    await screen.findByText("Registered schools");
    await user.click(screen.getByRole("button", { name: /View school portfolio/ }));

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
    apiRequest.mockResolvedValueOnce({ success: true, data: [] });
    apiRequest.mockResolvedValueOnce({ success: true, data: { subscription: null } });
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

  it("activates a pending school from its details and refreshes the status", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: { subscription: null } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          school: {
            id: "school-1", name: "Green Valley School", slug: "green-valley",
            status: "pending", timezone: "Asia/Kolkata",
          },
          administrators: [{ id: "admin-1", firstName: "Saima", lastName: "Yousuf", email: "saima@example.com", status: "pending" }],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "School status updated to active",
        data: { school: { id: "school-1", name: "Green Valley School", status: "active" } },
      })
      .mockResolvedValue({
        success: true,
        data: {
          school: {
            id: "school-1", name: "Green Valley School", slug: "green-valley",
            status: "active", timezone: "Asia/Kolkata",
          },
          administrators: [{ id: "admin-1", firstName: "Saima", lastName: "Yousuf", email: "saima@example.com", status: "active" }],
        },
      });

    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");
    await user.click(screen.getByRole("button", { name: "Green Valley School" }));

    await user.click(await screen.findByRole("button", { name: "Activate school" }));

    expect(await screen.findByRole("status")).toHaveTextContent("School status updated to active");
    expect(apiRequest).toHaveBeenCalledWith(
      "/platform/schools/school-1/status",
      expect.objectContaining({
        method: "PATCH",
        accessToken: "platform-access-token",
        body: { status: "active" },
      }),
    );
    expect(await screen.findByRole("button", { name: "Suspend school" })).toBeInTheDocument();
  });

  it("requires and submits a reason when suspending a school, then displays its history", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: { subscription: null } })
      .mockResolvedValueOnce({
        success: true,
        data: { school: { id: "school-1", name: "Green Valley School", status: "active", timezone: "Asia/Kolkata" }, administrators: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "School status updated to suspended",
        data: { school: {
          id: "school-1", name: "Green Valley School", status: "suspended",
          suspensionReason: "Outstanding compliance documentation",
          suspensionHistory: [{ reason: "Outstanding compliance documentation", suspendedAt: "2026-11-27T10:00:00.000Z" }],
        } },
      })
      .mockResolvedValue({
        success: true,
        data: { school: {
          id: "school-1", name: "Green Valley School", status: "suspended",
          suspensionReason: "Outstanding compliance documentation",
          suspensionHistory: [{ reason: "Outstanding compliance documentation", suspendedAt: "2026-11-27T10:00:00.000Z" }],
        }, administrators: [] },
      });
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");
    await user.click(screen.getByRole("button", { name: "Green Valley School" }));

    const suspendButton = await screen.findByRole("button", { name: "Suspend school" });
    expect(suspendButton).toBeDisabled();
    const reason = screen.getByLabelText(/Reason for suspension/);
    await user.type(reason, "Outstanding compliance documentation");
    await user.click(screen.getByRole("button", { name: "Suspend school" }));

    expect(await screen.findByRole("status")).toHaveTextContent("School status updated to suspended");
    expect(apiRequest).toHaveBeenCalledWith("/platform/schools/school-1/status", expect.objectContaining({
      method: "PATCH", body: { status: "suspended", reason: "Outstanding compliance documentation" },
    }));
    expect(await screen.findByText("Suspension history")).toBeInTheDocument();
    expect(screen.getByText("Outstanding compliance documentation")).toBeInTheDocument();
  });

  it("shows a useful error when a school status update fails", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: { subscription: null } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          school: {
            id: "school-1", name: "Green Valley School", slug: "green-valley",
            status: "pending", timezone: "Asia/Kolkata",
          },
          administrators: [],
        },
      });
    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Schools/ }));
    await screen.findByText("Green Valley School");
    await user.click(screen.getByRole("button", { name: "Green Valley School" }));
    apiRequest.mockRejectedValueOnce(new Error("Status update denied"));

    await user.click(await screen.findByRole("button", { name: "Activate school" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Status update denied");
    expect(screen.getByRole("button", { name: "Activate school" })).toBeEnabled();
  });

  
  it("opens the Users page and loads platform users", async () => {
    const user = userEvent.setup();

    apiRequest
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: "user-1",
          tenantId: "school-1",
          firstName: "Amina",
          lastName: "Khan",
          email: "amina@example.com",
          role: "teacher",
          status: "active",
          createdAt: "2026-01-10T00:00:00.000Z",
        }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: "school-1",
          name: "Green Valley School",
          slug: "green-valley",
          status: "active",
        }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

    render(<PlatformAdminWorkspace />);

    await user.click(screen.getByRole("button", { name: /Users/ }));

    expect(await screen.findByText("amina@example.com")).toBeInTheDocument();
    expect(screen.getByText("Amina Khan")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith(
      "/platform/users?page=1&limit=20",
      expect.objectContaining({ accessToken: "platform-access-token" }),
    );
  });

  it("applies user search and role filters", async () => {
    const user = userEvent.setup();

    apiRequest.mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(<PlatformAdminWorkspace />);

    await user.click(screen.getByRole("button", { name: /Users/ }));

    await screen.findByRole("searchbox", { name: "Search users" });

    await user.type(
      screen.getByRole("searchbox", { name: "Search users" }),
      "Amina",
    );

    await user.click(screen.getByRole("button", { name: "Search" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter users by role" }),
      "teacher",
    );

    await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
      "/platform/users?page=1&limit=20&role=teacher&search=Amina",
      expect.objectContaining({ accessToken: "platform-access-token" }),
    );
    });
  });

  it("shows an empty state when no users match the filters", async () => {
    const user = userEvent.setup();

    apiRequest.mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(<PlatformAdminWorkspace />);

    await user.click(screen.getByRole("button", { name: /Users/ }));

    expect(
      await screen.findByText("No users match these filters."),
    ).toBeInTheDocument();
  });
 
  it("creates a user for an active school", async () => {
  const user = userEvent.setup();

  // Initial Users directory response.
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: [{
      id: "user-1",
      tenantId: "school-1",
      firstName: "Amina",
      lastName: "Khan",
      email: "amina@example.com",
      role: "teacher",
      status: "active",
    }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });

  // Active schools response for the School dropdown.
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: [{
      id: "school-1",
      name: "Green Valley School",
      status: "active",
    }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });

  render(<PlatformAdminWorkspace />);

  await user.click(screen.getByRole("button", { name: /Users/ }));

  expect(
    await screen.findByRole("option", { name: "Green Valley School" }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Create user/ }));

  await user.selectOptions(
    screen.getByLabelText("School *"),
    "school-1",
  );
  await user.type(screen.getByLabelText("First name *"), "Amina");
  await user.type(screen.getByLabelText("Last name"), "Khan");
  await user.type(screen.getByLabelText("Email address *"), "amina@example.com");
  await user.selectOptions(
    screen.getByLabelText("Role *"),
    "teacher",
  );
  await user.type(
    screen.getByLabelText(/Initial password/),
    "SecurePass123",
  );

  // Exactly one response for the POST request.
  apiRequest.mockResolvedValueOnce({
    success: true,
    message: "User created successfully.",
    data: {
      user: {
        id: "user-2",
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        role: "teacher",
        status: "pending",
      },
    },
  });

  await user.click(screen.getByRole("button", { name: "Create user" }));

  expect(await screen.findByRole("status"))
    .toHaveTextContent("User created successfully.");

  expect(apiRequest).toHaveBeenLastCalledWith(
    "/platform/users",
    expect.objectContaining({
      method: "POST",
      accessToken: "platform-access-token",
      body: {
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        phone: "",
        role: "teacher",
        password: "SecurePass123",
      },
    }),
  );
});


  it("opens a user profile and displays account details", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: "user-1", tenantId: "school-1", firstName: "Amina", lastName: "Khan",
          email: "amina@example.com", role: "teacher", status: "active",
          createdAt: "2026-01-10T00:00:00.000Z",
        }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: "school-1", name: "Green Valley School" }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: { user: {
          id: "user-1", tenantId: "school-1", firstName: "Amina", lastName: "Khan",
          email: "amina@example.com", phone: "9876543210", role: "teacher",
          status: "active", lastLoginAt: "2026-02-01T00:00:00.000Z",
          createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-15T00:00:00.000Z",
        } },
      });

    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Users/ }));
    await user.click(await screen.findByRole("button", { name: "Amina Khan" }));

    expect(await screen.findByRole("heading", { name: "Amina Khan" })).toBeInTheDocument();
    expect(screen.getByText("Green Valley School")).toBeInTheDocument();
    expect(screen.getByText("Last login")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveValue("9876543210");
    expect(apiRequest).toHaveBeenCalledWith(
      "/platform/users/user-1",
      expect.objectContaining({ accessToken: "platform-access-token" }),
    );
  });
 it("suspends an active user and updates the profile status", async () => {
  const user = userEvent.setup();

  apiRequest
    .mockResolvedValueOnce({
      success: true,
      data: [{
        id: "user-1",
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        role: "teacher",
        status: "active",
      }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: [{ id: "school-1", name: "Green Valley School" }],
    })
    .mockResolvedValueOnce({
      success: true,
      data: { user: {
        id: "user-1",
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        phone: "",
        role: "teacher",
        status: "active",
      } },
    })
    .mockResolvedValueOnce({
      success: true,
      message: "User status updated to suspended",
      data: { user: {
        id: "user-1",
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        phone: "",
        role: "teacher",
        status: "suspended",
      } },
    });

  render(<PlatformAdminWorkspace />);

  await user.click(screen.getByRole("button", { name: /Users/ }));
  await user.click(await screen.findByRole("button", { name: "Amina Khan" }));

  await user.click(await screen.findByRole("button", { name: "Suspend user" }));

  expect(await screen.findByRole("status"))
    .toHaveTextContent("User status updated to suspended");

  expect(screen.getByRole("button", { name: "Reactivate user" }))
    .toBeInTheDocument();

  expect(screen.queryByRole("button", { name: "Suspend user" }))
    .not.toBeInTheDocument();

  expect(apiRequest).toHaveBeenCalledWith(
    "/platform/users/user-1/status",
    expect.objectContaining({
      method: "PATCH",
      accessToken: "platform-access-token",
      body: { status: "suspended" },
    }),
  );
});
it("activates a pending user and updates the profile status", async () => {
  const user = userEvent.setup();

  apiRequest
    .mockResolvedValueOnce({
      success: true,
      data: [{
        id: "user-1",
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        role: "teacher",
        status: "pending",
      }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: [{ id: "school-1", name: "Green Valley School" }],
    })
    .mockResolvedValueOnce({
      success: true,
      data: {
        user: {
          id: "user-1",
          tenantId: "school-1",
          firstName: "Amina",
          lastName: "Khan",
          email: "amina@example.com",
          phone: "",
          role: "teacher",
          status: "pending",
        },
      },
    })
    .mockResolvedValueOnce({
      success: true,
      message: "User status updated to active",
      data: {
        user: {
          id: "user-1",
          tenantId: "school-1",
          firstName: "Amina",
          lastName: "Khan",
          email: "amina@example.com",
          phone: "",
          role: "teacher",
          status: "active",
        },
      },
    });

  render(<PlatformAdminWorkspace />);

  await user.click(screen.getByRole("button", { name: /Users/ }));
  await user.click(await screen.findByRole("button", { name: "Amina Khan" }));

  await user.click(await screen.findByRole("button", { name: "Activate user" }));

  expect(await screen.findByRole("status"))
    .toHaveTextContent("User status updated to active");

  expect(screen.getByRole("button", { name: "Suspend user" }))
    .toBeInTheDocument();

  expect(screen.queryByRole("button", { name: "Activate user" }))
    .not.toBeInTheDocument();

  expect(apiRequest).toHaveBeenCalledWith(
    "/platform/users/user-1/status",
    expect.objectContaining({
      method: "PATCH",
      accessToken: "platform-access-token",
      body: { status: "active" },
    }),
  );
});
it("changes a user's role and updates the profile", async () => {
  const user = userEvent.setup();

  apiRequest
    .mockResolvedValueOnce({
      success: true,
      data: [{
        id: "user-1",
        tenantId: "school-1",
        firstName: "Amina",
        lastName: "Khan",
        email: "amina@example.com",
        role: "teacher",
        status: "active",
      }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: [{ id: "school-1", name: "Green Valley School" }],
    })
    .mockResolvedValueOnce({
      success: true,
      data: {
        user: {
          id: "user-1",
          tenantId: "school-1",
          firstName: "Amina",
          lastName: "Khan",
          email: "amina@example.com",
          phone: "",
          role: "teacher",
          status: "active",
        },
      },
    })
    .mockResolvedValueOnce({
      success: true,
      message: "User role updated",
      data: {
        user: {
          id: "user-1",
          tenantId: "school-1",
          firstName: "Amina",
          lastName: "Khan",
          email: "amina@example.com",
          phone: "",
          role: "principal",
          status: "active",
        },
      },
    });

  render(<PlatformAdminWorkspace />);

  await user.click(screen.getByRole("button", { name: /Users/ }));
  await user.click(await screen.findByRole("button", { name: "Amina Khan" }));

  const roleSelect = await screen.findByRole("combobox", {
    name: "User role",
  });

  expect(roleSelect).toHaveValue("teacher");

  await user.selectOptions(roleSelect, "principal");

  await user.click(screen.getByRole("button", { name: "Save role" }));

  expect(await screen.findByRole("status"))
    .toHaveTextContent("User role updated");

  expect(roleSelect).toHaveValue("principal");

  expect(apiRequest).toHaveBeenCalledWith(
    "/platform/users/user-1/role",
    expect.objectContaining({
      method: "PATCH",
      accessToken: "platform-access-token",
      body: { role: "principal" },
    }),
  );
});
  it("saves an edited user profile", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: "user-1", tenantId: "school-1", firstName: "Amina", lastName: "Khan",
          email: "amina@example.com", role: "teacher", status: "active",
        }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: "school-1", name: "Green Valley School" }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: { user: {
          id: "user-1", tenantId: "school-1", firstName: "Amina", lastName: "Khan",
          email: "amina@example.com", phone: "", role: "teacher", status: "active",
        } },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "Profile saved",
        data: { user: {
          id: "user-1", tenantId: "school-1", firstName: "Amina", lastName: "Khan",
          email: "amina.new@example.com", phone: "9900112233", role: "teacher", status: "active",
        } },
      });

    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Users/ }));
    await user.click(await screen.findByRole("button", { name: "Amina Khan" }));
    await screen.findByLabelText("Email address *");

    await user.clear(screen.getByLabelText("Email address *"));
    await user.type(screen.getByLabelText("Email address *"), "amina.new@example.com");
    await user.type(screen.getByLabelText("Phone"), "9900112233");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved");
    expect(apiRequest).toHaveBeenCalledWith(
      "/platform/users/user-1",
      expect.objectContaining({
        method: "PATCH",
        accessToken: "platform-access-token",
        body: {
          firstName: "Amina",
          lastName: "Khan",
          email: "amina.new@example.com",
          phone: "9900112233",
        },
      }),
    );
  });


  it("shows commercial audit references stored on the event and in its details", async () => {
    const user = userEvent.setup();
    const event = {
      id: "commercial-event-1",
      action: "PAYMENT_RECORDED",
      tenantId: { name: "Green Valley School" },
      subscriptionId: "507f1f77bcf86cd799439011",
      invoiceId: "507f1f77bcf86cd799439012",
      paymentId: "507f1f77bcf86cd799439013",
      details: { planId: "507f1f77bcf86cd799439014", amount: 2500, currency: "INR" },
      createdAt: "2026-11-26T10:00:00.000Z",
    };
    apiRequest.mockImplementation(async (path) => {
      if (path === "/platform/business-overview") return businessOverview;
      if (path.startsWith("/platform/commercial-events?")) {
        return { success: true, data: [event], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };
      }
      return { success: true, data: [] };
    });

    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /Commercial audit/ }));

    const table = await screen.findByRole("table", { name: "Commercial audit events" });
    expect(within(table).getByText("Green Valley School")).toBeInTheDocument();
    await user.click(within(table).getByText("View 4 references"));

    expect(within(table).getByTitle(event.subscriptionId)).toBeInTheDocument();
    expect(within(table).getByTitle(event.invoiceId)).toBeInTheDocument();
    expect(within(table).getByTitle(event.paymentId)).toBeInTheDocument();
    expect(within(table).getByTitle(event.details.planId)).toBeInTheDocument();
  });

  it("shows system audit records, outbox health and retries failed delivery", async () => {
    const user = userEvent.setup();
    const auditRecord = {
      id: "audit-1",
      actorUserId: "actor-1",
      actorRole: "platform_admin",
      targetUserId: "target-1",
      targetTenantId: "school-1",
      action: "USER_ROLE_CHANGED",
      changedFields: ["role"],
      previousValue: "teacher",
      newValue: "principal",
      createdAt: "2026-11-26T10:00:00.000Z",
    };
    const failedEvent = {
      id: "outbox-1",
      attempts: 10,
      manualRetryCount: 0,
      lastError: "Temporary database issue",
      updatedAt: "2026-11-26T10:01:00.000Z",
    };
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === "/platform/business-overview") return businessOverview;
      if (path.startsWith("/platform/audit-logs?")) {
        return { success: true, data: [auditRecord], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };
      }
      if (path === "/platform/audit-outbox" && options.method !== "POST") {
        return { success: true, data: { counts: { pending: 2, processing: 1, staleProcessing: 0, delivered: 42, failed: 1 }, failedEvents: [failedEvent] } };
      }
      if (path === "/platform/audit-outbox/outbox-1/retry" && options.method === "POST") {
        return { success: true, data: { id: "outbox-1", status: "pending" } };
      }
      return { success: true, data: { counts: { pending: 3, processing: 0, staleProcessing: 0, delivered: 42, failed: 0 }, failedEvents: [] } };
    });

    render(<PlatformAdminWorkspace />);
    await user.click(screen.getByRole("button", { name: /System audit/ }));

    expect(await screen.findByRole("table", { name: "System audit event log" })).toBeInTheDocument();
    expect(screen.getByText("User role changed")).toBeInTheDocument();
    expect(screen.getByText("teacher → principal")).toBeInTheDocument();
    expect(screen.getByText("Temporary database issue")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry delivery" }));
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "/platform/audit-outbox/outbox-1/retry",
        expect.objectContaining({ method: "POST", accessToken: "platform-access-token" }),
      );
    });
  });

});
