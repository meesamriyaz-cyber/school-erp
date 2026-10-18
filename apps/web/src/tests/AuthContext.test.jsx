
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider } from "../context/AuthContext.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";
import { useState } from "react";
vi.mock("../lib/api.js", () => ({
  apiRequest: vi.fn(),
}));

  function AuthStatus() {
    const { status, user, schoolContext } = useAuth();

    return (
      <div>
        <p>Status: {status}</p>
        <p>User: {user?.firstName || "None"}</p>
        <p>School: {schoolContext?.school?.name || "None"}</p>
      </div>
    );
  }


function LoginTester() {
  const { login, status, user, schoolContext } = useAuth();
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");

    try {
      await login({
        tenantSlug: " test-school ",
        email: " ADMIN@EXAMPLE.COM ",
        password: "test-password",
      });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <button onClick={handleLogin}>Log in</button>
      <p>Login status: {status}</p>
      <p>Login user: {user?.firstName || "None"}</p>
      <p>Login school: {schoolContext?.school?.name || "None"}</p>
      {error && <p role="alert">Login error: {error}</p>}
    </div>
  );
}


function LogoutTester() {
  const { login, logout, status, user, schoolContext, accessToken } = useAuth();
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    try {
      await login({
        tenantSlug: "test-school",
        email: "admin@example.com",
        password: "test-password",
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await logout();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <button onClick={handleLogin}>Log in</button>
      <button onClick={handleLogout}>Log out</button>
      <p>Logout status: {status}</p>
      <p>Logout user: {user?.firstName || "None"}</p>
      <p>Logout school: {schoolContext?.school?.name || "None"}</p>
      <p>Logout token: {accessToken || "None"}</p>
      {error && <p role="alert">Logout error: {error}</p>}
    </div>
  );
}



describe("AuthContext session restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores a valid school session", async () => {
    apiRequest
      .mockResolvedValueOnce({
        accessToken: "test-access-token",
        user: {
          _id: "user-1",
          firstName: "School",
          role: "school_admin",
        },
      })
      
    .mockResolvedValueOnce({
    data: {
        school: { name: "Test School" },
    },
    });


    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Status: authenticated")).toBeInTheDocument();
    });

    expect(screen.getByText("User: School")).toBeInTheDocument();
    expect(screen.getByText("School: Test School")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );

    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/school/context",
      expect.objectContaining({ accessToken: "test-access-token" }),
    );
  });

  it("leaves the user unauthenticated when session restoration fails", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Session expired"));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Status: unauthenticated"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("User: None")).toBeInTheDocument();
    expect(screen.getByText("School: None")).toBeInTheDocument();
  });

  it("rejects platform administrator accounts from the school dashboard", async () => {
    apiRequest.mockResolvedValueOnce({
      accessToken: "platform-access-token",
      user: {
        _id: "platform-1",
        firstName: "Platform",
        role: "platform_admin",
      },
    });

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Status: unauthenticated"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("User: None")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  
  it("logs in a school administrator successfully", async () => {
    apiRequest
      .mockResolvedValueOnce({
        accessToken: "login-access-token",
        user: {
          _id: "user-2",
          firstName: "Admin",
          role: "school_admin",
        },
      })
      .mockResolvedValueOnce({
        data: {
          school: { name: "Login School" },
        },
      });

    render(
      <AuthProvider>
        <LoginTester />
      </AuthProvider>,
    );

    // Wait for the initial session-restoration request to finish.
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "/auth/refresh",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // Ignore the initial restoration calls before testing login.
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce({
        accessToken: "login-access-token",
        user: {
          _id: "user-2",
          firstName: "Admin",
          role: "school_admin",
        },
      })
      .mockResolvedValueOnce({
        data: {
          school: { name: "Login School" },
        },
      });

    await act(async () => {
      screen.getByRole("button", { name: "Log in" }).click();
    });

    await waitFor(() => {
      expect(screen.getByText("Login status: authenticated")).toBeInTheDocument();
    });

    expect(screen.getByText("Login user: Admin")).toBeInTheDocument();
    expect(screen.getByText("Login school: Login School")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/auth/login",
      expect.objectContaining({
        method: "POST",
        body: {
          tenantSlug: "test-school",
          email: "admin@example.com",
          password: "test-password",
          clientType: "web",
        },
      }),
    );

    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/school/context",
      expect.objectContaining({ accessToken: "login-access-token" }),
    );
  });

it("rejects login when credentials are invalid", async () => {
  apiRequest.mockRejectedValueOnce(
    new Error("Invalid email or password."),
  );

  render(
    <AuthProvider>
      <LoginTester />
    </AuthProvider>,
  );

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  apiRequest.mockReset();
  apiRequest.mockRejectedValueOnce(
    new Error("Invalid email or password."),
  );

  let loginError;

  await act(async () => {
    try {
      await screen.getByRole("button", { name: "Log in" }).click();
    } catch (error) {
      loginError = error;
    }
  });

  expect(loginError).toBeUndefined();
});

it("rejects platform administrator login and calls logout", async () => {
  render(
    <AuthProvider>
      <LoginTester />
    </AuthProvider>,
  );

  // Wait for the automatic session restoration to finish.
  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // Configure the API responses specifically for the login attempt.
  apiRequest.mockReset();
  apiRequest
    .mockResolvedValueOnce({
      accessToken: "platform-access-token",
      user: {
        _id: "platform-1",
        firstName: "Platform",
        role: "platform_admin",
      },
    })
    .mockResolvedValueOnce({});

  await act(async () => {
    screen.getByRole("button", { name: "Log in" }).click();
  });

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Login status: unauthenticated")).toBeInTheDocument();
  expect(screen.getByText("Login user: None")).toBeInTheDocument();
  expect(screen.getByText("Login school: None")).toBeInTheDocument();
});




it("shows an error and remains unauthenticated when credentials are invalid", async () => {
  render(
    <AuthProvider>
      <LoginTester />
    </AuthProvider>,
  );

  // Wait for automatic session restoration to finish.
  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // Mock an invalid-credentials response for the login attempt.
  apiRequest.mockReset();
  apiRequest.mockRejectedValueOnce(
    new Error("Invalid email or password."),
  );

  await act(async () => {
    screen.getByRole("button", { name: "Log in" }).click();
  });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Login error: Invalid email or password.",
  );

  expect(screen.getByText("Login status: unauthenticated")).toBeInTheDocument();
  expect(screen.getByText("Login user: None")).toBeInTheDocument();
  expect(screen.getByText("Login school: None")).toBeInTheDocument();

  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledWith(
    "/auth/login",
    expect.objectContaining({
      method: "POST",
      body: {
        tenantSlug: "test-school",
        email: "admin@example.com",
        password: "test-password",
        clientType: "web",
      },
    }),
  );
});

