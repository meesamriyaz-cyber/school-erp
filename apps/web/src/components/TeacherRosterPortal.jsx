import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";

const keyOf = (item) => [
  item.academicYearId?._id || item.academicYearId,
  item.classId?._id || item.classId,
  item.sectionId?._id || item.sectionId || "all",
].join(":");

export default function TeacherRosterPortal({ accessToken, assignments = [] }) {
  const scopes = useMemo(() => {
    const unique = new Map();
    assignments.forEach((item) => { const key = keyOf(item); if (!unique.has(key)) unique.set(key, item); });
    return [...unique.entries()].map(([key, item]) => ({ key, item }));
  }, [assignments]);
  const [selectedKey, setSelectedKey] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = scopes.find((scope) => scope.key === selectedKey) || scopes[0];

  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      const assignment = selected.item;
      const yearId = assignment.academicYearId?._id || assignment.academicYearId;
      const classId = assignment.classId?._id || assignment.classId;
      const sectionId = assignment.sectionId?._id || assignment.sectionId;
      const params = new URLSearchParams({ academicYearId: String(yearId), classId: String(classId), status: "active" });
      if (sectionId) params.set("sectionId", String(sectionId));
      try {
        const response = await apiRequest(`/enrollments?${params.toString()}`, { accessToken, signal: controller.signal });
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load your assigned student roster.");
        if (!controller.signal.aborted) setStudents(response.data);
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) { setStudents([]); setError(err.message || "Unable to load your assigned student roster."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [accessToken, selected]);

  return <section className="teacher-roster">
    <header><div><h2>My students</h2><p>Student records are limited to your active teaching assignments.</p></div></header>
    {scopes.length ? <label className="teacher-roster-filter">Assigned class and section
      <select value={selected?.key || ""} onChange={(event) => setSelectedKey(event.target.value)}>
        {scopes.map(({ key, item }) => <option key={key} value={key}>
          {item.classId?.name || "Class"}{item.sectionId?.name ? ` · Section ${item.sectionId.name}` : " · All sections"} — {item.academicYearId?.name || "Academic year"}
        </option>)}
      </select>
    </label> : <p>No active teaching assignments found.</p>}
    {error && <p className="teacher-timetable-error" role="alert">{error}</p>}
    <div className="teacher-roster-table-wrap"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Section</th><th>Enrollment date</th><th>Status</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="5">Loading assigned students…</td></tr> : students.length ? students.map((enrollment) => <tr key={enrollment._id}>
        <td>{enrollment.studentId?.admissionNumber || "—"}</td>
        <td>{[enrollment.studentId?.firstName, enrollment.studentId?.lastName].filter(Boolean).join(" ") || "—"}</td>
        <td>{enrollment.sectionId?.name || "—"}</td>
        <td>{enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate).toLocaleDateString() : "—"}</td>
        <td>{enrollment.status}</td>
      </tr>) : !error && !loading && scopes.length ? <tr><td colSpan="5">No students found for this assignment.</td></tr> : null}
    </tbody></table></div>
  </section>;
}
