
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../components/LoginPage.jsx";
import { useAuth } from "../context/authContext.js";

vi.mock("../context/authContext.js", () => ({
  useAuth: vi.fn(),
}));

describe("LoginPage", () => {
  const login = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ login });
  });

  it("renders the school ID, email, password, and sign-in button", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("School ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Sign in to school workspace" }),
    ).toBeInTheDocument();
  });

  it("calls login with the entered credentials", async () => {
    const user = userEvent.setup();
    login.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    await user.type(screen.getByLabelText("School ID"), "green-valley-school");
    await user.type(
      screen.getByLabelText("Email address"),
      "admin@school.com",
    );
    await user.type(screen.getByLabelText("Password"), "SecurePass123!");

    await user.click(
      screen.getByRole("button", { name: "Sign in to school workspace" }),
    );

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        tenantSlug: "green-valley-school",
        email: "admin@school.com",
        password: "SecurePass123!",
        workspace: "school",
      });
    });
  });


  it("allows platform administrators to sign in without a School ID", async () => {
    const user = userEvent.setup();
    login.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Platform Admin" }));

    expect(screen.queryByLabelText("School ID")).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Email address"),
      "platform@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "SecurePass123!");

    await user.click(
      screen.getByRole("button", { name: "Sign in to Platform Admin" }),
    );

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        tenantSlug: "",
        email: "platform@example.com",
        password: "SecurePass123!",
        workspace: "platform",
      });
    });
  });

  it("displays an error when login fails", async () => {
    const user = userEvent.setup();
    login.mockRejectedValueOnce(new Error("Invalid school ID or credentials."));

    render(<LoginPage />);

    await user.type(screen.getByLabelText("School ID"), "green-valley-school");
    await user.type(
      screen.getByLabelText("Email address"),
      "admin@school.com",
    );
    await user.type(screen.getByLabelText("Password"), "WrongPassword123!");

    await user.click(
      screen.getByRole("button", { name: "Sign in to school workspace" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid school ID or credentials.",
    );
  });

  it("disables the submit button while login is pending", async () => {
    const user = userEvent.setup();

    let resolveLogin;
    login.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText("School ID"), "green-valley-school");
    await user.type(
      screen.getByLabelText("Email address"),
      "admin@school.com",
    );
    await user.type(screen.getByLabelText("Password"), "SecurePass123!");

    await user.click(
      screen.getByRole("button", { name: "Sign in to school workspace" }),
    );

    expect(
      await screen.findByRole("button", { name: /Signing in/ }),
    ).toBeDisabled();

    resolveLogin();
  });
  
it("displays a fallback error when the login error has no message", async () => {
  const user = userEvent.setup();

  login.mockRejectedValueOnce({});

  render(<LoginPage />);

  await user.type(
    screen.getByLabelText("School ID"),
    "green-valley-school",
  );
  await user.type(
    screen.getByLabelText("Email address"),
    "admin@school.com",
  );
  await user.type(
    screen.getByLabelText("Password"),
    "SecurePass123!",
  );

  await user.click(
    screen.getByRole("button", { name: "Sign in to school workspace" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to sign in. Please try again.",
  );
});

});
