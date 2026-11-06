import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./TimetableManagement.css";

const emptyForm = { academicYearId: "", classId: "", sectionId: "", assignmentId: "", dayOfWeek: "1", periodNumber: "1", startTime: "09:00", endTime: "09:45", room: "" };
const weekdays = [{ value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }];
const teacherName = (assignment) => [assignment?.teacherId?.firstName, assignment?.teacherId?.lastName].filter(Boolean).join(" ") || assignment?.teacherId?.email || "Teacher";

export default function TimetableManagement() {
  const { accessToken } = useAuth();
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState({ academicYearId: "", classId: "", sectionId: "" });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visibleClasses = useMemo(() => classes.filter((item) => !filter.academicYearId || String(item.academicYearId) === String(filter.academicYearId)), [classes, filter.academicYearId]);
  const formClasses = useMemo(() => classes.filter((item) => !form.academicYearId || String(item.academicYearId) === String(form.academicYearId)), [classes, form.academicYearId]);
  const availableAssignments = useMemo(() => assignments.filter((item) =>
    item.status === "active" && String(item.academicYearId?._id || item.academicYearId) === String(form.academicYearId) &&
    String(item.classId?._id || item.classId) === String(form.classId) &&
    (!item.sectionId || String(item.sectionId?._id || item.sectionId) === String(form.sectionId))
  ), [assignments, form.academicYearId, form.classId, form.sectionId]);

  const loadEntries = useCallback(async (signal) => {
    const params = new URLSearchParams();
    if (filter.academicYearId) params.set("academicYearId", filter.academicYearId);
    if (filter.classId) params.set("classId", filter.classId);
    if (filter.sectionId) params.set("sectionId", filter.sectionId);
    const response = await apiRequest(`/timetable?${params.toString()}`, { accessToken, signal });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load timetable.");
    setEntries(response.data);
  }, [accessToken, filter]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError("");
      try {
        const [yearResponse, classResponse, assignmentResponse] = await Promise.all([
          apiRequest("/academic-years", { accessToken, signal: controller.signal }),
          apiRequest("/classes?status=active", { accessToken, signal: controller.signal }),
          apiRequest("/teacher-assignments?status=active", { accessToken, signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setYears(Array.isArray(yearResponse?.data) ? yearResponse.data.filter((year) => year.status !== "closed") : []);
        setClasses(Array.isArray(classResponse?.data) ? classResponse.data : []);
        setAssignments(Array.isArray(assignmentResponse?.data) ? assignmentResponse.data : []);
        await loadEntries(controller.signal);
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load timetable data.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [accessToken, loadEntries]);

  useEffect(() => {
    if (!form.classId) { setSections([]); return undefined; }
    const controller = new AbortController();
    apiRequest(`/sections?classId=${encodeURIComponent(form.classId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setSections(Array.isArray(response?.data) ? response.data : []); })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load sections."); });
    return () => controller.abort();
  }, [accessToken, form.classId]);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...form, dayOfWeek: Number(form.dayOfWeek), periodNumber: Number(form.periodNumber) };
      if (!payload.sectionId) delete payload.sectionId;
      const response = await apiRequest("/timetable", { method: "POST", accessToken, body: payload });
      if (!response?.success) throw new Error(response?.message || "Unable to save timetable entry.");
      setNotice("Timetable period added successfully."); setForm(emptyForm); setShowForm(false);
      await loadEntries();
    } catch (err) { setError(err.message || "Unable to save timetable entry."); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (entry) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/timetable/${entry._id}`, { method: "PATCH", accessToken, body: { status: entry.status === "active" ? "inactive" : "active" } });
      if (!response?.success) throw new Error(response?.message || "Unable to update timetable entry.");
      setNotice("Timetable period status updated."); await loadEntries();
    } catch (err) { setError(err.message || "Unable to update timetable entry."); }
  };

  const dayLabel = (day) => weekdays.find((item) => item.value === day)?.label || "—";

  return <section className="timetable-management" aria-labelledby="timetable-title">
    <div className="timetable-heading"><div><p className="timetable-eyebrow">ACADEMIC OPERATIONS</p><h2 id="timetable-title">Timetable Management</h2><p>Build the weekly class schedule using approved teacher–subject assignments.</p></div>
      <button type="button" className="timetable-primary" onClick={() => setShowForm((value) => !value)}>{showForm ? "Cancel" : "+ Add period"}</button>
    </div>
    {notice && <p className="timetable-notice" role="status">{notice}</p>}
    {error && <p className="timetable-error" role="alert">{error}</p>}
    {showForm && <form className="timetable-form" onSubmit={submit}>
      <h3>New timetable period</h3>
      <div className="timetable-form-grid">
        <label>Academic year<select required value={form.academicYearId} onChange={(e) => setForm((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "", assignmentId: "" }))}><option value="">Select year</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}</select></label>
        <label>Class<select required value={form.classId} onChange={(e) => setForm((v) => ({ ...v, classId: e.target.value, sectionId: "", assignmentId: "" }))}><option value="">Select class</option>{formClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>Section<select value={form.sectionId} onChange={(e) => setForm((v) => ({ ...v, sectionId: e.target.value, assignmentId: "" }))}><option value="">Class-wide / no section</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
        <label>Teacher & subject assignment<select required value={form.assignmentId} onChange={(e) => setForm((v) => ({ ...v, assignmentId: e.target.value }))}><option value="">Select assignment</option>{availableAssignments.map((item) => <option key={item._id} value={item._id}>{teacherName(item)} — {item.subjectId?.name || "Subject"}{item.sectionId ? " (Section-specific)" : ""}</option>)}</select></label>
        <label>Weekday<select value={form.dayOfWeek} onChange={(e) => setForm((v) => ({ ...v, dayOfWeek: e.target.value }))}>{weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
        <label>Period number<input type="number" min="1" max="20" required value={form.periodNumber} onChange={(e) => setForm((v) => ({ ...v, periodNumber: e.target.value }))} /></label>
        <label>Start time<input type="time" required value={form.startTime} onChange={(e) => setForm((v) => ({ ...v, startTime: e.target.value }))} /></label>
        <label>End time<input type="time" required value={form.endTime} onChange={(e) => setForm((v) => ({ ...v, endTime: e.target.value }))} /></label>
        <label>Room / classroom (optional)<input maxLength="50" value={form.room} onChange={(e) => setForm((v) => ({ ...v, room: e.target.value }))} placeholder="e.g. Room 12" /></label>
      </div>
      <div className="timetable-form-actions"><button type="submit" className="timetable-primary" disabled={saving || !form.academicYearId || !form.classId || !form.assignmentId}>{saving ? "Saving…" : "Save period"}</button></div>
      <p className="timetable-help">Monday–Saturday schedule. Class/section and teacher time conflicts are checked before saving.</p>
    </form>}
    <div className="timetable-toolbar"><h3>Weekly schedule</h3><div>
      <label>Academic year<select value={filter.academicYearId} onChange={(e) => setFilter((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "" }))}><option value="">All years</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}</select></label>
      <label>Class<select value={filter.classId} onChange={(e) => setFilter((v) => ({ ...v, classId: e.target.value, sectionId: "" }))}><option value="">All classes</option>{visibleClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Section<select value={filter.sectionId} onChange={(e) => setFilter((v) => ({ ...v, sectionId: e.target.value }))}><option value="">All sections</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
    </div></div>
    <div className="timetable-table-wrap"><table className="timetable-table"><thead><tr><th>Day</th><th>Period</th><th>Time</th><th>Class / Section</th><th>Subject</th><th>Teacher</th><th>Room</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="9">Loading timetable…</td></tr> : entries.length ? entries.map((entry) => <tr key={entry._id}>
        <td>{dayLabel(entry.dayOfWeek)}</td><td>{entry.periodNumber}</td><td>{entry.startTime}–{entry.endTime}</td><td>{entry.classId?.name || "—"}{entry.sectionId?.name ? <small>Section {entry.sectionId.name}</small> : <small>Class-wide</small>}</td>
        <td>{entry.assignmentId?.subjectId?.name || "—"}</td><td>{teacherName(entry.assignmentId)}</td><td>{entry.room || "—"}</td><td><span className={`timetable-status status-${entry.status}`}>{entry.status}</span></td>
        <td><button type="button" className="timetable-action" onClick={() => void toggleStatus(entry)}>{entry.status === "active" ? "Deactivate" : "Activate"}</button></td>
      </tr>) : <tr><td colSpan="9">No timetable periods found for these filters.</td></tr>}
    </tbody></table></div>
    <p className="timetable-help">Inactive periods are hidden from the active schedule. Reactivating a period is blocked if its linked teacher assignment is inactive.</p>
  </section>;
}