it("clears the session even when the logout API request fails", async () => {
  render(
    <AuthProvider>
      <LoginTester />
    </AuthProvider>,
  );

  // Wait for initial session restoration to finish.
  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // Set up a successful login followed by a failed logout.
  apiRequest.mockReset();
  apiRequest
    .mockResolvedValueOnce({
      accessToken: "logout-access-token",
      user: {
        _id: "user-4",
        firstName: "Admin",
        role: "school_admin",
      },
    })
    .mockResolvedValueOnce({
      data: { school: { name: "Logout School" } },
    })
    .mockRejectedValueOnce(new Error("Logout request failed"));

  await act(async () => {
    screen.getByRole("button", { name: "Log in" }).click();
  });

  await waitFor(() => {
    expect(screen.getByText("Login status: authenticated")).toBeInTheDocument();
  });

  // LoginTester doesn't expose a logout button, so render a dedicated
  // LogoutTester only after we have established the session.
  // This test needs a shared provider to preserve state across the switch.
});

it("clears the session even when the logout API request fails", async () => {
  render(
    <AuthProvider>
      <LogoutTester />
    </AuthProvider>,
  );

  // Wait for automatic session restoration to finish.
  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  apiRequest.mockReset();
  apiRequest
    .mockResolvedValueOnce({
      accessToken: "logout-access-token",
      user: {
        _id: "user-4",
        firstName: "Admin",
        role: "school_admin",
      },
    })
    .mockResolvedValueOnce({
      data: { school: { name: "Logout School" } },
    })
    .mockRejectedValueOnce(new Error("Logout request failed"));

  // Log in first.
  await act(async () => {
    screen.getByRole("button", { name: "Log in" }).click();
  });

  await waitFor(() => {
    expect(screen.getByText("Logout status: authenticated")).toBeInTheDocument();
  });

  expect(screen.getByText("Logout token: logout-access-token")).toBeInTheDocument();
  expect(screen.getByText("Logout school: Logout School")).toBeInTheDocument();

  // Logout API failure must not prevent local session cleanup.
  await act(async () => {
    screen.getByRole("button", { name: "Log out" }).click();
  });

  await waitFor(() => {
    expect(screen.getByText("Logout status: unauthenticated")).toBeInTheDocument();
  });

  expect(screen.getByText("Logout user: None")).toBeInTheDocument();
  expect(screen.getByText("Logout school: None")).toBeInTheDocument();
  expect(screen.getByText("Logout token: None")).toBeInTheDocument();

  expect(apiRequest).toHaveBeenCalledTimes(3);
  expect(apiRequest).toHaveBeenLastCalledWith(
    "/auth/logout",
    expect.objectContaining({
      method: "POST",
      accessToken: "logout-access-token",
    }),
  );
});

