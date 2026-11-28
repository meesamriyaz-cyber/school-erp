import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { restoreSession, login as performLogin, logout as performLogout } from "../services/authService";
import { setSessionExpiredHandler, setAccessToken } from "../services/apiClient";
import { secureStorage } from "./secureStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus("unauthenticated");
    });

    restoreSession()
      .then((restoredUser) => {
        setUser(restoredUser);
        setStatus(restoredUser ? "authenticated" : "unauthenticated");
      })
      .catch(async () => {
        setAccessToken(null);
        await secureStorage.clearRefreshToken();
        setUser(null);
        setStatus("unauthenticated");
      });
  }, []);

  const signIn = async (credentials) => {
    const authenticatedUser = await performLogin(credentials);
    setUser(authenticatedUser);
    setStatus("authenticated");
    return authenticatedUser;
  };

  const signOut = async () => {
    try {
      await performLogout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  };

  const value = useMemo(() => ({ user, status, signIn, signOut }), [user, status]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
