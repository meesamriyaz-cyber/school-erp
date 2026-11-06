import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./AttendanceManagement.css";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};
const STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

export default function AttendanceManagement() {
  const { accessToken } = useAuth();
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [sections, setSections] = useState([]);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState([]);
  const [summary, setSummary] = useState({ total: 0, marked: 0, present: 0, absent: 0, late: 0, excused: 0 });
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await apiRequest("/academic-years", { accessToken, signal: controller.signal });
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load academic years.");
        setYears(response.data);
        setYearId((response.data.find((item) => item.status === "active") || response.data[0])?._id || "");
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Unable to load academic years.");
      } finally {
        if (!controller.signal.aborted) setLoadingSetup(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    if (!yearId) { setClasses([]); setClassId(""); return undefined; }
    const controller = new AbortController();
    apiRequest(`/classes?academicYearId=${encodeURIComponent(yearId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load classes.");
        setClasses(response.data);
        setClassId((current) => current && response.data.some((item) => item._id === current) ? current : response.data[0]?._id || "");
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message || "Unable to load classes."); });
    return () => controller.abort();
  }, [accessToken, yearId]);

  useEffect(() => {
    if (!classId) { setSections([]); setSectionId(""); return undefined; }
    const controller = new AbortController();
    apiRequest(`/sections?classId=${encodeURIComponent(classId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load sections.");
        setSections(response.data);
        setSectionId((current) => current && response.data.some((item) => item._id === current) ? current : "");
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message || "Unable to load sections."); });
    return () => controller.abort();
  }, [accessToken, classId]);

  const loadRoster = useCallback(async (signal) => {
    if (!yearId || !classId || !date) { setRoster([]); return; }
    setLoadingRoster(true);
    setError("");
    try {
      const params = new URLSearchParams({ date, academicYearId: yearId, classId });
      if (sectionId) params.set("sectionId", sectionId);
      const response = await apiRequest(`/attendance?${params}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load the attendance register.");
      setRoster(response.data.map((item) => ({
        studentId: item.student._id,
        enrollmentId: item.enrollmentId,
        student: item.student,
        section: item.section,
        status: item.attendance?.status || "",
        remarks: item.attendance?.remarks || "",
      })));
      setSummary(response.summary || { total: response.data.length, marked: 0, present: 0, absent: 0, late: 0, excused: 0 });
    } catch (err) {
      if (err.name !== "AbortError") { setRoster([]); setError(err.message || "Unable to load the attendance register."); }
    } finally {
      if (!signal?.aborted) setLoadingRoster(false);
    }
  }, [accessToken, yearId, classId, sectionId, date]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRoster(controller.signal);
    return () => controller.abort();
  }, [loadRoster]);

  const counts = useMemo(() => roster.reduce((result, item) => {
    if (item.status) result[item.status] += 1;
    return result;
  }, { present: 0, absent: 0, late: 0, excused: 0 }), [roster]);

  const updateRecord = (studentId, patch) => {
    setRoster((current) => current.map((item) => item.studentId === studentId ? { ...item, ...patch } : item));
    setNotice("");
  };

  const markAll = (status) => {
    setRoster((current) => current.map((item) => ({ ...item, status })));
    setNotice("");
  };

  const save = async () => {
    const unmarked = roster.filter((item) => !item.status);
    if (unmarked.length) { setError(`Please mark attendance for all students. ${unmarked.length} remain unmarked.`); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/attendance", {
        method: "PUT", accessToken,
        body: { date, academicYearId: yearId, classId, ...(sectionId ? { sectionId } : {}),
          records: roster.map(({ studentId, status, remarks }) => ({ studentId, status, remarks })) },
      });
      if (!response?.success) throw new Error("Attendance could not be saved.");
      setNotice(`Attendance saved for ${response.savedCount} students.`);
      const controller = new AbortController();
      await loadRoster(controller.signal);
    } catch (err) { setError(err.message || "Unable to save attendance."); }
    finally { setSaving(false); }
  };

  const activeYear = years.find((item) => item._id === yearId);
  const canRecord = activeYear?.status === "active";

  return <section className="attendance-page">
    <div className="attendance-toolbar">
      <div><h2>Daily attendance</h2><p>Record and review attendance for an enrolled class.</p></div>
      <button className="attendance-save" type="button" onClick={save} disabled={saving || loadingRoster || !roster.length || !canRecord}>{saving ? "Saving…" : "Save attendance"}</button>
    </div>
    {error && <p className="attendance-alert" role="alert">{error}</p>}
    {notice && <p className="attendance-notice" role="status">{notice}</p>}
    <div className="attendance-filters">
      <label>Academic year<select value={yearId} disabled={loadingSetup} onChange={(e) => setYearId(e.target.value)}><option value="">Select year</option>{years.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Class<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Select class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Section<select value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">All sections</option>{sections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
    </div>
    {!canRecord && yearId && <p className="attendance-hint">Attendance can only be recorded for the active academic year.</p>}
    <div className="attendance-summary">
      <div><strong>{roster.length}</strong><span>Students</span></div>
      <div><strong>{counts.present}</strong><span>Present</span></div>
      <div><strong>{counts.absent}</strong><span>Absent</span></div>
      <div><strong>{counts.late}</strong><span>Late</span></div>
      <div><strong>{counts.excused}</strong><span>Excused</span></div>
      <div><strong>{roster.filter((item) => !item.status).length}</strong><span>Unmarked</span></div>
    </div>
    <div className="attendance-bulk-actions"><span>Quick mark:</span>{STATUSES.map((item) => <button type="button" key={item.value} onClick={() => markAll(item.value)} disabled={!roster.length}>{item.label} all</button>)}</div>
    <div className="attendance-table-wrap">
      <table className="attendance-table"><thead><tr><th>Admission no.</th><th>Student</th><th>Section</th><th>Attendance</th><th>Remarks</th></tr></thead>
        <tbody>{loadingRoster ? <tr><td colSpan="5">Loading attendance register…</td></tr> : roster.length ? roster.map((item) => <tr key={item.studentId}>
          <td>{item.student.admissionNumber}</td><td>{[item.student.firstName, item.student.lastName].filter(Boolean).join(" ")}</td><td>{item.section?.name || "—"}</td>
          <td><select aria-label={`Attendance for ${item.student.firstName}`} value={item.status} onChange={(e) => updateRecord(item.studentId, { status: e.target.value })}><option value="">Unmarked</option>{STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></td>
          <td><input aria-label={`Remarks for ${item.student.firstName}`} maxLength="300" value={item.remarks} onChange={(e) => updateRecord(item.studentId, { remarks: e.target.value })} placeholder="Optional note" /></td>
        </tr>) : <tr><td colSpan="5">{error ? "Attendance roster unavailable." : "No active enrolled students found for this selection."}</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