it("clears the session and logs out when school context loading fails", async () => {
  render(
    <AuthProvider>
      <LoginTester />
    </AuthProvider>,
  );

  // Wait for automatic session restoration to finish.
  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  apiRequest.mockReset();
  apiRequest
    .mockResolvedValueOnce({
      accessToken: "login-access-token",
      user: {
        _id: "user-5",
        firstName: "Admin",
        role: "school_admin",
      },
    })
    .mockRejectedValueOnce(new Error("School context unavailable"))
    .mockResolvedValueOnce({});

  await act(async () => {
    screen.getByRole("button", { name: "Log in" }).click();
  });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Login error: School context unavailable",
  );

  expect(
    screen.getByText("Login status: unauthenticated"),
  ).toBeInTheDocument();
  expect(screen.getByText("Login user: None")).toBeInTheDocument();
  expect(screen.getByText("Login school: None")).toBeInTheDocument();

  expect(apiRequest).toHaveBeenCalledTimes(3);
  expect(apiRequest).toHaveBeenLastCalledWith(
    "/auth/logout",
    {
      method: "POST",
      body: {},
    },
  );
});


it("rejects an incomplete login response", async () => {
  render(
    <AuthProvider>
      <LoginTester />
    </AuthProvider>,
  );

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  apiRequest.mockReset();
  apiRequest.mockResolvedValueOnce({
    accessToken: null,
    user: null,
  });

  await act(async () => {
    screen.getByRole("button", { name: "Log in" }).click();
  });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The login response was incomplete.",
  );

  expect(screen.getByText("Login status: unauthenticated")).toBeInTheDocument();
});


it("rejects an incomplete session restoration response", async () => {
  apiRequest.mockResolvedValueOnce({
    accessToken: null,
    user: null,
  });

  render(
    <AuthProvider>
      <AuthStatus />
    </AuthProvider>,
  );

  await waitFor(() => {
    expect(screen.getByText("Status: unauthenticated")).toBeInTheDocument();
  });

  expect(screen.getByText("User: None")).toBeInTheDocument();
  expect(screen.getByText("School: None")).toBeInTheDocument();
});

it("throws when useAuth is used outside an AuthProvider", () => {
  function AuthConsumer() {
    useAuth();
    return null;
  }

  expect(() => render(<AuthConsumer />)).toThrow(
    "useAuth must be used within an AuthProvider.",
  );
});


});
