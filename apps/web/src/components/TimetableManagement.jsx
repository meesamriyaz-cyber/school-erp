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
  const [editingEntryId, setEditingEntryId] = useState("");
  const [scheduleView, setScheduleView] = useState("week");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [academicSchedule, setAcademicSchedule] = useState({ periods: [], breaks: [] });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const visibleClasses = useMemo(() => classes.filter((item) => !filter.academicYearId || String(item.academicYearId) === String(filter.academicYearId)), [classes, filter.academicYearId]);
  const formClasses = useMemo(() => classes.filter((item) => !form.academicYearId || String(item.academicYearId) === String(form.academicYearId)), [classes, form.academicYearId]);
  const configuredPeriods = useMemo(() => String(form.academicYearId) === String(filter.academicYearId) ? academicSchedule.periods : [], [academicSchedule.periods, filter.academicYearId, form.academicYearId]);
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
    const sectionClassId = form.classId || filter.classId;
    if (!sectionClassId) { setSections([]); return undefined; }
    const controller = new AbortController();
    apiRequest(`/sections?classId=${encodeURIComponent(sectionClassId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setSections(Array.isArray(response?.data) ? response.data : []); })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load sections."); });
    return () => controller.abort();
  }, [accessToken, form.classId, filter.classId]);

  useEffect(() => {
    if (!filter.academicYearId) { setAcademicSchedule({ periods: [], breaks: [] }); return undefined; }
    const controller = new AbortController();
    setScheduleLoading(true);
    apiRequest(`/academic-schedule?academicYearId=${encodeURIComponent(filter.academicYearId)}`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success) throw new Error(response?.message || "Unable to load academic periods.");
        if (!controller.signal.aborted) setAcademicSchedule({ periods: response.data?.periods || [], breaks: response.data?.breaks || [] });
      })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load academic schedule."); })
      .finally(() => { if (!controller.signal.aborted) setScheduleLoading(false); });
    return () => controller.abort();
  }, [accessToken, filter.academicYearId]);

  const saveAcademicSchedule = async (event) => {
    event.preventDefault(); setScheduleSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/academic-schedule", { method: "PUT", accessToken, body: { academicYearId: filter.academicYearId, periods: academicSchedule.periods, breaks: academicSchedule.breaks } });
      if (!response?.success) throw new Error(response?.message || "Unable to save academic schedule.");
      setAcademicSchedule({ periods: response.data.periods || [], breaks: response.data.breaks || [] });
      setNotice("Academic periods and breaks saved successfully.");
    } catch (err) { setError(err.message || "Unable to save academic schedule."); }
    finally { setScheduleSaving(false); }
  };

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...form, dayOfWeek: Number(form.dayOfWeek), periodNumber: Number(form.periodNumber) };
      if (!payload.sectionId) delete payload.sectionId;
      const requestBody = editingEntryId
        ? { assignmentId: payload.assignmentId, dayOfWeek: payload.dayOfWeek, periodNumber: payload.periodNumber, startTime: payload.startTime, endTime: payload.endTime, room: payload.room }
        : payload;
      const response = await apiRequest(editingEntryId ? `/timetable/${editingEntryId}` : "/timetable", {
        method: editingEntryId ? "PATCH" : "POST", accessToken, body: requestBody,
      });
      if (!response?.success) throw new Error(response?.message || "Unable to save timetable entry.");
      setNotice(editingEntryId ? "Timetable period updated successfully." : "Timetable period added successfully.");
      setForm(emptyForm); setEditingEntryId(""); setShowForm(false);
      await loadEntries();
    } catch (err) { setError(err.message || "Unable to save timetable entry."); }
    finally { setSaving(false); }
  };

  const editEntry = (entry) => {
    setError(""); setNotice("");
    setEditingEntryId(entry._id);
    setFilter((v) => ({ ...v, academicYearId: entry.academicYearId?._id || entry.academicYearId }));
    setForm({
      academicYearId: entry.academicYearId?._id || entry.academicYearId,
      classId: entry.classId?._id || entry.classId,
      sectionId: entry.sectionId?._id || entry.sectionId || "",
      assignmentId: entry.assignmentId?._id || entry.assignmentId,
      dayOfWeek: String(entry.dayOfWeek), periodNumber: String(entry.periodNumber),
      startTime: entry.startTime, endTime: entry.endTime, room: entry.room || "",
    });
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditingEntryId(""); setForm(emptyForm); };

  const toggleStatus = async (entry) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/timetable/${entry._id}`, { method: "PATCH", accessToken, body: { status: entry.status === "active" ? "inactive" : "active" } });
      if (!response?.success) throw new Error(response?.message || "Unable to update timetable entry.");
      setNotice("Timetable period status updated."); await loadEntries();
    } catch (err) { setError(err.message || "Unable to update timetable entry."); }
  };

  const dayLabel = (day) => weekdays.find((item) => item.value === day)?.label || "—";
  const entriesByDay = useMemo(() => weekdays.map((day) => ({ ...day, entries: entries.filter((entry) => entry.dayOfWeek === day.value).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.periodNumber - b.periodNumber) })), [entries]);

  return <section className="timetable-management" aria-labelledby="timetable-title">
    <div className="timetable-heading"><div><p className="timetable-eyebrow">ACADEMIC OPERATIONS</p><h2 id="timetable-title">Timetable Management</h2><p>Build the weekly class schedule using approved teacher–subject assignments.</p></div>
      <button type="button" className="timetable-primary" onClick={() => showForm ? cancelForm() : setShowForm(true)}>{showForm ? "Cancel" : "+ Add period"}</button>
    </div>
    {notice && <p className="timetable-notice" role="status">{notice}</p>}
    {error && <p className="timetable-error" role="alert">{error}</p>}
    {showForm && <form className="timetable-form" onSubmit={submit}>
      <h3>{editingEntryId ? "Edit timetable period" : "New timetable period"}</h3>
      <div className="timetable-form-grid">
        <label>Academic year<select disabled={Boolean(editingEntryId)} required value={form.academicYearId} onChange={(e) => setForm((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "", assignmentId: "", periodNumber: "1", startTime: "09:00", endTime: "09:45" })); setFilter((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "" }));}><option value="">Select year</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}</select></label>
        <label>Class<select disabled={Boolean(editingEntryId)} required value={form.classId} onChange={(e) => setForm((v) => ({ ...v, classId: e.target.value, sectionId: "", assignmentId: "" }))}><option value="">Select class</option>{formClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>Section<select disabled={Boolean(editingEntryId)} value={form.sectionId} onChange={(e) => setForm((v) => ({ ...v, sectionId: e.target.value, assignmentId: "" }))}><option value="">Class-wide / no section</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
        <label>Teacher & subject assignment<select required value={form.assignmentId} onChange={(e) => setForm((v) => ({ ...v, assignmentId: e.target.value }))}><option value="">Select assignment</option>{availableAssignments.map((item) => <option key={item._id} value={item._id}>{teacherName(item)} — {item.subjectId?.name || "Subject"}{item.sectionId ? " (Section-specific)" : ""}</option>)}</select></label>
        <label>Weekday<select value={form.dayOfWeek} onChange={(e) => setForm((v) => ({ ...v, dayOfWeek: e.target.value }))}>{weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
        <label>Period number{configuredPeriods.length ? <select required value={form.periodNumber} onChange={(e) => { const selected = configuredPeriods.find((item) => item.periodNumber === Number(e.target.value)); setForm((v) => ({ ...v, periodNumber: e.target.value, startTime: selected?.startTime || v.startTime, endTime: selected?.endTime || v.endTime })); }}><option value="">Select configured period</option>{configuredPeriods.map((item) => <option key={item.periodNumber} value={item.periodNumber}>Period {item.periodNumber}{item.label ? ` — ${item.label}` : ""} ({item.startTime}–{item.endTime})</option>)}</select> : <input type="number" min="1" max="20" required value={form.periodNumber} onChange={(e) => setForm((v) => ({ ...v, periodNumber: e.target.value }))} />}</label>
        <label>Start time<input type="time" required readOnly={configuredPeriods.length > 0} value={form.startTime} onChange={(e) => setForm((v) => ({ ...v, startTime: e.target.value }))} /></label>
        <label>End time<input type="time" required readOnly={configuredPeriods.length > 0} value={form.endTime} onChange={(e) => setForm((v) => ({ ...v, endTime: e.target.value }))} /></label>
        <label>Room / classroom (optional)<input maxLength="50" value={form.room} onChange={(e) => setForm((v) => ({ ...v, room: e.target.value }))} placeholder="e.g. Room 12" /></label>
      </div>
      <div className="timetable-form-actions"><button type="submit" className="timetable-primary" disabled={saving || !form.academicYearId || !form.classId || !form.assignmentId}>{saving ? "Saving…" : editingEntryId ? "Update period" : "Save period"}</button></div>
      <p className="timetable-help">{configuredPeriods.length ? "Select a configured academic period; its official start and end times are applied automatically. Breaks are not selectable." : "No bell schedule is configured for this academic year yet. Manual period timings remain available. Class/section and teacher time conflicts are checked before saving."}</p>
    </form>}
    <section className="academic-schedule-panel" aria-labelledby="academic-schedule-title">
      <div className="academic-schedule-heading"><div><h3 id="academic-schedule-title">Academic periods & breaks</h3><p>Configure the bell schedule for the selected academic year. Breaks are kept separate from teaching periods.</p></div></div>
      {!filter.academicYearId ? <p className="timetable-help">Select an academic year above to configure its periods and breaks.</p> : scheduleLoading ? <p className="timetable-help">Loading academic schedule…</p> : (
        <form onSubmit={saveAcademicSchedule}>
          <div className="academic-schedule-columns">
            <div><div className="academic-schedule-subheading"><strong>Teaching periods</strong><button type="button" className="timetable-action" onClick={() => setAcademicSchedule((v) => ({ ...v, periods: [...v.periods, { periodNumber: v.periods.length + 1, label: "", startTime: "09:00", endTime: "09:45" }] }))}>+ Add period</button></div>
              {academicSchedule.periods.map((period, index) => <div className="academic-schedule-row" key={index}>
                <label>Period<input type="number" min="1" max="20" value={period.periodNumber} onChange={(e) => setAcademicSchedule((v) => ({ ...v, periods: v.periods.map((item, i) => i === index ? { ...item, periodNumber: Number(e.target.value) } : item) }))} /></label>
                <label>Name<input maxLength="40" value={period.label || ""} placeholder="e.g. Mathematics" onChange={(e) => setAcademicSchedule((v) => ({ ...v, periods: v.periods.map((item, i) => i === index ? { ...item, label: e.target.value } : item) }))} /></label>
                <label>From<input type="time" value={period.startTime} onChange={(e) => setAcademicSchedule((v) => ({ ...v, periods: v.periods.map((item, i) => i === index ? { ...item, startTime: e.target.value } : item) }))} /></label>
                <label>To<input type="time" value={period.endTime} onChange={(e) => setAcademicSchedule((v) => ({ ...v, periods: v.periods.map((item, i) => i === index ? { ...item, endTime: e.target.value } : item) }))} /></label>
                <button type="button" className="timetable-action" aria-label={`Remove period ${period.periodNumber}`} onClick={() => setAcademicSchedule((v) => ({ ...v, periods: v.periods.filter((_, i) => i !== index) }))}>Remove</button>
              </div>)}
            </div>
            <div><div className="academic-schedule-subheading"><strong>Breaks</strong><button type="button" className="timetable-action" onClick={() => setAcademicSchedule((v) => ({ ...v, breaks: [...v.breaks, { label: "", startTime: "10:30", endTime: "10:45" }] }))}>+ Add break</button></div>
              {academicSchedule.breaks.map((item, index) => <div className="academic-schedule-row academic-break-row" key={index}>
                <label>Name<input required maxLength="40" value={item.label} placeholder="e.g. Short break" onChange={(e) => setAcademicSchedule((v) => ({ ...v, breaks: v.breaks.map((row, i) => i === index ? { ...row, label: e.target.value } : row) }))} /></label>
                <label>From<input type="time" value={item.startTime} onChange={(e) => setAcademicSchedule((v) => ({ ...v, breaks: v.breaks.map((row, i) => i === index ? { ...row, startTime: e.target.value } : row) }))} /></label>
                <label>To<input type="time" value={item.endTime} onChange={(e) => setAcademicSchedule((v) => ({ ...v, breaks: v.breaks.map((row, i) => i === index ? { ...row, endTime: e.target.value } : row) }))} /></label>
                <button type="button" className="timetable-action" aria-label={`Remove ${item.label || "break"}`} onClick={() => setAcademicSchedule((v) => ({ ...v, breaks: v.breaks.filter((_, i) => i !== index) }))}>Remove</button>
              </div>)}
            </div>
          </div>
          <div className="timetable-form-actions"><button type="submit" className="timetable-primary" disabled={scheduleSaving}>{scheduleSaving ? "Saving…" : "Save periods & breaks"}</button></div>
        </form>
      )}
    </section>
    <div className="timetable-toolbar"><h3>Weekly schedule</h3><div className="timetable-toolbar-actions">
      <label>Academic year<select value={filter.academicYearId} onChange={(e) => setFilter((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "" }))}><option value="">All years</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}</select></label>
      <label>Class<select value={filter.classId} onChange={(e) => setFilter((v) => ({ ...v, classId: e.target.value, sectionId: "" }))}><option value="">All classes</option>{visibleClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Section<select value={filter.sectionId} onChange={(e) => setFilter((v) => ({ ...v, sectionId: e.target.value }))}><option value="">All sections</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
      <button type="button" className="timetable-print-button" onClick={() => window.print()}>Print timetable</button>
    </div></div>
    <div className="timetable-view-toggle" role="group" aria-label="Timetable display">
      <button type="button" className={scheduleView === "week" ? "active" : ""} aria-pressed={scheduleView === "week"} onClick={() => setScheduleView("week")}>Weekly view</button>
      <button type="button" className={scheduleView === "list" ? "active" : ""} aria-pressed={scheduleView === "list"} onClick={() => setScheduleView("list")}>List view</button>
    </div>
    <div className="timetable-print-area">
    <div className="timetable-print-heading"><h2>Class Timetable</h2><p>{years.find((year) => String(year._id) === String(filter.academicYearId))?.name || "All academic years"} · {visibleClasses.find((item) => String(item._id) === String(filter.classId))?.name || "All classes"}{filter.sectionId ? ` · ${sections.find((item) => String(item._id) === String(filter.sectionId))?.name || "Selected section"}` : ""}</p></div>
    {scheduleView === "week" ? <div className="timetable-week-grid">
      {entriesByDay.map((day) => <section className="timetable-week-day" key={day.value} aria-label={day.label}>
        <h4>{day.label}<span>{day.entries.length} {day.entries.length === 1 ? "period" : "periods"}</span></h4>
        {day.entries.length ? <div className="timetable-week-periods">{day.entries.map((entry) => <article className={`timetable-week-period status-${entry.status}`} key={entry._id}>
          <div className="timetable-week-period-time">P{entry.periodNumber} · {entry.startTime}–{entry.endTime}</div>
          <strong>{entry.assignmentId?.subjectId?.name || "—"}</strong>
          <span>{entry.classId?.name || "—"}{entry.sectionId?.name ? ` · ${entry.sectionId.name}` : ""}</span>
          <span>{teacherName(entry.assignmentId)}</span>
          {entry.room && <small>{entry.room}</small>}
          <div className="timetable-week-actions"><button type="button" className="timetable-action" onClick={() => editEntry(entry)}>Edit</button><button type="button" className="timetable-action" onClick={() => void toggleStatus(entry)}>{entry.status === "active" ? "Deactivate" : "Activate"}</button></div>
        </article>)}</div> : <p className="timetable-week-empty">No periods</p>}
      </section>)}
    </div> : <div className="timetable-table-wrap"><table className="timetable-table"><thead><tr><th>Day</th><th>Period</th><th>Time</th><th>Class / Section</th><th>Subject</th><th>Teacher</th><th>Room</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="9">Loading timetable…</td></tr> : entries.length ? entries.map((entry) => <tr key={entry._id}>
        <td>{dayLabel(entry.dayOfWeek)}</td><td>{entry.periodNumber}</td><td>{entry.startTime}–{entry.endTime}</td><td>{entry.classId?.name || "—"}{entry.sectionId?.name ? <small>Section {entry.sectionId.name}</small> : <small>Class-wide</small>}</td>
        <td>{entry.assignmentId?.subjectId?.name || "—"}</td><td>{teacherName(entry.assignmentId)}</td><td>{entry.room || "—"}</td><td><span className={`timetable-status status-${entry.status}`}>{entry.status}</span></td>
        <td><div className="timetable-row-actions"><button type="button" className="timetable-action" onClick={() => editEntry(entry)}>Edit</button><button type="button" className="timetable-action" onClick={() => void toggleStatus(entry)}>{entry.status === "active" ? "Deactivate" : "Activate"}</button></div></td>
      </tr>) : <tr><td colSpan="9">No timetable periods found for these filters.</td></tr>}
    </tbody></table></div>}
    </div>
    <p className="timetable-help">Inactive periods are hidden from the active schedule. Reactivating a period is blocked if its linked teacher assignment is inactive.</p>
  </section>;
}
