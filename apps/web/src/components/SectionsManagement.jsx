import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./SectionsManagement.css";

const canWriteRole = (role) => ["school_admin", "principal"].includes(String(role || "").toLowerCase());

function SectionForm({ section, saving, error, onCancel, onSubmit }) {
  const [name, setName] = useState(section?.name || "");
  const [capacity, setCapacity] = useState(section?.capacity == null ? "" : String(section.capacity));
  const [validationError, setValidationError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError("Enter a section name.");
      return;
    }
    let parsedCapacity = null;
    if (capacity.trim() !== "") {
      parsedCapacity = Number(capacity);
      if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 500) {
        setValidationError("Capacity must be a whole number between 1 and 500.");
        return;
      }
    }
    onSubmit({ name: trimmedName, capacity: parsedCapacity });
  };

  return <form className="section-form" onSubmit={submit}>
    <div>
      <h3>{section ? "Edit section" : "Create section"}</h3>
      <p>{section ? "Update the section name or optional capacity." : "Add a section to the selected class."}</p>
    </div>
    <label>Section name
      <input autoFocus name="name" maxLength={50} value={name} onChange={(event) => { setName(event.target.value); setValidationError(""); }} placeholder="e.g. A" required />
    </label>
    <label>Capacity (optional)
      <input name="capacity" type="number" min="1" max="500" step="1" value={capacity} onChange={(event) => { setCapacity(event.target.value); setValidationError(""); }} placeholder="Leave blank if not set" />
      <span className="section-field-hint">Enter a whole number from 1 to 500, or leave blank.</span>
    </label>
    {(validationError || error) && <p className="section-error" role="alert">{validationError || error}</p>}
    <div className="section-form-actions">
      <button className="section-button secondary" type="button" onClick={onCancel}>Cancel</button>
      <button className="section-button primary" type="submit" disabled={saving}>{saving ? "Saving…" : section ? "Save changes" : "Create section"}</button>
    </div>
  </form>;
}

