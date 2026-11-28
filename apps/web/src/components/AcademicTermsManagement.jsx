import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";

const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
const dateLabel = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AcademicTermsManagement() {
  const { accessToken, user } = useAuth();
  const canManage = user?.role === "school_admin";
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState("");
  const [terms, setTerms] = useState([]);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadYears = useCallback(async () => {
    const response = await apiRequest("/academic-years", { accessToken });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load academic years");
    setYears(response.data);
    setYearId((current) => current || response.data.find((item) => item.status === "active")?._id || response.data[0]?._id || "");
  }, [accessToken]);

  const loadTerms = useCallback(async () => {
    if (!yearId) { setTerms([]); return; }
    const response = await apiRequest(`/academic-terms?academicYearId=${encodeURIComponent(yearId)}`, { accessToken });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load academic terms");
    setTerms(response.data);
  }, [accessToken, yearId]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      try { await loadYears(); } catch (err) { if (alive) setError(err.message); }
      finally { if (alive) setLoading(false); }
    });
    return () => { alive = false; };
  }, [loadYears]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      try { await loadTerms(); } catch (err) { if (alive) setError(err.message); }
    });
    return () => { alive = false; };
  }, [loadTerms]);

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(editing ? `/academic-terms/${editing._id}` : "/academic-terms", {
        method: editing ? "PATCH" : "POST", accessToken,
        body: editing ? form : { academicYearId: yearId, ...form },
      });
      if (!response?.success) throw new Error(response?.message || "Unable to save term");
      setNotice(editing ? "Academic term updated." : "Academic term created.");
      setShowForm(false); setEditing(null); setForm({ name: "", startDate: "", endDate: "" });
      await loadTerms();
    } catch (err) { setError(err.message || "Unable to save term"); }
    finally { setSaving(false); }
  };

  const changeStatus = async (term, status) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/academic-terms/${term._id}`, { method: "PATCH", accessToken, body: { status } });
      if (!response?.success) throw new Error(response?.message || "Unable to update term");
      setNotice(`${term.name} is now ${status}.`);
      await loadTerms();
    } catch (err) { setError(err.message || "Unable to update term"); }
  };

  const selectedYear = years.find((year) => year._id === yearId);
  return <section className="content-card phase7-page">
    <div className="phase7-heading"><div><p className="eyebrow">ACADEMIC STRUCTURE</p><h2>Academic terms</h2><p>Configure flexible terms, semesters or quarters within each academic year.</p></div>
      {canManage && selectedYear?.status !== "closed" && <button type="button" onClick={() => { setEditing(null); setForm({ name: "", startDate: "", endDate: "" }); setShowForm((v) => !v); }}>{showForm ? "Cancel" : "+ Add term"}</button>}
    </div>
    <label>Academic year <select value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year._id} value={year._id}>{year.name} · {year.status}</option>)}</select></label>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {showForm && <form className="phase7-form" onSubmit={save}>
      <label>Term name<input required maxLength={80} value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="e.g. Semester 1" /></label>
      <label>Start date<input required type="date" min={dateValue(selectedYear?.startDate)} max={dateValue(selectedYear?.endDate)} value={form.startDate} onChange={(e) => setForm((v) => ({ ...v, startDate: e.target.value }))} /></label>
      <label>End date<input required type="date" min={form.startDate || dateValue(selectedYear?.startDate)} max={dateValue(selectedYear?.endDate)} value={form.endDate} onChange={(e) => setForm((v) => ({ ...v, endDate: e.target.value }))} /></label>
      <button type="submit" disabled={saving || !yearId}>{saving ? "Saving…" : "Save term"}</button>
    </form>}
    {loading ? <p>Loading academic years…</p> : !selectedYear ? <p>Create an academic year before adding terms.</p> : <div className="phase7-table-wrap"><table><thead><tr><th>Term</th><th>Dates</th><th>Status</th>{canManage && <th>Actions</th>}</tr></thead><tbody>
      {terms.length ? terms.map((term) => <tr key={term._id}><td>{term.name}</td><td>{dateLabel(term.startDate)} – {dateLabel(term.endDate)}</td><td>{term.status}</td>{canManage && <td>
        {term.status === "draft" && <><button type="button" onClick={() => { setEditing(term); setForm({ name: term.name, startDate: dateValue(term.startDate), endDate: dateValue(term.endDate) }); setShowForm(true); }}>Edit</button><button type="button" onClick={() => void changeStatus(term, "active")}>Activate</button><button type="button" onClick={() => void changeStatus(term, "cancelled")}>Cancel</button></>}
        {term.status === "active" && <><button type="button" onClick={() => void changeStatus(term, "completed")}>Complete</button><button type="button" onClick={() => void changeStatus(term, "cancelled")}>Cancel</button></>}
        {["completed", "cancelled"].includes(term.status) && <span>Locked</span>}
      </td>}</tr>) : <tr><td colSpan={canManage ? 4 : 3}>No terms configured for this year.</td></tr>}
    </tbody></table></div>}
  </section>;
}
