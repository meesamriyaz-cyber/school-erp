import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./ClassesManagement.css";

const canWriteRole = (role) => ["school_admin", "principal"].includes(String(role || "").toLowerCase());

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ClassForm({ schoolClass, academicYear, saving, error, onCancel, onSubmit }) {
  const [name, setName] = useState(schoolClass?.name || "");
  const [sortOrder, setSortOrder] = useState(String(schoolClass?.sortOrder ?? 0));
  const [validationError, setValidationError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const order = Number(sortOrder);
    if (!trimmedName) return setValidationError("Enter a class name.");
    if (!Number.isInteger(order) || order < 0 || order > 1000) return setValidationError("Sort order must be a whole number between 0 and 1000.");
    onSubmit({ name: trimmedName, sortOrder: order });
  };

  return <form className="class-form" onSubmit={submit}>
    <div>
      <h3>{schoolClass ? "Edit class" : "Create class"}</h3>
      <p>{schoolClass ? "Update the class details." : `Add a class to ${academicYear?.name || "the selected academic year"}.`}</p>
    </div>
    <label>Class name<input autoFocus name="name" maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setValidationError(""); }} placeholder="e.g. Class 1" required /></label>
    <label>Display order<input name="sortOrder" type="number" min="0" max="1000" step="1" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setValidationError(""); }} required /><span className="class-field-hint">Lower numbers appear first.</span></label>
    {(validationError || error) && <p className="class-error" role="alert">{validationError || error}</p>}
    <div className="class-form-actions">
      <button className="class-button secondary" type="button" onClick={onCancel}>Cancel</button>
      <button className="class-button primary" type="submit" disabled={saving}>{saving ? "Saving…" : schoolClass ? "Save changes" : "Create class"}</button>
    </div>
  </form>;
}

