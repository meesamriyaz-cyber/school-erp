import { apiRequest } from "./apiClient";

export async function getAdmissionAcademicYears() {
  const response = await apiRequest("/academic-years");
  return response?.data ?? [];
}
export async function getAdmissionClasses(yearId) {
  const response = await apiRequest(`/classes?academicYearId=${encodeURIComponent(yearId)}&status=active`);
  return response?.data ?? [];
}
export async function getAdmissionSections(classId) {
  const response = await apiRequest(`/sections?classId=${encodeURIComponent(classId)}&status=active`);
  return response?.data ?? [];
}
export async function createEnrollment(body) {
  const response = await apiRequest("/enrollments", { method: "POST", body });
  return response?.data ?? null;
}
