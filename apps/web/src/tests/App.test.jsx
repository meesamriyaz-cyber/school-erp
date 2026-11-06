import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/AuthContext.jsx", () => ({
  AuthProvider: ({ children }) => <>{children}</>,
}));
vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../components/LoginPage.jsx", () => ({ default: () => <h1>Login page displayed</h1> }));
vi.mock("../components/StudentDirectory.jsx", () => ({ default: () => <h2>Student directory displayed</h2> }));
vi.mock("../components/GuardianDirectory.jsx", () => ({ default: () => <h2>Guardian directory displayed</h2> }));
vi.mock("../components/AcademicYearManagement.jsx", () => ({ default: () => <h2>Academic year management displayed</h2> }));
vi.mock("../components/ClassesManagement.jsx", () => ({ default: () => <h2>Classes management displayed</h2> }));
vi.mock("../components/SectionsManagement.jsx", () => ({ default: () => <h2>Sections management displayed</h2> }));
vi.mock("../components/EnrollmentsManagement.jsx", () => ({ default: () => <h2>Enrollments management displayed</h2> }));
vi.mock("../components/AttendanceManagement.jsx", () => ({ default: () => <h2>Attendance management displayed</h2> }));
vi.mock("../components/SubjectManagement.jsx", () => ({ default: () => <h2>Subject management displayed</h2> }));
vi.mock("../components/TeacherAssignments.jsx", () => ({ default: () => <h2>Teacher assignments displayed</h2> }));
vi.mock("../components/TimetableManagement.jsx", () => ({ default: () => <h2>Timetable management displayed</h2> }));
vi.mock("../components/PlatformAdminWorkspace.jsx", () => ({ default: () => <h1>Platform Administrator workspace displayed</h1> }));
vi.mock("../components/SchoolUserDirectory.jsx", () => ({ default: () => <h2>School user directory displayed</h2> }));

const schoolAdmin = (overrides = {}) => ({
  status: "authenticated",
  accessToken: "test-access-token",
  user: { firstName: "Ayaan", lastName: "Khan", role: "school_admin" },
  schoolContext: { school: { name: "Green Valley School" } },
  logout: vi.fn(),
  ...overrides,
});

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue({ success: true, data: [] });
  });

  it("routes platform administrators to the separate platform workspace", () => {
    useAuth.mockReturnValue(schoolAdmin({
      user: { firstName: "Platform", lastName: "Admin", role: "platform_admin", tenantId: null },
      schoolContext: null,
    }));
    render(<App />);
    expect(screen.getByRole("heading", { name: "Platform Administrator workspace displayed" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Good day, Administrator" })).not.toBeInTheDocument();
  });

  it("shows the session loading screen", () => {
    useAuth.mockReturnValue({ status: "loading", user: null, schoolContext: null, logout: vi.fn() });
    render(<App />);
    expect(screen.getByText(/Restoring your session/)).toBeInTheDocument();
  });

  it("shows the login page when unauthenticated", () => {
    useAuth.mockReturnValue({ status: "unauthenticated", user: null, schoolContext: null, logout: vi.fn() });
    render(<App />);
    expect(screen.getByRole("heading", { name: "Login page displayed" })).toBeInTheDocument();
  });

  it("shows the authenticated dashboard and user details", () => {
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    expect(screen.getByRole("heading", { name: "Good day, Administrator" })).toBeInTheDocument();
    expect(screen.getByText("Green Valley School")).toBeInTheDocument();
    expect(screen.getByText("Ayaan Khan")).toBeInTheDocument();
    expect(screen.getByText("school admin")).toBeInTheDocument();
  });

  it("opens the student directory from dashboard navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Explore students/ }));
    expect(screen.getByRole("heading", { name: "Student directory displayed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Students" })).toBeInTheDocument();
  });

  it("calls logout when Sign out is clicked", async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    useAuth.mockReturnValue(schoolAdmin({ logout }));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("opens Attendance management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Attendance$/ }));
    expect(screen.getByRole("heading", { name: "Attendance management displayed" })).toBeInTheDocument();
  });

 it("shows an unavailable message when the authenticated user has no role", () => {
  useAuth.mockReturnValue({
    status: "authenticated",
    user: {},
    schoolContext: null,
    logout: vi.fn(),
  });

  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Workspace unavailable" }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole("button", { name: "Students" }),
  ).not.toBeInTheDocument();
});

  it("opens mobile navigation and closes it after selecting a page", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("button", { name: "Close navigation" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardians" }));
    expect(screen.queryByRole("button", { name: "Close navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Guardian directory displayed" })).toBeInTheDocument();
  });

  it("closes mobile navigation using the close menu button", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("button", { name: "Close navigation" })).not.toBeInTheDocument();
  });

  it("opens the school-wide guardian directory from navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guardians" }));
    expect(screen.getByRole("heading", { name: "Guardian directory displayed" })).toBeInTheDocument();
  });

  it("opens the student directory from Student management", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Student management/ }));
    expect(screen.getByRole("heading", { name: "Student directory displayed" })).toBeInTheDocument();
  });

  it("closes mobile navigation using the backdrop and returns to overview", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(screen.queryByRole("button", { name: "Close navigation" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Attendance$/ }));
    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByRole("heading", { name: "Good day, Administrator" })).toBeInTheDocument();
  });

  it("shows the active academic year and opens its management page", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValue({ success: true, data: [{
      _id: "year-active", name: "2026-2027", startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2027-03-31T00:00:00.000Z", status: "active",
    }] });
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    expect((await screen.findAllByText("2026-2027")).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole("button", { name: /Academic Years/ }));
    expect(screen.getByRole("heading", { name: "Academic year management displayed" })).toBeInTheDocument();
  });

  it("opens Classes management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Classes & Sections/ }));
    expect(screen.getByRole("heading", { name: "Classes management displayed" })).toBeInTheDocument();
  });

  it("opens Sections management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Sections$/ }));
    expect(screen.getByRole("heading", { name: "Sections management displayed" })).toBeInTheDocument();
  });

  it("opens Subject management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Subjects$/ }));
    expect(screen.getByRole("heading", { name: "Subject management displayed" })).toBeInTheDocument();
  });

  it("opens Teacher Assignments from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Teacher Assignments$/ }));
    expect(screen.getByRole("heading", { name: "Teacher assignments displayed" })).toBeInTheDocument();
  });

  it("opens Timetable management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Timetable$/ }));
    expect(screen.getByRole("heading", { name: "Timetable management displayed" })).toBeInTheDocument();
  });

  it("opens Enrollments management from academic navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(schoolAdmin());
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Enrollments$/ }));
    expect(screen.getByRole("heading", { name: "Enrollments management displayed" })).toBeInTheDocument();
  });
 it("does not expose the school administration dashboard to teachers", () => {
  useAuth.mockReturnValue(schoolAdmin({
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "teacher",
    },
  }));

  render(<App />);

  expect(
    screen.queryByRole("button", { name: "Students" }),
  ).not.toBeInTheDocument();
});

it("does not expose the school administration dashboard to students", () => {
  useAuth.mockReturnValue(schoolAdmin({
    user: {
      firstName: "Ayaan",
      lastName: "Khan",
      role: "student",
    },
  }));

  render(<App />);

  expect(
    screen.queryByRole("button", { name: "Students" }),
  ).not.toBeInTheDocument();
});

it("opens the school user directory from the administration navigation", async () => {
  useAuth.mockReturnValue(schoolAdmin());
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "User Management" }));

  expect(
    screen.getByRole("heading", { name: "School user directory displayed" }),
  ).toBeInTheDocument();
});
});
