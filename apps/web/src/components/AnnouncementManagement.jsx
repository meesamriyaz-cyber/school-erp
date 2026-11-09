import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./AnnouncementManagement.css";

const categories = [
  ["general", "General"], ["academic", "Academic"], ["examination", "Examination"],
  ["event", "Event"], ["holiday", "Holiday"], ["urgent", "Urgent"],
];
const dateLabel = (value) => value
  ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  : "—";

export default function AnnouncementManagement() {
  const { accessToken, user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [items, setItems] = useState([]);
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadItems = useCallback(async (signal) => {
    try {
      const response = await apiRequest("/announcements", { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load announcements.");
      setItems(response.data);
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "Unable to load announcements.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      apiRequest("/academic-years", { accessToken, signal: controller.signal }),
      loadItems(controller.signal),
    ]).then(([yearResponse]) => {
      if (!controller.signal.aborted && yearResponse?.success) {
        setYears(Array.isArray(yearResponse.data) ? yearResponse.data : []);
      }
    }).catch((err) => {
      if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load school setup.");
    });
    return () => controller.abort();
  }, [accessToken, loadItems]);

  useEffect(() => {
    if (!form?.academicYearId) { setClasses([]); return undefined; }
    const controller = new AbortController();
    apiRequest(`/classes?academicYearId=${encodeURIComponent(form.academicYearId)}`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setClasses(response?.success && Array.isArray(response.data) ? response.data.filter((item) => item.status === "active") : []);
      })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [accessToken, form?.academicYearId]);

  useEffect(() => {
    if (!form?.classId || form.audienceType !== "SECTION") { setSections([]); return undefined; }
    const controller = new AbortController();
    apiRequest(`/sections?classId=${encodeURIComponent(form.classId)}`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setSections(response?.success && Array.isArray(response.data) ? response.data.filter((item) => item.status === "active") : []);
      })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [accessToken, form?.classId, form?.audienceType]);

  const activeYears = useMemo(() => years.filter((year) => year.status === "active"), [years]);
  const visibleItems = items.filter((item) => filter === "all" || item.status === filter);
  const startCreate = () => {
    const year = activeYears[0] || years.find((item) => item.status !== "closed");
    setError(""); setNotice("");
    setForm({
      title: "", body: "", category: "general", audienceType: isTeacher ? "CLASS" : "SCHOOL",
      academicYearId: year?._id || "", classId: "", sectionId: "", expiresAt: "",
    });
  };
  const startEdit = (item) => {
    setError(""); setNotice("");
    setForm({
      _id: item._id, title: item.title, body: item.body, category: item.category,
      audienceType: item.audienceType, academicYearId: item.academicYearId?._id || item.academicYearId,
      classId: item.classId?._id || item.classId || "", sectionId: item.sectionId?._id || item.sectionId || "",
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 16) : "",
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError(""); setNotice("");
    const body = {
      title: form.title.trim(), body: form.body.trim(), category: form.category,
      ...(form._id ? {} : {
        audienceType: form.audienceType, academicYearId: form.academicYearId,
        classId: form.audienceType === "SCHOOL" ? null : form.classId,
        sectionId: form.audienceType === "SECTION" ? form.sectionId : null,
      }),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
    try {
      const response = await apiRequest(form._id ? `/announcements/${form._id}` : "/announcements", {
        method: form._id ? "PATCH" : "POST", accessToken, body,
      });
      if (!response?.success) throw new Error("Unable to save the announcement.");
      setForm(null); setNotice(form._id ? "Draft updated." : "Announcement saved as a draft.");
      await loadItems();
    } catch (err) { setError(err.message || "Unable to save the announcement."); }
    finally { setSaving(false); }
  };
  const transition = async (item, action) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/announcements/${item._id}/${action}`, { method: "PATCH", accessToken });
      if (!response?.success) throw new Error(`Unable to ${action} this announcement.`);
      setNotice(action === "publish" ? "Announcement published." : "Announcement archived.");
      await loadItems();
    } catch (err) { setError(err.message || "The announcement could not be updated."); }
  };

  return <section className="announcement-page" aria-labelledby="announcement-title">
    <div className="announcement-intro">
      <div><p className="announcement-eyebrow">{isTeacher ? "TEACHER WORKSPACE" : "SCHOOL COMMUNICATION"}</p><h2 id="announcement-title">Announcements & notices</h2><p>Publish important information for the school community, classes or sections.</p></div>
      <button type="button" className="announcement-primary" onClick={startCreate}>+ New announcement</button>
    </div>
    {notice && <p className="announcement-success" role="status">{notice}</p>}
    {error && <p className="announcement-error" role="alert">{error}</p>}
    <div className="announcement-toolbar">
      <label>Show <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All notices</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      <span>{visibleItems.length} notice{visibleItems.length === 1 ? "" : "s"}</span>
    </div>
    {form && <form className="announcement-form" onSubmit={submit}>
      <div className="announcement-form-heading"><h3>{form._id ? "Edit draft" : "Create announcement"}</h3><button type="button" className="announcement-text-button" onClick={() => setForm(null)}>Cancel</button></div>
      <label>Title<input value={form.title} maxLength={160} minLength={3} required onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
      <label>Message<textarea value={form.body} maxLength={10000} rows={5} required onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} /></label>
      <div className="announcement-fields">
        <label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {!form._id && <label>Audience<select value={form.audienceType} onChange={(event) => setForm((current) => ({ ...current, audienceType: event.target.value, classId: "", sectionId: "" }))}>{!isTeacher && <option value="SCHOOL">Entire school</option>}<option value="CLASS">A class</option><option value="SECTION">A section</option></select></label>}
        {!form._id && <label>Academic year<select value={form.academicYearId} required onChange={(event) => setForm((current) => ({ ...current, academicYearId: event.target.value, classId: "", sectionId: "" }))}><option value="">Select academic year</option>{years.filter((year) => year.status !== "closed").map((year) => <option key={year._id} value={year._id}>{year.name} · {year.status}</option>)}</select></label>}
        {!form._id && form.audienceType !== "SCHOOL" && <label>Class<select value={form.classId} required onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value, sectionId: "" }))}><option value="">Select class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>}
        {!form._id && form.audienceType === "SECTION" && <label>Section<select value={form.sectionId} required onChange={(event) => setForm((current) => ({ ...current, sectionId: event.target.value }))}><option value="">Select section</option>{sections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>}
        <label>Expiry (optional)<input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
      </div>
      <div className="announcement-form-actions"><button type="button" className="announcement-secondary" onClick={() => setForm(null)}>Cancel</button><button type="submit" className="announcement-primary" disabled={saving || (!form._id && (!form.academicYearId || (form.audienceType !== "SCHOOL" && !form.classId) || (form.audienceType === "SECTION" && !form.sectionId)))}>{saving ? "Saving…" : "Save draft"}</button></div>
    </form>}
    {loading ? <p className="announcement-empty">Loading announcements…</p> : visibleItems.length === 0 ? <div className="announcement-empty"><h3>No announcements found</h3><p>Notices you create or are authorized to manage will appear here.</p></div> : <div className="announcement-list">
      {visibleItems.map((item) => <article className="announcement-card" key={item._id}>
        <div className="announcement-card-top"><span className={`announcement-category category-${item.category}`}>{categories.find(([value]) => value === item.category)?.[1] || item.category}</span><span className={`announcement-status status-${item.status}`}>{item.status}</span></div>
        <h3>{item.title}</h3><p className="announcement-card-body">{item.body}</p>
        <div className="announcement-meta"><span>{item.audienceType === "SCHOOL" ? "Entire school" : item.audienceType === "SECTION" ? `${item.classId?.name || "Class"} · Section ${item.sectionId?.name || ""}` : item.classId?.name || "Class"}</span><span>Published {dateLabel(item.publishedAt)}</span>{item.expiresAt && <span>Expires {dateLabel(item.expiresAt)}</span>}</div>
        <div className="announcement-card-actions">
          {item.status === "draft" && <><button type="button" className="announcement-secondary" onClick={() => startEdit(item)}>Edit</button><button type="button" className="announcement-primary" onClick={() => void transition(item, "publish")}>Publish</button></>}
          {item.status === "published" && <button type="button" className="announcement-secondary" onClick={() => void transition(item, "archive")}>Archive</button>}
        </div>
      </article>)}
    </div>}
  </section>;
}