export default function SectionsManagement() {
  const { accessToken, user } = useAuth();
  const canManage = canWriteRole(user?.role);
  const [years, setYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [sections, setSections] = useState([]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingSection, setPendingSection] = useState(null);

  const selectedYear = years.find((year) => year._id === selectedYearId) || null;
  const selectedClass = classes.find((item) => item._id === selectedClassId) || null;
  const canCreate = canManage && selectedClass?.status === "active" && selectedYear?.status !== "closed";
  const activeCount = useMemo(() => sections.filter((item) => item.status === "active").length, [sections]);

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
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadYears(controller.signal));
    return () => controller.abort();
  }, [loadYears]);

  const loadClasses = useCallback(async (signal) => {
    if (!selectedYearId) {
      setClasses([]);
      setSelectedClassId("");
      setLoadingClasses(false);
      return;
    }
    setLoadingClasses(true);
    try {
      const response = await apiRequest(`/classes?academicYearId=${encodeURIComponent(selectedYearId)}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response while loading classes.");
      setClasses(response.data);
      setSelectedClassId((current) => current && response.data.some((item) => item._id === current)
        ? current
        : (response.data.find((item) => item.status === "active") || response.data[0])?._id || "");
      setError("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setClasses([]);
      setSelectedClassId("");
      setError(err.message || "Unable to load classes.");
    } finally {
      if (!signal?.aborted) setLoadingClasses(false);
    }
  }, [accessToken, selectedYearId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadClasses(controller.signal));
    return () => controller.abort();
  }, [loadClasses]);

  const loadSections = useCallback(async (signal) => {
    if (!selectedClassId) {
      setSections([]);
      setLoadingSections(false);
      return;
    }
    setLoadingSections(true);
    try {
      const response = await apiRequest(`/sections?classId=${encodeURIComponent(selectedClassId)}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response while loading sections.");
      setSections(response.data);
      setError("");
    } catch (err) {
      if (err.name === "AbortError") return;
      setSections([]);
      setError(err.message || "Unable to load sections.");
    } finally {
      if (!signal?.aborted) setLoadingSections(false);
    }
  }, [accessToken, selectedClassId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadSections(controller.signal));
    return () => controller.abort();
  }, [loadSections]);

  const refreshSections = async () => {
    if (!selectedClassId) return;
    const response = await apiRequest(`/sections?classId=${encodeURIComponent(selectedClassId)}`, { accessToken });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unexpected response while refreshing sections.");
    setSections(response.data);
  };

  const saveSection = async (fields) => {
    setSaving(true);
    setFormError("");
    setError("");
    setNotice("");
    try {
      const editing = Boolean(editingSection);
      const response = await apiRequest(editing ? `/sections/${editingSection._id}` : "/sections", {
        method: editing ? "PATCH" : "POST",
        body: editing ? fields : { ...fields, classId: selectedClassId },
        accessToken,
      });
      if (!response?.success || !response.data) throw new Error("Unexpected response from the server.");
      setFormOpen(false);
      setEditingSection(null);
      setNotice(editing ? "Section updated successfully." : "Section created successfully.");
      await refreshSections();
    } catch (err) {
      setFormError(err.message || "Unable to save section.");
    } finally {
      setSaving(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingSection) return;
    const { section, status } = pendingSection;
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/sections/${section._id}`, { method: "PATCH", body: { status }, accessToken });
      if (!response?.success) throw new Error("Unexpected response from the server.");
      setNotice(status === "active" ? `${section.name} is now active.` : `${section.name} has been deactivated.`);
      setPendingSection(null);
      await refreshSections();
    } catch (err) {
      setError(err.message || "Unable to update section status.");
      setPendingSection(null);
    }
  };

  const changeYear = (yearId) => {
    setSelectedYearId(yearId);
    setSelectedClassId("");
    setSections([]);
    setFormOpen(false);
    setEditingSection(null);
    setError("");
    setNotice("");
  };

  const changeClass = (classId) => {
    setSelectedClassId(classId);
    setSections([]);
    setFormOpen(false);
    setEditingSection(null);
    setError("");
    setNotice("");
  };

  return <section className="sections-page" aria-labelledby="sections-title">
    <div className="sections-intro">
      <div><p className="sections-eyebrow">ACADEMIC SETUP</p><h2 id="sections-title">Sections</h2><p>Manage sections and optional capacity within each class.</p></div>
      {canCreate && <button type="button" className="section-button primary" onClick={() => { setEditingSection(null); setFormError(""); setFormOpen(true); }}>+ Create section</button>}
    </div>

    <div className="sections-toolbar">
      <label>Academic year
        <select value={selectedYearId} onChange={(event) => changeYear(event.target.value)} disabled={loadingYears || years.length === 0}>
          {years.length === 0 && <option value="">No academic years available</option>}
          {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.status === "active" ? " · Active" : year.status === "closed" ? " · Closed" : ""}</option>)}
        </select>
      </label>
      <label>Class
        <select value={selectedClassId} onChange={(event) => changeClass(event.target.value)} disabled={loadingClasses || classes.length === 0}>
          {classes.length === 0 && <option value="">No classes available</option>}
          {classes.map((item) => <option key={item._id} value={item._id}>{item.name}{item.status === "inactive" ? " · Inactive" : ""}</option>)}
        </select>
      </label>
      {selectedClass && <div className="sections-selection-summary"><strong>{selectedClass.name}</strong><span>{selectedYear?.name}</span><span className={`section-status status-${selectedClass.status || "inactive"}`}>{selectedClass.status}</span></div>}
    </div>

    {notice && <p className="section-notice" role="status">{notice}</p>}
    {error && <div className="section-error-banner" role="alert"><span>{error}</span><button type="button" className="section-button secondary" onClick={() => { setError(""); if (!years.length) { setLoadingYears(true); void loadYears(); } else if (!classes.length) { setLoadingClasses(true); void loadClasses(); } else { setLoadingSections(true); void loadSections(); } }}>Retry</button></div>}
    {selectedYear?.status === "closed" && <p className="sections-info">This academic year is closed. New sections cannot be created or reactivated.</p>}
    {selectedClass?.status === "inactive" && <p className="sections-info">This class is inactive. New sections cannot be created or activated until the class is active.</p>}
    {formOpen && <SectionForm key={editingSection?._id || "new"} section={editingSection} saving={saving} error={formError} onCancel={() => { setFormOpen(false); setEditingSection(null); setFormError(""); }} onSubmit={saveSection} />}

    {pendingSection && <div className="section-confirm" role="alertdialog" aria-labelledby="section-confirm-title">
      <div><h3 id="section-confirm-title">{pendingSection.status === "active" ? "Activate section?" : "Deactivate section?"}</h3><p>{pendingSection.status === "active" ? `“${pendingSection.section.name}” will become available for use.` : `“${pendingSection.section.name}” will be deactivated and won't be offered for new class activity.`}</p></div>
      <div className="section-form-actions"><button type="button" className="section-button secondary" onClick={() => setPendingSection(null)}>Cancel</button><button type="button" className="section-button primary" onClick={() => void confirmStatusChange()}>Confirm</button></div>
    </div>}

    <div className="sections-list">
      {loadingYears ? <p className="sections-empty" role="status">Loading academic years…</p>
        : years.length === 0 && !error ? <div className="sections-empty"><h3>No academic years yet</h3><p>Create an academic year before setting up sections.</p></div>
          : !selectedYear ? <div className="sections-empty"><h3>Select an academic year</h3><p>Choose a year to view its classes.</p></div>
            : loadingClasses ? <p className="sections-empty" role="status">Loading classes…</p>
              : classes.length === 0 && !error ? <div className="sections-empty"><h3>No classes for {selectedYear.name}</h3><p>Create a class before setting up sections.</p></div>
                : !selectedClass ? <div className="sections-empty"><h3>Select a class</h3><p>Choose a class to view its sections.</p></div>
                  : loadingSections ? <p className="sections-empty" role="status">Loading sections…</p>
                    : sections.length === 0 && !error ? <div className="sections-empty"><h3>No sections for {selectedClass.name}</h3><p>{canCreate ? "Create the first section for this class." : "No sections have been created for this class."}</p></div>
                      : <div className="sections-table-wrap"><table className="sections-table"><thead><tr><th scope="col">Section</th><th scope="col">Capacity</th><th scope="col">Status</th>{canManage && <th scope="col">Actions</th>}</tr></thead><tbody>
                        {sections.map((section) => {
                          const canActivate = canManage && section.status !== "active" && selectedClass.status === "active" && selectedYear.status !== "closed";
                          return <tr key={section._id}>
                            <td><strong>{section.name}</strong><span className="section-subtext">{selectedClass.name}</span></td>
                            <td>{section.capacity == null ? "Not set" : section.capacity}</td>
                            <td><span className={`section-status status-${section.status || "inactive"}`}>{section.status || "inactive"}</span></td>
                            {canManage && <td><div className="section-row-actions">
                              <button type="button" className="section-text-button" onClick={() => { setEditingSection(section); setFormError(""); setFormOpen(true); }}>Edit</button>
                              {section.status === "active"
                                ? <button type="button" className="section-text-button danger" onClick={() => setPendingSection({ section, status: "inactive" })}>Deactivate</button>
                                : <button type="button" className="section-text-button" disabled={!canActivate} title={!canActivate ? "Activate the parent class and use a non-closed academic year first." : undefined} onClick={() => setPendingSection({ section, status: "active" })}>Activate</button>}
                            </div></td>}
                          </tr>;
                        })}
                      </tbody></table></div>}
    </div>
    <div className="sections-footer"><span>{sections.length} section{sections.length === 1 ? "" : "s"}</span><span>{activeCount} active</span></div>
    {!canManage && <p className="sections-readonly-note">You have read-only access to sections.</p>}
  </section>;
}
