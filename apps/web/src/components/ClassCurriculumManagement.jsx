import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";

export default function ClassCurriculumManagement() {
  const { accessToken, user } = useAuth();
  const canManage = ["school_admin", "principal"].includes(user?.role);
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [form, setForm] = useState({ subjectId: "", category: "compulsory", weeklyPeriods: 0, sortOrder: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSetup = useCallback(async () => {
    const [y, s] = await Promise.all([
      apiRequest("/academic-years", { accessToken }),
      apiRequest("/subjects?status=active", { accessToken }),
    ]);
    if (!y?.success || !s?.success) throw new Error("Unable to load curriculum setup");
    setYears(y.data || []); setSubjects(s.data || []);
    setYearId((v) => v || y.data?.find((item) => item.status === "active")?._id || "");
  }, [accessToken]);

  const loadClasses = useCallback(async () => {
    if (!yearId) { setClasses([]); setClassId(""); return; }
    const response = await apiRequest(`/classes?academicYearId=${encodeURIComponent(yearId)}&status=active`, { accessToken });
    if (!response?.success) throw new Error("Unable to load classes");
    setClasses(response.data || []);
    setClassId((current) => response.data?.some((item) => item._id === current) ? current : response.data?.[0]?._id || "");
  }, [accessToken, yearId]);

  const loadMappings = useCallback(async () => {
    if (!yearId || !classId) { setMappings([]); return; }
    const response = await apiRequest(`/class-subjects?academicYearId=${encodeURIComponent(yearId)}&classId=${encodeURIComponent(classId)}`, { accessToken });
    if (!response?.success) throw new Error("Unable to load class curriculum");
    setMappings(response.data || []);
  }, [accessToken, yearId, classId]);

  useEffect(() => { let alive = true; Promise.resolve().then(async () => { try { await loadSetup(); } catch (e) { if (alive) setError(e.message); } finally { if (alive) setLoading(false); } }); return () => { alive = false; }; }, [loadSetup]);
  useEffect(() => { let alive = true; Promise.resolve().then(async () => { try { await loadClasses(); } catch (e) { if (alive) setError(e.message); } }); return () => { alive = false; }; }, [loadClasses]);
  useEffect(() => { let alive = true; Promise.resolve().then(async () => { try { await loadMappings(); } catch (e) { if (alive) setError(e.message); } }); return () => { alive = false; }; }, [loadMappings]);

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/class-subjects/classes/${classId}`, { method: "PUT", accessToken, body: { ...form, weeklyPeriods: Number(form.weeklyPeriods), sortOrder: Number(form.sortOrder) } });
      if (!response?.success) throw new Error(response?.message || "Unable to save curriculum mapping");
      setNotice("Class curriculum updated."); setForm({ subjectId: "", category: "compulsory", weeklyPeriods: 0, sortOrder: 0 }); await loadMappings();
    } catch (e) { setError(e.message || "Unable to save curriculum mapping"); }
    finally { setSaving(false); }
  };

  const setStatus = async (mapping) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/class-subjects/classes/${classId}`, { method: "PUT", accessToken, body: { subjectId: mapping.subjectId?._id || mapping.subjectId, category: mapping.category, weeklyPeriods: mapping.weeklyPeriods, sortOrder: mapping.sortOrder, status: mapping.status === "active" ? "inactive" : "active" } });
      if (!response?.success) throw new Error(response?.message || "Unable to update mapping");
      setNotice("Curriculum mapping status updated."); await loadMappings();
    } catch (e) { setError(e.message || "Unable to update mapping"); }
  };

  const available = subjects.filter((subject) => !mappings.some((mapping) => String(mapping.subjectId?._id || mapping.subjectId) === String(subject._id)));
  return <section className="content-card phase7-page">
    <div className="phase7-heading"><div><p className="eyebrow">ACADEMIC STRUCTURE</p><h2>Class curriculum</h2><p>Define the subjects each class studies independently of teacher assignments.</p></div></div>
    <div className="phase7-filters"><label>Academic year<select value={yearId} onChange={(e) => setYearId(e.target.value)}>{years.map((year) => <option key={year._id} value={year._id}>{year.name} · {year.status}</option>)}</select></label><label>Class<select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label></div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {canManage && <form className="phase7-form" onSubmit={save}>
      <label>Subject<select required value={form.subjectId} onChange={(e) => setForm((v) => ({ ...v, subjectId: e.target.value }))}><option value="">Select subject</option>{available.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}{subject.code ? ` · ${subject.code}` : ""}</option>)}</select></label>
      <label>Type<select value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}><option value="compulsory">Compulsory</option><option value="elective">Elective</option></select></label>
      <label>Weekly periods<input type="number" min="0" max="60" value={form.weeklyPeriods} onChange={(e) => setForm((v) => ({ ...v, weeklyPeriods: e.target.value }))} /></label>
      <label>Display order<input type="number" min="0" max="1000" value={form.sortOrder} onChange={(e) => setForm((v) => ({ ...v, sortOrder: e.target.value }))} /></label>
      <button type="submit" disabled={saving || !classId || !form.subjectId}>{saving ? "Saving…" : "Add to curriculum"}</button>
    </form>}
    {loading ? <p>Loading curriculum…</p> : <div className="phase7-table-wrap"><table><thead><tr><th>Subject</th><th>Type</th><th>Weekly periods</th><th>Status</th><th>Revision history</th>{canManage && <th>Action</th>}</tr></thead><tbody>
      {mappings.length ? mappings.map((mapping) => <tr key={mapping._id}><td>{mapping.subjectId?.name || "—"}{mapping.subjectId?.code ? <small> · {mapping.subjectId.code}</small> : ""}</td><td>{mapping.category}</td><td>{mapping.weeklyPeriods}</td><td>{mapping.status}</td><td><strong>Revision {mapping.revision || 1}</strong><details><summary>{mapping.history?.length || 0} prior changes</summary>{mapping.history?.length ? <ol>{mapping.history.map((entry, index) => <li key={`${mapping._id}-${index}`}>{entry.category}, {entry.weeklyPeriods} periods, {entry.status}<small>{entry.changedAt ? new Date(entry.changedAt).toLocaleDateString("en-IN") : "—"} · {[entry.changedBy?.firstName, entry.changedBy?.lastName].filter(Boolean).join(" ") || "Administrator"}</small></li>)}</ol> : <small>No previous revisions</small>}</details></td>{canManage && <td><button type="button" onClick={() => void setStatus(mapping)}>{mapping.status === "active" ? "Deactivate" : "Reactivate"}</button></td>}</tr>) : <tr><td colSpan={canManage ? 6 : 5}>No curriculum subjects configured for this class.</td></tr>}
    </tbody></table></div>}
  </section>;
}
