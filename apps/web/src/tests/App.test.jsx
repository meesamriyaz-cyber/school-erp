
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import { useAuth } from "../context/authContext.js";

vi.mock("../context/AuthContext.jsx", () => ({
  AuthProvider: ({ children }) => <>{children}</>,
}));

vi.mock("../context/authContext.js", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../components/LoginPage.jsx", () => ({
  default: () => <h1>Login page displayed</h1>,
}));

vi.mock("../components/StudentDirectory.jsx", () => ({
  default: () => <h2>Student directory displayed</h2>,
}));

vi.mock("../components/AcademicYearManagement.jsx", () => ({
  default: () => <h2>Academic year management displayed</h2>,
}));

vi.mock("../components/ClassesManagement.jsx", () => ({
  default: () => <h2>Classes management displayed</h2>,
}));

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../lib/api.js";

vi.mock("../components/PlatformAdminWorkspace.jsx", () => ({
  default: () => <h1>Platform Administrator workspace displayed</h1>,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue({ success: true, data: [] });
  });

  it("routes platform administrators to the separate platform workspace", () => {
    useAuth.mockReturnValue({
      status: "authenticated",
      user: {
        firstName: "Platform",
        lastName: "Admin",
        role: "platform_admin",
        tenantId: null,
      },
      schoolContext: null,
      logout: vi.fn(),
    });

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Platform Administrator workspace displayed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Good day, Administrator" }),
    ).not.toBeInTheDocument();
  });

  it("shows the session loading screen", () => {
    useAuth.mockReturnValue({
      status: "loading",
      user: null,
      schoolContext: null,
      logout: vi.fn(),
    });

    render(<App />);

    expect(
      screen.getByText(/Restoring your session/),
    ).toBeInTheDocument();
  });

  it("shows the login page when unauthenticated", () => {
    useAuth.mockReturnValue({
      status: "unauthenticated",
      user: null,
      schoolContext: null,
      logout: vi.fn(),
    });

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Login page displayed" }),
    ).toBeInTheDocument();
  });

  it("shows the authenticated dashboard and user details", () => {
    useAuth.mockReturnValue({
      status: "authenticated",
      user: {
        firstName: "Ayaan",
        lastName: "Khan",
        role: "SCHOOL_ADMIN",
      },
      schoolContext: {
        school: { name: "Green Valley School" },
      },
      logout: vi.fn(),
    });

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Good day, Administrator" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Green Valley School")).toBeInTheDocument();
    expect(screen.getByText("Ayaan Khan")).toBeInTheDocument();
    expect(screen.getByText("SCHOOL ADMIN")).toBeInTheDocument();
  });

  it("opens the student directory from dashboard navigation", async () => {
    const user = userEvent.setup();

    useAuth.mockReturnValue({
      status: "authenticated",
      user: { firstName: "Ayaan", lastName: "Khan", role: "SCHOOL_ADMIN" },
      schoolContext: { school: { name: "Green Valley School" } },
      logout: vi.fn(),
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Explore students/ }));

    expect(
      screen.getByRole("heading", { name: "Student directory displayed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Students" })).toBeInTheDocument();
  });

  it("calls logout when Sign out is clicked", async () => {
    const user = userEvent.setup();
    const logout = vi.fn();

    useAuth.mockReturnValue({
      status: "authenticated",
      user: { firstName: "Ayaan", lastName: "Khan", role: "SCHOOL_ADMIN" },
      schoolContext: { school: { name: "Green Valley School" } },
      logout,
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("shows a placeholder for unfinished modules", async () => {
    const user = userEvent.setup();

    useAuth.mockReturnValue({
      status: "authenticated",
      user: { firstName: "Ayaan", lastName: "Khan", role: "SCHOOL_ADMIN" },
      schoolContext: { school: { name: "Green Valley School" } },
      logout: vi.fn(),
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Attendance/ }));

    expect(
  screen.getAllByRole("heading", { name: "Attendance" }).length,
).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Back to overview" }),
    ).toBeInTheDocument();
  });
  
it("uses fallback values when user and school details are missing", () => {
  useAuth.mockReturnValue({
    status: "authenticated",
    user: {},
    schoolContext: null,
    logout: vi.fn(),
  });

  render(<App />);

expect(screen.getAllByText("School workspace").length).toBeGreaterThan(0);
  expect(screen.getByText("School Administrator")).toBeInTheDocument();
  expect(screen.getByText("SA")).toBeInTheDocument();
  expect(screen.getByText("School user")).toBeInTheDocument();

it("opens Classes management from academic navigation", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({
    status: "authenticated",
    accessToken: "test-access-token",
    user: { firstName: "Ayaan", lastName: "Khan", role: "SCHOOL_ADMIN" },
    schoolContext: { school: { name: "Green Valley School" } },
    logout: vi.fn(),
  });

  render(<App />);
  await user.click(screen.getByRole("button", { name: /Classes & Sections/ }));
  expect(screen.getByRole("heading", { name: "Classes management displayed" })).toBeInTheDocument();
});

});


it("opens mobile navigation and closes it after selecting a page", async () => {
  const user = userEvent.setup();

  useAuth.mockReturnValue({
    status: "authenticated",
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "SCHOOL_ADMIN",
    },
    schoolContext: {
      school: { name: "Green Valley School" },
    },
    logout: vi.fn(),
  });

  render(<App />);

  await user.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );

  expect(
    screen.getByRole("button", { name: "Close navigation" }),
  ).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Guardians" }),
  );

  expect(
    screen.queryByRole("button", { name: "Close navigation" }),
  ).not.toBeInTheDocument();

  expect(
    screen.getByRole("button", { name: "Back to overview" }),
  ).toBeInTheDocument();
});

