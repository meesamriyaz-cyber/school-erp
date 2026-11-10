import { useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";

const id = (value) => String(value?._id || value || "");
const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";

export default function TeacherReportsPortal({ accessToken, assignments = [] }) {
  const scopes = useMemo(() => {
    const unique = new Map();
    assignments.forEach((item) => {
      const key = `${id(item.academicYearId)}:${id(item.classId)}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    return [...unique.entries()].map(([key, item]) => ({ key, item }));
  }, [assignments]);
  const [selectedKey, setSelectedKey] = useState("");
  const selected = scopes.find((item) => item.key === selectedKey) || scopes[0];
  const year = selected?.item.academicYearId;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = dateValue(year?.startDate);
  const defaultTo = dateValue(year?.endDate) && dateValue(year.endDate) < today ? dateValue(year.endDate) : today;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runReport = async () => {
    if (!selected || !(from || defaultFrom) || !(to || defaultTo)) return;
    setLoading(true); setError(""); setReport(null);
    const params = new URLSearchParams({
      academicYearId: id(selected.item.academicYearId),
      classId: id(selected.item.classId),
      from: from || defaultFrom,
      to: to || defaultTo,
    });
    try {
      const response = await apiRequest(`/attendance/reports?${params.toString()}`, { accessToken });
      if (!response?.success) throw new Error("Unable to load your attendance report.");
      setReport(response);
    } catch (err) { setError(err.message || "Unable to load your attendance report."); }
    finally { setLoading(false); }
  };

  return <section className="teacher-reports">
    <header><div><h2>My class reports</h2><p>Attendance information is calculated only for classes and sections assigned to you.</p></div></header>
    {scopes.length ? <>
      <div className="teacher-report-filters">
        <label>Assigned class<select value={selected?.key || ""} onChange={(event) => { setSelectedKey(event.target.value); setReport(null); }}>
          {scopes.map(({ key, item }) => <option key={key} value={key}>{item.classId?.name || "Class"} — {item.academicYearId?.name || "Academic year"}</option>)}
        </select></label>
        <label>From<input type="date" value={from || defaultFrom} min={defaultFrom || undefined} max={dateValue(year?.endDate) || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to || defaultTo} min={from || defaultFrom || undefined} max={dateValue(year?.endDate) || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="button" disabled={loading || !(from || defaultFrom) || !(to || defaultTo)} onClick={() => void runReport()}>{loading ? "Generating…" : "Generate report"}</button>
      </div>
    </> : <p>No active teaching assignments are available for reports.</p>}
    {error && <p className="teacher-timetable-error" role="alert">{error}</p>}
    {report && <>
      <div className="teacher-report-summary">
        <article><strong>{report.summary?.students ?? 0}</strong><span>Assigned students</span></article>
        <article><strong>{report.summary?.present ?? 0}</strong><span>Present</span></article>
        <article><strong>{report.summary?.absent ?? 0}</strong><span>Absent</span></article>
        <article><strong>{report.summary?.percentage == null ? "—" : `${report.summary.percentage}%`}</strong><span>Attendance rate</span></article>
      </div>
      <div className="teacher-report-table"><table><thead><tr><th>Student</th><th>Section</th><th>Present</th><th>Absent</th><th>Late</th><th>Attendance</th></tr></thead><tbody>
        {(report.students || []).map((item) => <tr key={item.enrollmentId || item.studentId}><td>{item.name} <small>{item.admissionNumber}</small></td><td>{item.sectionName}</td><td>{item.present}</td><td>{item.absent}</td><td>{item.late}</td><td>{item.percentage == null ? "—" : `${item.percentage}%`}</td></tr>)}
        {!report.students?.length && <tr><td colSpan="6">No attendance records are available for this period.</td></tr>}
      </tbody></table></div>
    </>}
  </section>;
}
