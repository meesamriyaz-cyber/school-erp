import { apiRequest } from "./apiClient";

export async function getDashboardOverview() {
  const response = await apiRequest("/reports/dashboard");
  return response?.data ?? null;
}
