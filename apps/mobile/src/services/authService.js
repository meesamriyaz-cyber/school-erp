import { apiRequest } from "./apiClient";
import { secureStorage } from "../auth/secureStorage";
import { setAccessToken } from "./apiClient";

export async function login({ email, password, tenantSlug, accountType = "school" }) {
  const payload = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    retryAuth: false,
    body: {
      email: email.trim().toLowerCase(),
      password,
      clientType: "mobile",
      ...(accountType === "school" ? { tenantSlug: tenantSlug.trim().toLowerCase() } : {}),
    },
  });

  if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
    throw new Error("The server returned an incomplete login response.");
  }

  setAccessToken(payload.accessToken);
  await secureStorage.setRefreshToken(payload.refreshToken);
  return payload.user;
}

export async function restoreSession() {
  const refreshToken = await secureStorage.getRefreshToken();
  if (!refreshToken) return null;

  const payload = await apiRequest("/auth/refresh", {
    method: "POST",
    auth: false,
    retryAuth: false,
    body: { clientType: "mobile", refreshToken },
  });

  if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
    throw new Error("The server returned an incomplete session response.");
  }

  setAccessToken(payload.accessToken);
  await secureStorage.setRefreshToken(payload.refreshToken);
  return payload.user;
}

export async function logout() {
  const refreshToken = await secureStorage.getRefreshToken();
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      auth: false,
      retryAuth: false,
      body: { clientType: "mobile", refreshToken },
    });
  } finally {
    setAccessToken(null);
    await secureStorage.clearRefreshToken();
  }
}
