const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(
  path,
  { method = "GET", body, accessToken, signal } = {},
) {
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Unable to connect to the server. Check that the API is running.",
      0,
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Some responses may not contain JSON.
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || "The request could not be completed.",
      response.status,
      data,
    );
  }

  return data;
}