export default function ClassesManagement() {
  const { accessToken, user } = useAuth();
  const canManage = canWriteRole(user?.role);
  const [years, setYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingClass, setPendingClass] = useState(null);

  const loadYears = useCallback(async (signal) => {
    try {
      const response = await apiRequest("/academic-years", { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response while loading academic years.");
      setYears(response.data);
      setSelectedYearId((current) => current && response.data.some((year) => year._id === current)
        ? current
        : (response.data.find((year) => year.status === "active") || response.data[0])?._id || "");
      setError("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setYears([]);
      setError(err.message || "Unable to load academic years.");
    } finally {
      if (!signal?.aborted) setLoadingYears(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return loadYears(controller.signal);
      return undefined;
    });
    return () => controller.abort();
  }, [loadYears]);

  const loadClasses = useCallback(async (signal) => {
    if (!selectedYearId) {
      setClasses([]);
      setLoadingClasses(false);
      return;
    }
    setLoadingClasses(true);
    try {
      const response = await apiRequest(`/classes?academicYearId=${encodeURIComponent(selectedYearId)}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response while loading classes.");
      setClasses(response.data);
      setError("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setClasses([]);
      setError(err.message || "Unable to load classes.");
    } finally {
      if (!signal?.aborted) setLoadingClasses(false);
    }
  }, [accessToken, selectedYearId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return loadClasses(controller.signal);
      return undefined;
    });
    return () => controller.abort();
  }, [loadClasses]);

  const refreshClasses = async () => {
    const response = await apiRequest(`/classes?academicYearId=${encodeURIComponent(selectedYearId)}`, { accessToken });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response while refreshing classes.");
    setClasses(response.data);
  };

  const saveClass = async (fields) => {
    setSaving(true);
    setFormError("");
    setError("");
    setNotice("");
    try {
      const editing = Boolean(editingClass);
      const body = editing ? fields : { ...fields, academicYearId: selectedYearId };
      const response = await apiRequest(editing ? `/classes/${editingClass._id}` : "/classes", {
        method: editing ? "PATCH" : "POST", body, accessToken,
      });
      if (!response?.success || !response.data) throw new Error("Unexpected response from the server.");
      setFormOpen(false);
      setEditingClass(null);
      setNotice(editing ? "Class updated successfully." : "Class created successfully.");
      await refreshClasses();
    } catch (err) {
      setFormError(err.message || "Unable to save class.");
    } finally {
      setSaving(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingClass) return;
    const { schoolClass, status } = pendingClass;
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/classes/${schoolClass._id}`, {
        method: "PATCH", body: { status }, accessToken,
      });
      if (!response?.success) throw new Error("Unexpected response from the server.");
      setNotice(status === "active" ? `${schoolClass.name} is now active.` : `${schoolClass.name} has been deactivated.`);
      setPendingClass(null);
      await refreshClasses();
    } catch (err) {
      setError(err.message || "Unable to update class status.");
      setPendingClass(null);
    }
  };

  const selectedYear = years.find((year) => year._id === selectedYearId) || null;
  const activeCount = classes.filter((item) => item.status === "active").length;

  return <section className="classes-page" aria-labelledby="classes-title">
    <div className="classes-intro">
      <div><p className="classes-eyebrow">ACADEMIC SETUP</p><h2 id="classes-title">Classes</h2><p>Organize classes within each academic year. Sections will be managed in the next step.</p></div>
      {canManage && selectedYear && selectedYear.status !== "closed" && <button type="button" className="class-button primary" onClick={() => { setEditingClass(null); setFormError(""); setFormOpen(true); }}>+ Create class</button>}
    </div>

    <div className="classes-toolbar">
      <label className="classes-year-select">Academic year
        <select value={selectedYearId} onChange={(event) => { setSelectedYearId(event.target.value); setFormOpen(false); setEditingClass(null); setError(""); setNotice(""); }} disabled={loadingYears || years.length === 0}>
          {years.length === 0 && <option value="">No academic years available</option>}
          {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.status === "active" ? " · Active" : year.status === "closed" ? " · Closed" : ""}</option>)}
        </select>
      </label>
      {selectedYear && <div className="classes-year-summary"><strong>{selectedYear.name}</strong><span>{formatDate(selectedYear.startDate)} – {formatDate(selectedYear.endDate)}</span><span className={`class-status status-${selectedYear.status}`}>{selectedYear.status}</span></div>}
    </div>

    {notice && <p className="class-notice" role="status">{notice}</p>}
    {error && <div className="class-error-banner" role="alert"><span>{error}</span><button type="button" className="class-button secondary" onClick={() => { setError(""); if (years.length === 0) { setLoadingYears(true); void loadYears(); } else void loadClasses(); }}>Retry</button></div>}

    {selectedYear?.status === "closed" && <p className="classes-info">This academic year is closed. New classes cannot be created.</p>}
    {formOpen && <ClassForm key={editingClass?._id || "new"} schoolClass={editingClass} academicYear={selectedYear} saving={saving} error={formError} onCancel={() => { setFormOpen(false); setEditingClass(null); setFormError(""); }} onSubmit={saveClass} />}

    {pendingClass && <div className="class-confirm" role="alertdialog" aria-labelledby="class-confirm-title">
      <div><h3 id="class-confirm-title">{pendingClass.status === "active" ? "Activate class?" : "Deactivate class?"}</h3><p>{pendingClass.status === "active" ? `“${pendingClass.schoolClass.name}” will become available for use.` : `“${pendingClass.schoolClass.name}” will be deactivated. The API will prevent this while it has active sections.`}</p></div>
      <div className="class-form-actions"><button type="button" className="class-button secondary" onClick={() => setPendingClass(null)}>Cancel</button><button type="button" className="class-button primary" onClick={() => void confirmStatusChange()}>Confirm</button></div>
    </div>}

    <div className="classes-list">
      {loadingYears ? <p className="classes-empty" role="status">Loading academic years…</p>
        : years.length === 0 && !error ? <div className="classes-empty"><span aria-hidden="true">▤</span><h3>No academic years yet</h3><p>Create an academic year before setting up classes.</p></div>
          : !selectedYear ? <div className="classes-empty"><span aria-hidden="true">▤</span><h3>Select an academic year</h3><p>Choose a year to view its classes.</p></div>
            : loadingClasses ? <p className="classes-empty" role="status">Loading classes…</p>
              : classes.length === 0 && !error ? <div className="classes-empty"><span aria-hidden="true">▤</span><h3>No classes for {selectedYear.name}</h3><p>{canManage && selectedYear.status !== "closed" ? "Create the first class for this academic year." : "No classes have been created for this academic year."}</p></div>
                : <div className="classes-table-wrap"><table className="classes-table"><thead><tr><th scope="col">Class</th><th scope="col">Display order</th><th scope="col">Status</th>{canManage && <th scope="col">Actions</th>}</tr></thead><tbody>
                  {classes.map((schoolClass) => <tr key={schoolClass._id}>
                    <td><strong>{schoolClass.name}</strong><span className="class-subtext">{selectedYear.name}</span></td>
                    <td>{schoolClass.sortOrder ?? 0}</td>
                    <td><span className={`class-status status-${schoolClass.status || "inactive"}`}>{schoolClass.status || "inactive"}</span></td>
                    {canManage && <td><div className="class-row-actions">
                      <button type="button" className="class-text-button" onClick={() => { setEditingClass(schoolClass); setFormError(""); setFormOpen(true); }}>Edit</button>
                      {schoolClass.status === "active"
                        ? <button type="button" className="class-text-button danger" onClick={() => setPendingClass({ schoolClass, status: "inactive" })}>Deactivate</button>
                        : <button type="button" className="class-text-button" disabled={selectedYear.status === "closed"} onClick={() => setPendingClass({ schoolClass, status: "active" })}>Activate</button>}
                    </div></td>}
                  </tr>)}
                </tbody></table></div>}
    </div>

    <div className="classes-footer"><span>{classes.length} {classes.length === 1 ? "class" : "classes"} · {activeCount} active</span>{!canManage && <span>You have read-only access to classes.</span>}</div>
  </section>;
}
