import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./StaffManagement.css";

const EMPTY = { userId: "", employeeCode: "", firstName: "", lastName: "", email: "", phone: "", employeeType: "teaching", designation: "", department: "", employmentType: "full_time", joiningDate: new Date().toISOString().slice(0, 10), qualification: "", experienceYears: "0" };
const STATUS_LABELS = { active: "Active", on_leave: "On leave", suspended: "Suspended", separated: "Separated" };
const TYPE_LABELS = { teaching: "Teaching", non_teaching: "Non-teaching" };
const EMPLOYMENT_LABELS = { full_time: "Full-time", part_time: "Part-time", contractual: "Contractual", temporary: "Temporary" };
const fullName = (record) => [record.firstName, record.lastName].filter(Boolean).join(" ");

export default function StaffManagement() {
  const { accessToken } = useAuth();
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter) params.set("employeeType", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await apiRequest(`/staff?${params.toString()}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected staff response from server.");
      if (!signal.aborted) setRecords(response.data);
    } catch (err) { if (err.name !== "AbortError" && !signal.aborted) setError(err.message || "Unable to load staff."); }
    finally { if (!signal.aborted) setLoading(false); }
  }, [accessToken, search, typeFilter, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const roles = form.employeeType === "teaching" ? ["teacher"] : ["principal", "accountant", "librarian", "transport_manager"];
    Promise.all(roles.map((role) => apiRequest(`/school/users?role=${role}&status=active&page=1&limit=100`, { accessToken, signal: controller.signal })))
      .then((responses) => { if (!controller.signal.aborted) setUsers(responses.flatMap((item) => Array.isArray(item?.data) ? item.data : [])); })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load account links."); });
    return () => controller.abort();
  }, [accessToken, form.employeeType]);

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setShowForm(true); setNotice(""); setError(""); };
  const startEdit = (record) => {
    setEditingId(record.id);
    setForm({ ...EMPTY, userId: record.userId || "", employeeCode: record.employeeCode || "", firstName: record.firstName || "", lastName: record.lastName || "", email: record.email || "", phone: record.phone || "", employeeType: record.employeeType, designation: record.designation || "", department: record.department || "", employmentType: record.employmentType, joiningDate: record.joiningDate ? new Date(record.joiningDate).toISOString().slice(0, 10) : "", qualification: record.qualification || "", experienceYears: String(record.experienceYears ?? 0) });
    setShowForm(true); setNotice(""); setError("");
  };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...form, experienceYears: Number(form.experienceYears), userId: form.userId || null, employeeCode: form.employeeCode || null, lastName: form.lastName || "", email: form.email || null, phone: form.phone || null, department: form.department || null, qualification: form.qualification || null };
      if (editingId) { delete payload.userId; await apiRequest(`/staff/${editingId}`, { method: "PATCH", accessToken, body: payload }); }
      else await apiRequest("/staff", { method: "POST", accessToken, body: payload });
      setShowForm(false); setEditingId(null); setNotice(editingId ? "Staff profile updated." : "Staff member added.");
      const controller = new AbortController(); await load(controller.signal);
    } catch (err) { setError(err.message || "Unable to save staff record."); }
    finally { setSaving(false); }
  };
  const changeStatus = async (record, status) => {
    const message = status === "separated"
      ? `Separate ${fullName(record)}? This is permanent. Teaching assignments and timetable periods must be deactivated first.`
      : `Change ${fullName(record)} to ${STATUS_LABELS[status]}?`;
    if (!window.confirm(message)) return;
    setError(""); setNotice("");
    try {
      await apiRequest(`/staff/${record.id}/status`, { method: "PATCH", accessToken, body: { status } });
      setNotice(`${fullName(record)} status updated.`);
      const controller = new AbortController(); await load(controller.signal);
    } catch (err) { setError(err.message || "Unable to update staff status."); }
  };
  const showHistory = async (record) => {
    setError("");
    try { const response = await apiRequest(`/staff/${record.id}/history`, { accessToken }); setHistory({ name: fullName(record), entries: response.data || [] }); }
    catch (err) { setError(err.message || "Unable to load staff history."); }
  };

  return <section className="staff-management" aria-labelledby="staff-management-title">
    <header className="staff-management-heading"><div><p className="staff-eyebrow">PEOPLE & ADMINISTRATION</p><h2 id="staff-management-title">Teachers & Staff</h2><p>Maintain employment records for all teaching and non-teaching employees.</p></div><button type="button" onClick={startCreate} className="staff-primary">+ Add staff member</button></header>
    {notice && <p className="staff-notice" role="status">{notice}</p>}
    {error && <p className="staff-error" role="alert">{error}</p>}
    {showForm && <form className="staff-form" onSubmit={submit}>
      <div className="staff-form-title"><h3>{editingId ? "Edit staff profile" : "New staff record"}</h3><button type="button" className="staff-secondary" onClick={() => setShowForm(false)}>Cancel</button></div>
      <div className="staff-form-grid">
        <label>Staff category *<select value={form.employeeType} disabled={Boolean(editingId)} onChange={(e) => setForm((v) => ({ ...v, employeeType: e.target.value, userId: "" }))}><option value="teaching">Teaching</option><option value="non_teaching">Non-teaching</option></select></label>
        <label>Linked login account {form.employeeType === "teaching" ? "*" : "(optional)"}<select value={form.userId} disabled={Boolean(editingId)} required={form.employeeType === "teaching"} onChange={(e) => setForm((v) => ({ ...v, userId: e.target.value }))}><option value="">Select account</option>{users.map((user) => <option key={user.id} value={user.id}>{fullName(user)} — {user.email}</option>)}</select></label>
        <label>Employee code<input value={form.employeeCode || ""} maxLength={30} onChange={(e) => setForm((v) => ({ ...v, employeeCode: e.target.value }))} /></label>
        <label>First name *<input required maxLength={80} value={form.firstName} onChange={(e) => setForm((v) => ({ ...v, firstName: e.target.value }))} /></label>
        <label>Last name<input maxLength={80} value={form.lastName || ""} onChange={(e) => setForm((v) => ({ ...v, lastName: e.target.value }))} /></label>
        <label>Email<input type="email" maxLength={254} value={form.email || ""} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} /></label>
        <label>Phone<input type="tel" maxLength={20} value={form.phone || ""} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} /></label>
        <label>Designation *<input required maxLength={100} value={form.designation} onChange={(e) => setForm((v) => ({ ...v, designation: e.target.value }))} placeholder="e.g. Mathematics Teacher, Clerk, Driver" /></label>
        <label>Department<input maxLength={100} value={form.department || ""} onChange={(e) => setForm((v) => ({ ...v, department: e.target.value }))} placeholder="e.g. Academics, Administration" /></label>
        <label>Employment type *<select value={form.employmentType} onChange={(e) => setForm((v) => ({ ...v, employmentType: e.target.value }))}>{Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Joining date *<input type="date" required value={form.joiningDate} onChange={(e) => setForm((v) => ({ ...v, joiningDate: e.target.value }))} /></label>
        <label>Qualification<input maxLength={500} value={form.qualification || ""} onChange={(e) => setForm((v) => ({ ...v, qualification: e.target.value }))} /></label>
        <label>Experience (years)<input type="number" min="0" max="60" step="0.5" value={form.experienceYears} onChange={(e) => setForm((v) => ({ ...v, experienceYears: e.target.value }))} /></label>
      </div>
      {form.employeeType === "teaching" && <p className="staff-help">Teaching employees must be linked to an active teacher login. Their academic assignments and timetable continue to use the existing teacher account.</p>}
      <div className="staff-form-actions"><button type="submit" className="staff-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create staff record"}</button></div>
    </form>}
    <div className="staff-filters"><input aria-label="Search staff" placeholder="Search name, employee code or designation" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Filter staff category" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All staff</option><option value="teaching">Teaching</option><option value="non_teaching">Non-teaching</option></select><select aria-label="Filter employment status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {history && <aside className="staff-history"><div><strong>Employment history — {history.name}</strong><button type="button" onClick={() => setHistory(null)}>Close</button></div>{history.entries.length ? history.entries.map((entry, index) => <p key={index}>{entry.action.replaceAll("_", " ")} · {new Date(entry.changedAt).toLocaleString("en-IN")} {entry.previousStatus ? `· ${STATUS_LABELS[entry.previousStatus] || entry.previousStatus} → ${STATUS_LABELS[entry.newStatus] || entry.newStatus}` : ""}</p>) : <p>No history entries.</p>}</aside>}
    <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Employee</th><th>Category</th><th>Designation / Department</th><th>Employment</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="6">Loading staff…</td></tr> : records.length ? records.map((record) => <tr key={record.id}><td><strong>{fullName(record)}</strong><small>{record.employeeCode || "No employee code"} · {record.email || record.linkedUser?.email || "No email"}</small></td><td>{TYPE_LABELS[record.employeeType]}</td><td>{record.designation}<small>{record.department || "No department"}</small></td><td>{EMPLOYMENT_LABELS[record.employmentType]}</td><td><span className={`staff-status staff-status-${record.employmentStatus}`}>{STATUS_LABELS[record.employmentStatus]}</span></td><td className="staff-actions"><button type="button" onClick={() => void showHistory(record)}>History</button>{record.employmentStatus !== "separated" && <button type="button" onClick={() => startEdit(record)}>Edit</button>}{record.employmentStatus === "active" && <><button type="button" onClick={() => void changeStatus(record, "on_leave")}>On leave</button><button type="button" onClick={() => void changeStatus(record, "suspended")}>Suspend</button></>}{record.employmentStatus === "on_leave" && <button type="button" onClick={() => void changeStatus(record, "active")}>Return</button>}{record.employmentStatus === "suspended" && <button type="button" onClick={() => void changeStatus(record, "active")}>Reactivate</button>}{record.employmentStatus !== "separated" && <button type="button" onClick={() => void changeStatus(record, "separated")}>Separate</button>}</td></tr>) : <tr><td colSpan="6">No staff records found.</td></tr>}
    </tbody></table></div>
    <p className="staff-footnote">Employee records are retained after separation. Login access is suspended for suspended or separated employees; reactivating an employment record does not automatically restore account access.</p>
  </section>;
}
