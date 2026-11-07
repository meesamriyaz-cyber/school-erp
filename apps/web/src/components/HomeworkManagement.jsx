import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./HomeworkManagement.css";

const today = () => new Date().toISOString().slice(0, 10);
const initialForm = () => ({ academicYearId: "", classId: "", sectionId: "", subjectId: "", title: "", instructions: "", assignedDate: today(), dueDate: today(), status: "published" });

export default function HomeworkManagement() {
  const { accessToken } = useAuth();
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (signal) => {
    setLoading(true);
    try {
      const [yearResponse, classResponse, sectionResponse, subjectResponse, homeworkResponse] = await Promise.all([
        apiRequest("/academic-years", { accessToken, signal }),
        apiRequest("/classes", { accessToken, signal }),
        apiRequest("/sections", { accessToken, signal }),
        apiRequest("/subjects", { accessToken, signal }),
        apiRequest("/homework", { accessToken, signal }),
      ]);
      setYears(yearResponse.data || []);
      setClasses(classResponse.data || []);
      setSections(sectionResponse.data || []);
      setSubjects(subjectResponse.data || []);
      setItems(homeworkResponse.data || []);
      const activeYear = (yearResponse.data || []).find((year) => year.status === "active");
      if (activeYear) setForm((v) => v.academicYearId ? v : { ...v, academicYearId: activeYear._id });
    } catch (err) {
      if (err.name !== "AbortError" && !signal?.aborted) setError(err.message || "Unable to load homework workspace.");
    } finally { if (!signal?.aborted) setLoading(false); }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [accessToken]);

  const availableSections = useMemo(() => sections.filter((item) => String(item.classId?._id || item.classId) === String(form.classId)), [sections, form.classId]);
  const availableClasses = useMemo(() => classes.filter((item) => !form.academicYearId || String(item.academicYearId?._id || item.academicYearId) === String(form.academicYearId)), [classes, form.academicYearId]);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/homework", { method: "POST", accessToken, body: { ...form, sectionId: form.sectionId || null } });
      setItems((current) => [response.data, ...current]);
      setNotice(form.status === "published" ? "Homework published for the selected class." : "Homework saved as a draft.");
      setForm((v) => ({ ...initialForm(), academicYearId: v.academicYearId, classId: v.classId, sectionId: v.sectionId, subjectId: v.subjectId }));
    } catch (err) { setError(err.message || "Unable to save homework."); }
    finally { setSaving(false); }
  };

  const updateStatus = async (item, status) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/homework/${item._id}/status`, { method: "PATCH", accessToken, body: { status } });
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, status: response.data.status } : entry));
      setNotice(status === "published" ? "Homework published." : "Homework moved to drafts.");
    } catch (err) { setError(err.message || "Unable to update homework."); }
  };

  return <section className="homework-page" aria-labelledby="homework-title">
    <header className="homework-intro"><div><span>TEACHING & LEARNING</span><h2 id="homework-title">Homework & classwork</h2><p>Create assignments for a class or section and share instructions with students and parents.</p></div><strong>{items.length} assignments</strong></header>
    {error && <p className="homework-error" role="alert">{error}</p>}
    {notice && <p className="homework-notice" role="status">{notice}</p>}
    <article className="homework-card"><h3>Create assignment</h3><form className="homework-form" onSubmit={submit}>
      <label>Academic year<select required value={form.academicYearId} onChange={(e) => setForm((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "" }))}><option value="">Select academic year</option>{years.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Class<select required value={form.classId} onChange={(e) => setForm((v) => ({ ...v, classId: e.target.value, sectionId: "" }))}><option value="">Select class</option>{availableClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Section<select value={form.sectionId} onChange={(e) => setForm((v) => ({ ...v, sectionId: e.target.value }))}><option value="">All sections</option>{availableSections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Subject<select required value={form.subjectId} onChange={(e) => setForm((v) => ({ ...v, subjectId: e.target.value }))}><option value="">Select subject</option>{subjects.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label className="homework-wide">Assignment title<input required minLength="3" maxLength="120" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="e.g. Chapter 4 exercise" /></label>
      <label className="homework-wide">Instructions<textarea required maxLength="5000" rows="4" value={form.instructions} onChange={(e) => setForm((v) => ({ ...v, instructions: e.target.value }))} placeholder="Describe the work students need to complete." /></label>
      <label>Assigned date<input type="date" required value={form.assignedDate} onChange={(e) => setForm((v) => ({ ...v, assignedDate: e.target.value, dueDate: v.dueDate < e.target.value ? e.target.value : v.dueDate }))} /></label>
      <label>Due date<input type="date" required min={form.assignedDate} value={form.dueDate} onChange={(e) => setForm((v) => ({ ...v, dueDate: e.target.value }))} /></label>
      <label>Save as<select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))}><option value="published">Publish now</option><option value="draft">Draft</option></select></label>
      <div className="homework-actions"><button className="homework-primary" disabled={saving || loading}>{saving ? "Saving…" : form.status === "published" ? "Publish assignment" : "Save draft"}</button></div>
    </form></article>
    <article className="homework-card"><div className="homework-list-heading"><div><h3>Assignment register</h3><p>Published assignments are visible to linked students and parents from the assigned date.</p></div></div>
      {loading ? <p className="homework-empty">Loading assignments…</p> : items.length ? <div className="homework-list">{items.map((item) => <div className="homework-item" key={item._id}>
        <div className="homework-item-main"><div><strong>{item.title}</strong><span>{item.classId?.name || "Class"}{item.sectionId?.name ? ` · Section ${item.sectionId.name}` : " · All sections"} · {item.subjectId?.name || "Subject"}</span></div><em className={`homework-status status-${item.status}`}>{item.status}</em></div>
        <p>{item.instructions}</p><footer><span>Assigned {new Date(item.assignedDate).toLocaleDateString("en-IN")} · Due {new Date(item.dueDate).toLocaleDateString("en-IN")}</span><button type="button" onClick={() => void updateStatus(item, item.status === "published" ? "draft" : "published")}>{item.status === "published" ? "Move to draft" : "Publish"}</button></footer>
      </div>)}</div> : <p className="homework-empty">No homework has been created yet.</p>}
    </article>
  </section>;
}
