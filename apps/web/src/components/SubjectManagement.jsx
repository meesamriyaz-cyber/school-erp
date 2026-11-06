import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./SubjectManagement.css";

const canWriteRole = (role) => ["school_admin", "principal"].includes(String(role || "").toLowerCase());

function SubjectForm({ subject, saving, onCancel, onSubmit }) {
  const [name, setName] = useState(subject?.name || "");
  const [code, setCode] = useState(subject?.code || "");
  const [category, setCategory] = useState(subject?.category || "core");
  const [description, setDescription] = useState(subject?.description || "");
  return <form className="subject-form" onSubmit={(event) => {
    event.preventDefault();
    onSubmit({ name: name.trim(), code: code.trim(), category, description: description.trim() });
  }}>
    <h3>{subject ? "Edit subject" : "Add subject"}</h3>
    <div className="subject-form-grid">
      <label>Subject name<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mathematics" /></label>
      <label>Subject code (optional)<input maxLength={20} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. MATH" /></label>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="core">Core</option><option value="elective">Elective</option></select></label>
      <label>Description (optional)<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short subject description" /></label>
    </div>
    <div className="subject-form-actions"><button type="button" className="subject-button secondary" onClick={onCancel}>Cancel</button><button type="submit" className="subject-button primary" disabled={saving || !name.trim()}>{saving ? "Saving…" : subject ? "Save changes" : "Create subject"}</button></div>
  </form>;
}

export default function SubjectManagement() {
  const { accessToken, user } = useAuth();
  const canManage = canWriteRole(user?.role);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSubjects = useCallback(async (signal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      const response = await apiRequest(`/subjects?${params.toString()}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load subjects.");
      setSubjects(response.data);
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") { setSubjects([]); setError(err.message || "Unable to load subjects."); }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [accessToken, search, category, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void loadSubjects(controller.signal), 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [loadSubjects]);

  const saveSubject = async (fields) => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(editing ? `/subjects/${editing._id}` : "/subjects", {
        method: editing ? "PATCH" : "POST", accessToken,
        body: fields,
      });
      if (!response?.success) throw new Error("Unable to save subject.");
      setFormOpen(false); setEditing(null);
      setNotice(editing ? "Subject updated successfully." : "Subject created successfully.");
      await loadSubjects();
    } catch (err) { setError(err.message || "Unable to save subject."); }
    finally { setSaving(false); }
  };

  const changeStatus = async (subject) => {
    const nextStatus = subject.status === "active" ? "inactive" : "active";
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/subjects/${subject._id}`, { method: "PATCH", accessToken, body: { status: nextStatus } });
      if (!response?.success) throw new Error("Unable to update subject status.");
      setNotice(`${subject.name} is now ${nextStatus}.`);
      await loadSubjects();
    } catch (err) { setError(err.message || "Unable to update subject status."); }
  };

  return <section className="subjects-page" aria-labelledby="subjects-title">
    <div className="subjects-intro"><div><p className="subjects-eyebrow">ACADEMIC SETUP</p><h2 id="subjects-title">Subjects</h2><p>Maintain the school's subject catalogue for future class and teacher assignments.</p></div>
      {canManage && <button className="subject-button primary" type="button" onClick={() => { setEditing(null); setFormOpen((value) => !value); }}>{formOpen ? "Cancel" : "+ Add subject"}</button>}
    </div>
    {notice && <p className="subject-notice" role="status">{notice}</p>}
    {error && <p className="subject-error" role="alert">{error}</p>}
    {formOpen && <SubjectForm key={editing?._id || "new"} subject={editing} saving={saving} onCancel={() => { setFormOpen(false); setEditing(null); }} onSubmit={saveSubject} />}
    <div className="subjects-filters">
      <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or code" /></label>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option><option value="core">Core</option><option value="elective">Elective</option></select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    </div>
    <div className="subjects-table-wrap">
      <table className="subjects-table"><thead><tr><th>Subject</th><th>Code</th><th>Category</th><th>Status</th>{canManage && <th>Actions</th>}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={canManage ? 5 : 4}>Loading subjects…</td></tr> : subjects.length ? subjects.map((subject) => <tr key={subject._id}>
          <td><strong>{subject.name}</strong>{subject.description && <small>{subject.description}</small>}</td><td>{subject.code || "—"}</td><td><span className="subject-category">{subject.category}</span></td><td><span className={`subject-status status-${subject.status}`}>{subject.status}</span></td>
          {canManage && <td><div className="subject-row-actions"><button type="button" onClick={() => { setEditing(subject); setFormOpen(true); }}>Edit</button><button type="button" className={subject.status === "active" ? "danger" : ""} onClick={() => void changeStatus(subject)}>{subject.status === "active" ? "Deactivate" : "Activate"}</button></div></td>}
        </tr>) : <tr><td colSpan={canManage ? 5 : 4}>No subjects found. Add the first subject to start building the catalogue.</td></tr>}</tbody>
      </table>
    </div>
    {!canManage && <p className="subjects-readonly">You have read-only access to the subject catalogue.</p>}
  </section>;
}
