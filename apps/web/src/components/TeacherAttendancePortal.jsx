import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./TeacherAttendancePortal.css";

const today = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; };
const STATUSES = ["present", "absent", "late", "excused"];

export default function TeacherAttendancePortal() {
  const { accessToken } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState([]);
  const [summary, setSummary] = useState({ total: 0, marked: 0, present: 0, absent: 0, late: 0, excused: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/teacher-assignments?status=active", { accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load your teaching assignments.");
        const unique = new Map();
        response.data.forEach((item) => unique.set(`${item.academicYearId?._id}:${item.classId?._id}:${item.sectionId?._id || "none"}`, item));
        const list = [...unique.values()];
        setAssignments(list);
        setAssignmentId(list[0]?._id || "");
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message || "Unable to load assignments."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken]);

  const selected = assignments.find((item) => item._id === assignmentId);
  const loadRoster = useCallback(async (signal) => {
    if (!selected || !date) { setRoster([]); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ date, academicYearId: selected.academicYearId._id, classId: selected.classId._id });
      if (selected.sectionId?._id) params.set("sectionId", selected.sectionId._id);
      const response = await apiRequest(`/attendance?${params}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load the attendance register.");
      setRoster(response.data.map((item) => ({ studentId: item.student._id, student: item.student, status: item.attendance?.status || "", remarks: item.attendance?.remarks || "" })));
      setSummary(response.summary || { total: response.data.length, marked: 0, present: 0, absent: 0, late: 0, excused: 0 });
    } catch (err) { if (err.name !== "AbortError") { setRoster([]); setError(err.message || "Unable to load attendance."); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [accessToken, selected, date]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => loadRoster(controller.signal)); return () => controller.abort(); }, [loadRoster]);
  const counts = useMemo(() => roster.reduce((result, item) => { if (item.status) result[item.status] += 1; return result; }, { present: 0, absent: 0, late: 0, excused: 0 }), [roster]);
  const markAll = (status) => setRoster((current) => current.map((item) => ({ ...item, status })));
  const save = async () => {
    if (!selected) return;
    const unmarked = roster.filter((item) => !item.status).length;
    if (unmarked) { setError(`${unmarked} student(s) are still unmarked.`); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const body = { date, academicYearId: selected.academicYearId._id, classId: selected.classId._id, ...(selected.sectionId?._id ? { sectionId: selected.sectionId._id } : {}), records: roster.map(({ studentId, status, remarks }) => ({ studentId, status, remarks })) };
      const response = await apiRequest("/attendance", { method: "PUT", accessToken, body });
      if (!response?.success) throw new Error("Attendance could not be saved.");
      setNotice(`Attendance saved for ${response.savedCount} students.`);
      const controller = new AbortController(); await loadRoster(controller.signal);
    } catch (err) { setError(err.message || "Unable to save attendance."); }
    finally { setSaving(false); }
  };
  return <section className="teacher-attendance">
    <div className="teacher-attendance-heading"><div><h2>Daily attendance</h2><p>Mark attendance only for your assigned classes and sections.</p></div><button type="button" onClick={save} disabled={saving || loading || !roster.length}>{saving ? "Saving…" : "Save attendance"}</button></div>
    {error && <p className="teacher-attendance-error" role="alert">{error}</p>}{notice && <p className="teacher-attendance-notice" role="status">{notice}</p>}
    <div className="teacher-attendance-filters"><label>Assigned class<select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="">Select assignment</option>{assignments.map((item) => <option key={item._id} value={item._id}>{item.classId?.name || "Class"}{item.sectionId?.name ? ` · ${item.sectionId.name}` : " · All sections"} — {item.subjectId?.name || "Subject"}</option>)}</select></label><label>Attendance date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
    <div className="teacher-attendance-summary"><div><strong>{summary.total}</strong><span>Students</span></div><div><strong>{counts.present}</strong><span>Present</span></div><div><strong>{counts.absent}</strong><span>Absent</span></div><div><strong>{counts.late}</strong><span>Late</span></div><div><strong>{counts.excused}</strong><span>Excused</span></div><div><strong>{roster.filter((item) => !item.status).length}</strong><span>Unmarked</span></div></div>
    <div className="teacher-attendance-bulk">{STATUSES.map((status) => <button key={status} type="button" disabled={!roster.length} onClick={() => markAll(status)}>Mark all {status}</button>)}</div>
    <div className="teacher-attendance-table-wrap"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{loading ? <tr><td colSpan="4">Loading…</td></tr> : roster.length ? roster.map((item) => <tr key={item.studentId}><td>{item.student.admissionNumber}</td><td>{[item.student.firstName, item.student.lastName].filter(Boolean).join(" ")}</td><td><select aria-label={`Attendance for ${item.student.firstName}`} value={item.status} onChange={(event) => setRoster((current) => current.map((row) => row.studentId === item.studentId ? { ...row, status: event.target.value } : row))}><option value="">Unmarked</option>{STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></td><td><input maxLength="300" aria-label={`Remarks for ${item.student.firstName}`} value={item.remarks} onChange={(event) => setRoster((current) => current.map((row) => row.studentId === item.studentId ? { ...row, remarks: event.target.value } : row))} /></td></tr>) : <tr><td colSpan="4">No active students found for this assignment.</td></tr>}</tbody></table></div>
  </section>;
}