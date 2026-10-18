
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

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      screen.getByText(/Restoring your school session/),
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
});

});
