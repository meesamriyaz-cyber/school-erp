import { apiRequest } from "./apiClient";

export async function getTimetable(params = {}) {
  const query = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value)).join("&");
  return apiRequest("/timetable" + (query ? "?" + query : ""));
}

export async function getTimetableAcademicYears() {
  const response = await apiRequest("/academic-years");
  return response?.data ?? [];
}

export async function getTimetableClasses(yearId) {
  const response = await apiRequest("/classes?academicYearId=" + encodeURIComponent(yearId) + "&status=active");
  return response?.data ?? [];
}

export async function getTimetableSections(classId) {
  const response = await apiRequest("/sections?classId=" + encodeURIComponent(classId) + "&status=active");
  return response?.data ?? [];
}

export async function getBellSchedule(yearId) {
  const response = await apiRequest("/academic-schedule?academicYearId=" + encodeURIComponent(yearId));
  return response?.data ?? { periods: [], breaks: [] };
}
