import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/environment";
import { secureStorage } from "../auth/secureStorage";

let accessToken = null;
let refreshInFlight = null;
let onSessionExpired = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.message || "Request failed", response.status, payload);
  }
  return payload;
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await secureStorage.getRefreshToken();
    if (!refreshToken) throw new ApiError("Session expired. Please sign in again.", 401);

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientType: "mobile", refreshToken }),
    });
    const payload = await parseResponse(response);

    if (!payload?.accessToken || !payload?.refreshToken) {
      throw new ApiError("Invalid refresh response", 401, payload);
    }

    accessToken = payload.accessToken;
    await secureStorage.setRefreshToken(payload.refreshToken);
    return accessToken;
  })();

  try {
    return await refreshInFlight;
  } catch (error) {
    accessToken = null;
    await secureStorage.clearRefreshToken();
    onSessionExpired?.();
    throw error;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = true, retryAuth = true, headers = {} } = options;

  const execute = async (token) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "X-Client-Type": "mobile",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      return await parseResponse(response);
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await execute(accessToken);
  } catch (error) {
    if (auth && error.status === 401 && retryAuth) {
      const token = await refreshAccessToken();
      return execute(token);
    }
    throw error;
  }
}
