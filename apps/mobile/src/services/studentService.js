import { apiRequest } from "./apiClient";

export async function getStudents({ page = 1, limit = 20, search = "", status = "all" } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) params.set("search", search.trim());
  if (status !== "all") params.set("status", status);
  const response = await apiRequest(`/students?${params.toString()}`);
  return { students: response?.data ?? [], pagination: response?.pagination ?? null };
}

export async function getStudentById(studentId) {
  const response = await apiRequest(`/students/${encodeURIComponent(studentId)}`);
  return response?.data ?? null;
}

export async function createStudent(body) {
  const response = await apiRequest("/students", { method: "POST", body });
  return response?.data ? { ...response.data, parentVerification: response.parents ?? [] } : null;
}
