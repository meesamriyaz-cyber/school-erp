import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthContext } from "./authContext.js";
import { apiRequest } from "../lib/api.js";


export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [schoolContext, setSchoolContext] = useState(null);
  const [status, setStatus] = useState("loading");

  const loadSchoolContext = useCallback(async (token) => {
    const response = await apiRequest("/school/context", {
      accessToken: token,
    });

    setSchoolContext(response.data);
    return response.data;
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const response = await apiRequest("/auth/refresh", {
        method: "POST",
        body: {},
      });

      if (!response.accessToken || !response.user) {
        throw new Error("The session response was incomplete.");
      }

      setAccessToken(response.accessToken);
      setUser(response.user);

      if (response.user.role === "platform_admin") {
        setSchoolContext(null);
      } else {
        await loadSchoolContext(response.accessToken);
      }

      setStatus("authenticated");
    } catch {
      setAccessToken(null);
      setUser(null);
      setSchoolContext(null);
      setStatus("unauthenticated");
    }
  }, [loadSchoolContext]);

useEffect(() => {
  let cancelled = false;

  const timerId = setTimeout(() => {
    if (!cancelled) {
      void restoreSession();
    }
  }, 0);

  return () => {
    cancelled = true;
    clearTimeout(timerId);
  };
}, [restoreSession]);

  const login = useCallback(
    async ({ tenantSlug, email, password, workspace = "school" }) => {
      const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();
      const response = await apiRequest("/auth/login", {
        method: "POST",
        body: {
          ...(workspace === "school" && normalizedTenantSlug
            ? { tenantSlug: normalizedTenantSlug }
            : {}),
          email: email.trim().toLowerCase(),
          password,
          clientType: "web",
        },
      });

      if (!response.accessToken || !response.user) {
        throw new Error("The login response was incomplete.");
      }

      const isPlatformAdmin = response.user.role === "platform_admin";

      if (workspace === "platform" && !isPlatformAdmin) {
        await apiRequest("/auth/logout", { method: "POST", body: {} });
        throw new Error("This account is not a Platform Administrator account.");
      }

      if (workspace === "school" && isPlatformAdmin) {
        await apiRequest("/auth/logout", { method: "POST", body: {} });
        throw new Error("Use the Platform Administrator sign-in option.");
      }

      setAccessToken(response.accessToken);
      setUser(response.user);

      if (isPlatformAdmin) {
        setSchoolContext(null);
        setStatus("authenticated");
        return;
      }

      try {
        await loadSchoolContext(response.accessToken);
        setStatus("authenticated");
      } catch (error) {
        setAccessToken(null);
        setUser(null);
        setSchoolContext(null);
        setStatus("unauthenticated");

        await apiRequest("/auth/logout", {
          method: "POST",
          body: {},
        }).catch(() => {});

        throw error;
      }
    },
    [loadSchoolContext],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: {},
        accessToken,
      });
    } finally {
      setAccessToken(null);
      setUser(null);
      setSchoolContext(null);
      setStatus("unauthenticated");
    }
  }, [accessToken]);

  const value = useMemo(
    () => ({
      accessToken,
      user,
      schoolContext,
      status,
      login,
      logout,
      restoreSession,
    }),
    [
      accessToken,
      user,
      schoolContext,
      status,
      login,
      logout,
      restoreSession,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}