it("closes mobile navigation using the close menu button", async () => {
  const user = userEvent.setup();

  useAuth.mockReturnValue({
    status: "authenticated",
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "SCHOOL_ADMIN",
    },
    schoolContext: {
      school: { name: "Green Valley School" },
    },
    logout: vi.fn(),
  });

  render(<App />);

  await user.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );

  expect(
    screen.getByRole("button", { name: "Close navigation" }),
  ).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Close menu" }),
  );

  expect(
    screen.queryByRole("button", { name: "Close navigation" }),
  ).not.toBeInTheDocument();
});

it("opens the student directory from the Student management module", async () => {
  const user = userEvent.setup();

  useAuth.mockReturnValue({
    status: "authenticated",
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "SCHOOL_ADMIN",
    },
    schoolContext: {
      school: { name: "Green Valley School" },
    },
    logout: vi.fn(),
  });

  render(<App />);

  await user.click(
    screen.getByRole("button", { name: /Student management/ }),
  );

  expect(
    screen.getByRole("heading", { name: "Student directory displayed" }),
  ).toBeInTheDocument();
});


it("opens the student directory from the Student management module", async () => {
  const user = userEvent.setup();

  useAuth.mockReturnValue({
    status: "authenticated",
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "SCHOOL_ADMIN",
    },
    schoolContext: {
      school: { name: "Green Valley School" },
    },
    logout: vi.fn(),
  });

  render(<App />);

  await user.click(
    screen.getByRole("button", { name: /Student management/ }),
  );

  expect(
    screen.getByRole("heading", { name: "Student directory displayed" }),
  ).toBeInTheDocument();
});

it("opens the student directory from the Student management module", async () => {
  const user = userEvent.setup();

  useAuth.mockReturnValue({
    status: "authenticated",
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "SCHOOL_ADMIN",
    },
    schoolContext: {
      school: { name: "Green Valley School" },
    },
    logout: vi.fn(),
  });

  render(<App />);

  await user.click(
    screen.getByRole("button", { name: /Student management/ }),
  );

  expect(
    screen.getByRole("heading", { name: "Student directory displayed" }),
  ).toBeInTheDocument();
});

it("closes mobile navigation using the backdrop and returns to overview", async () => {
  const user = userEvent.setup();

  useAuth.mockReturnValue({
    status: "authenticated",
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "SCHOOL_ADMIN",
    },
    schoolContext: {
      school: { name: "Green Valley School" },
    },
    logout: vi.fn(),
  });

  render(<App />);

  // Open the mobile navigation.
  await user.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );

  // Click the backdrop to close it.
  await user.click(
    screen.getByRole("button", { name: "Close navigation" }),
  );

  expect(
    screen.queryByRole("button", { name: "Close navigation" }),
  ).not.toBeInTheDocument();

  // Open an unfinished module.
  await user.click(
    screen.getByRole("button", { name: /Attendance/ }),
  );

  expect(
    screen.getByRole("button", { name: "Back to overview" }),
  ).toBeInTheDocument();

  // Return to the dashboard overview.
  await user.click(
    screen.getByRole("button", { name: "Back to overview" }),
  );

  expect(
    screen.getByRole("heading", { name: "Good day, Administrator" }),
  ).toBeInTheDocument();
});


it("shows the active academic year and opens its management page", async () => {
  const user = userEvent.setup();
  apiRequest.mockResolvedValue({
    success: true,
    data: [{
      _id: "year-active",
      name: "2026-2027",
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2027-03-31T00:00:00.000Z",
      status: "active",
    }],
  });
  useAuth.mockReturnValue({
    status: "authenticated",
    accessToken: "test-access-token",
    user: { firstName: "Ayaan", lastName: "Khan", role: "SCHOOL_ADMIN" },
    schoolContext: { school: { name: "Green Valley School" } },
    logout: vi.fn(),
  });

  render(<App />);
  expect((await screen.findAllByText("2026-2027")).length).toBeGreaterThanOrEqual(1);
  await user.click(screen.getByRole("button", { name: /Academic Years/ }));
  expect(screen.getByRole("heading", { name: "Academic year management displayed" })).toBeInTheDocument();
});


  it("opens Classes management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      status: "authenticated",
      accessToken: "test-access-token",
      user: { firstName: "Ayaan", lastName: "Khan", role: "SCHOOL_ADMIN" },
      schoolContext: { school: { name: "Green Valley School" } },
      logout: vi.fn(),
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: /Classes & Sections/ }));
    expect(screen.getByRole("heading", { name: "Classes management displayed" })).toBeInTheDocument();
  });

});
