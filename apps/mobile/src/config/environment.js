const configuredApiUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export const API_BASE_URL = (configuredApiUrl || "http://localhost:5000/api/v1").replace(/\\/$/, "");
export const REQUEST_TIMEOUT_MS = 15000;
