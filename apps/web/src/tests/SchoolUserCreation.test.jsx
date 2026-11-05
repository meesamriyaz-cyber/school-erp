import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SchoolUserCreation from "../components/SchoolUserCreation.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "school-admin-token" }),
}));

describe("SchoolUserCreation", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a school user with the permitted fields and reports pending status", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({
      success: true,
      message: "User created and awaiting activation",
      data: {
        user: {
          id: "new-user-1",
          firstName: "Sara",
          lastName: "Ahmad",
          email: "sara@example.com",
          phone: "9876543210",
          role: "teacher",
          status: "pending",
        },
      },
    });

    render(<SchoolUserCreation onCreated={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/First name/i), "Sara");
    await user.type(screen.getByLabelText("Last name"), "Ahmad");
    await user.type(screen.getByLabelText("Email"), "Sara@Example.com");
    await user.type(screen.getByLabelText("Phone"), "9876543210");
    await user.selectOptions(screen.getByLabelText(/Role/i), "teacher");
    await user.type(screen.getByLabelText("Initial password"), "SecurePass123");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/pending|awaiting activation/i);
    expect(apiRequest).toHaveBeenCalledWith("/school/users", {
      method: "POST",
      accessToken: "school-admin-token",
      body: {
        firstName: "Sara",
        lastName: "Ahmad",
        email: "sara@example.com",
        phone: "9876543210",
        role: "teacher",
        password: "SecurePass123",
      },
    });
  });

  it("requires first name, a valid email, a role, and an initial password", async () => {
    const user = userEvent.setup();
    render(<SchoolUserCreation onCreated={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("rejects an initial password shorter than eight characters", async () => {
    const user = userEvent.setup();
    render(<SchoolUserCreation onCreated={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/First name/i), "Sara");
    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.selectOptions(screen.getByLabelText(/Role/i), "teacher");
    await user.type(screen.getByLabelText("Initial password"), "short");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/8 characters/i);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("keeps the form available and displays a duplicate-email API error", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValueOnce(new Error("A user with this email already exists in this school"));
    render(<SchoolUserCreation onCreated={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/First name/i), "Sara");
    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.selectOptions(screen.getByLabelText(/Role/i), "teacher");
    await user.type(screen.getByLabelText("Initial password"), "SecurePass123");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
    expect(screen.getByRole("button", { name: "Create user" })).toBeInTheDocument();
  });

  it("does not offer platform-admin or school-admin roles", () => {
    render(<SchoolUserCreation onCreated={vi.fn()} onCancel={vi.fn()} />);
    const roleSelect = screen.getByLabelText(/Role/i);
    expect(roleSelect).not.toHaveDisplayValue("Platform administrator");
    expect(screen.queryByRole("option", { name: /platform admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /school admin/i })).not.toBeInTheDocument();
  });

  it("calls the cancel callback", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SchoolUserCreation onCreated={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });
});
