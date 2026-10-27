import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./AcademicYearManagement.css";

const dateLabel = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
};

function YearForm({ year, saving, error, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => ({
    name: year?.name || "",
    startDate: year?.startDate ? new Date(year.startDate).toISOString().slice(0, 10) : "",
    endDate: year?.endDate ? new Date(year.endDate).toISOString().slice(0, 10) : "",
  }));
  const [validationError, setValidationError] = useState("");
  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError("");
  };
  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setValidationError("Enter an academic-year name.");
    if (!form.startDate || !form.endDate) return setValidationError("Choose both dates.");
    if (form.endDate <= form.startDate) return setValidationError("The end date must be after the start date.");
    onSubmit({ name: form.name.trim(), startDate: form.startDate, endDate: form.endDate });
  };
  return <form className="ay-form" onSubmit={submit}>
    <div><h3>{year ? "Edit academic year" : "Create academic year"}</h3><p>Set the name and dates for this school session.</p></div>
    <label>Academic year name<input name="name" value={form.name} maxLength={30} placeholder="e.g. 2027-2028" onChange={(e) => change("name", e.target.value)} required /></label>
    <div className="ay-date-fields">
      <label>Start date<input name="startDate" type="date" value={form.startDate} onChange={(e) => change("startDate", e.target.value)} required /></label>
      <label>End date<input name="endDate" type="date" value={form.endDate} onChange={(e) => change("endDate", e.target.value)} required /></label>
    </div>
    {(validationError || error) && <p role="alert" className="ay-error">{validationError || error}</p>}
    <div className="ay-form-actions">
      <button className="ay-button secondary" type="button" onClick={onCancel}>Cancel</button>
      <button className="ay-button primary" type="submit" disabled={saving}>{saving ? "Saving…" : year ? "Save changes" : "Create year"}</button>
    </div>
  </form>;
}

export default function AcademicYearManagement() {
  const { accessToken, user } = useAuth();
  const canManage = String(user?.role || "").toLowerCase() === "school_admin";
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const loadYears = useCallback(async (signal) => {
    try {
      const response = await apiRequest("/academic-years", { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response from the server.");
      setYears(response.data);
      setError("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setYears([]);
      setError(err.message || "Unable to load academic years.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void loadYears(controller.signal);
    return () => controller.abort();
  }, [loadYears]);

  const saveYear = async (fields) => {
    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      const editing = Boolean(editingYear);
      const response = await apiRequest(editing ? `/academic-years/${editingYear._id}` : "/academic-years", {
        method: editing ? "PATCH" : "POST", body: fields, accessToken,
      });
      if (!response?.success || !response.data) throw new Error("Unexpected response from the server.");
      setFormOpen(false);
      setEditingYear(null);
      setNotice(editing ? "Academic year updated successfully." : "Academic year created successfully.");
      await loadYears();
    } catch (err) {
      setFormError(err.message || "Unable to save academic year.");
    } finally {
      setSaving(false);
    }
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    const { year, status } = pendingAction;
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/academic-years/${year._id}`, {
        method: "PATCH", body: { status }, accessToken,
      });
      if (!response?.success) throw new Error("Unexpected response from the server.");
      setNotice(status === "active" ? `${year.name} is now active.` : `${year.name} has been closed.`);
      setPendingAction(null);
      await loadYears();
    } catch (err) {
      setError(err.message || "Unable to update academic-year status.");
      setPendingAction(null);
    }
  };

  const activeYear = years.find((year) => year.status === "active");
  return <section className="ay-page" aria-labelledby="ay-title">
    <div className="ay-intro">
      <div><p className="ay-eyebrow">ACADEMIC SETUP</p><h2 id="ay-title">Academic years</h2><p>Manage school sessions and their lifecycle.</p></div>
      {canManage && <button className="ay-button primary" onClick={() => { setEditingYear(null); setFormError(""); setFormOpen(true); }}>+ Create academic year</button>}
    </div>
    {activeYear && <div className="ay-active-callout"><span className="ay-active-dot" /><div><span>Current active academic year</span><strong>{activeYear.name}</strong></div><span>{dateLabel(activeYear.startDate)} – {dateLabel(activeYear.endDate)}</span></div>}
    {notice && <p className="ay-notice" role="status">{notice}</p>}
    {error && <div className="ay-error-banner" role="alert"><span>{error}</span><button className="ay-button secondary" onClick={() => { setLoading(true); void loadYears(); }}>Retry</button></div>}
    {formOpen && <YearForm key={editingYear?._id || "new"} year={editingYear} saving={saving} error={formError} onCancel={() => { setFormOpen(false); setEditingYear(null); setFormError(""); }} onSubmit={saveYear} />}
    {pendingAction && <div className="ay-confirm" role="alertdialog" aria-labelledby="ay-confirm-title">
      <div><h3 id="ay-confirm-title">{pendingAction.status === "active" ? "Activate academic year?" : "Close academic year?"}</h3><p>{pendingAction.status === "active" ? `“${pendingAction.year.name}” will become the active year for this school.` : `“${pendingAction.year.name}” will be closed and cannot be edited again.`}</p></div>
      <div className="ay-form-actions"><button className="ay-button secondary" onClick={() => setPendingAction(null)}>Cancel</button><button className="ay-button primary" onClick={() => void confirmAction()}>Confirm</button></div>
    </div>}
    <div className="ay-list">
      {loading ? <p className="ay-empty" role="status">Loading academic years…</p> : years.length === 0 && !error ? <div className="ay-empty"><span aria-hidden="true">▦</span><h3>No academic years yet</h3><p>{canManage ? "Create your first academic year to get started." : "Your school has not created any academic years yet."}</p></div> : years.length > 0 && <div className="ay-table-wrap"><table className="ay-table"><thead><tr><th scope="col">Academic year</th><th scope="col">Start date</th><th scope="col">End date</th><th scope="col">Status</th>{canManage && <th scope="col">Actions</th>}</tr></thead><tbody>
        {years.map((year) => <tr key={year._id}>
          <td data-label="Academic year"><strong>{year.name}</strong>{year.status === "active" && <span className="ay-current-label">Current</span>}</td>
          <td data-label="Start date">{dateLabel(year.startDate)}</td><td data-label="End date">{dateLabel(year.endDate)}</td>
          <td data-label="Status"><span className={`ay-status status-${year.status || "draft"}`}>{year.status || "draft"}</span></td>
          {canManage && <td data-label="Actions"><div className="ay-row-actions">
            {year.status !== "closed" && <button className="ay-text-button" onClick={() => { setEditingYear(year); setFormError(""); setFormOpen(true); }}>Edit</button>}
            {year.status === "draft" && (activeYear ? <span className="ay-action-hint">Close active year first</span> : <button className="ay-text-button" onClick={() => setPendingAction({ year, status: "active" })}>Activate</button>)}
            {year.status !== "closed" && <button className="ay-text-button danger" onClick={() => setPendingAction({ year, status: "closed" })}>Close</button>}
          </div></td>}
        </tr>)}
      </tbody></table></div>}
    </div>
    {!canManage && <p className="ay-readonly-note">You have read-only access to academic years.</p>}
  </section>;
}
