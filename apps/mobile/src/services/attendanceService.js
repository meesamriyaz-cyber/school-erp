import { apiRequest } from './apiClient';

export async function getAcademicYears() { const r = await apiRequest('/academic-years'); return r?.data ?? []; }
export async function getClasses(yearId) { const r = await apiRequest('/classes?academicYearId=' + encodeURIComponent(yearId) + '&status=active'); return r?.data ?? []; }
export async function getSections(classId) { const r = await apiRequest('/sections?classId=' + encodeURIComponent(classId) + '&status=active'); return r?.data ?? []; }
export async function getTerms(yearId) { const r = await apiRequest('/academic-terms?academicYearId=' + encodeURIComponent(yearId) + '&status=active'); return r?.data ?? []; }
export async function getRoster({date, yearId, classId, sectionId, termId}) { let q = 'date=' + encodeURIComponent(date) + '&academicYearId=' + encodeURIComponent(yearId) + '&classId=' + encodeURIComponent(classId); if(sectionId) q += '&sectionId=' + encodeURIComponent(sectionId); if(termId) q += '&academicTermId=' + encodeURIComponent(termId); return apiRequest('/attendance?' + q); }
export async function saveMarks(body) { return apiRequest('/attendance', { method: 'PUT', body }); }
