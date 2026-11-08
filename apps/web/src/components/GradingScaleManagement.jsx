import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./GradingScaleManagement.css";

const emptyForm = () => ({ name: "", description: "", bands: [] });
const toForm = (scale) => ({
  name: scale.name || "",
  description: scale.description || "",
  bands: (scale.bands || []).map((band) => ({
    grade: band.grade || "",
    minPercentage: String(band.minPercentage ?? ""),
    maxPercentage: String(band.maxPercentage ?? ""),
    description: band.description || "",
  })),
});

const validateBands = (bands) => {
  if (!bands.length) return "Add at least one percentage band.";
  const labels = bands.map((band) => band.grade.trim().toLocaleLowerCase());
  if (labels.some((label) => !label)) return "Every band needs a grade label.";
  if (new Set(labels).size !== labels.length) return "Grade labels must be unique, ignoring letter case.";

  const normalized = bands.map((band) => ({
    min: Number(band.minPercentage),
    max: Number(band.maxPercentage),
  }));
  if (normalized.some(({ min, max }) =>
    !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min >= max
  )) return "Each band must have a minimum below its maximum, between 0 and 100.";

  normalized.sort((a, b) => a.min - b.min);
  if (normalized[0].min !== 0 || normalized[normalized.length - 1].max !== 100) {
    return "Bands must cover the complete percentage range from 0 to 100.";
  }
  if (normalized.some((band, index) => index > 0 && band.min !== normalized[index - 1].max)) {
    return "Bands must be contiguous, without gaps or overlaps.";
  }
  return "";
};

export default function GradingScaleManagement() {
  const { accessToken, user } = useAuth();
  const canManage = ["school_admin", "principal"].includes(user?.role);
  const [scales, setScales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);

  const loadScales = useCallback(async (signal) => {
    const response = await apiRequest("/grading-scales", { accessToken, signal });
    if (!response?.success || !Array.isArray(response.data)) {
      throw new Error("Unable to load grading scales.");
    }
    setScales(response.data);
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    loadScales(controller.signal)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "Unable to load grading scales.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadScales]);

  const startNew = () => {
    setEditingId("");
    setForm(emptyForm());
    setError("");
    setNotice("");
  };

  const startEdit = (scale) => {
    setEditingId(scale._id);
    setForm(toForm(scale));
    setError("");
    setNotice("");
  };

  const updateBand = (index, key, value) => {
    setForm((current) => ({
      ...current,
      bands: current.bands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [key]: value } : band
      ),
    }));
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!form.name.trim()) {
      setError("Enter a grading scale name.");
      return;
    }
    const bandError = validateBands(form.bands);
    if (bandError) {
      setError(bandError);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      bands: form.bands.map((band) => ({
        grade: band.grade.trim(),
        minPercentage: Number(band.minPercentage),
        maxPercentage: Number(band.maxPercentage),
        ...(band.description.trim() ? { description: band.description.trim() } : {}),
      })),
    };

    setSaving(true);
    try {
      const response = await apiRequest(
        editingId ? `/grading-scales/${editingId}` : "/grading-scales",
        { method: editingId ? "PATCH" : "POST", accessToken, body: payload },
      );
      if (!response?.success) throw new Error("The server did not save the grading scale.");
      await loadScales();
      setEditingId("");
      setForm(emptyForm());
      setNotice(editingId ? "Draft grading scale updated." : "Grading scale saved as a draft.");
    } catch (err) {
      setError(err.message || "Unable to save grading scale.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (scale, status) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/grading-scales/${scale._id}/status`, {
        method: "PATCH",
        accessToken,
        body: { status },
      });
      await loadScales();
      if (editingId === scale._id) {
        setEditingId("");
        setForm(emptyForm());
      }
      setNotice(status === "active"
        ? `${scale.name} is now the active grading scale.`
        : `${scale.name} has been archived.`);
    } catch (err) {
      setError(err.message || `Unable to ${status} grading scale.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grading-page" aria-labelledby="grading-page-title">
      <header className="grading-intro">
        <div>
          <p className="grading-eyebrow">ACADEMIC CONFIGURATION</p>
          <h2 id="grading-page-title">Grading scales</h2>
          <p>Define the grade labels and percentage bands used by your school.</p>
        </div>
        {canManage && <button type="button" className="grading-primary" onClick={startNew}>Create grading scale</button>}
      </header>

      {notice && <p className="grading-notice" role="status">{notice}</p>}
      {error && <p className="grading-error" role="alert">{error}</p>}

      <div className="grading-layout">
        <section className="grading-card" aria-labelledby="grading-scales-heading">
          <div className="grading-card-heading">
            <div>
              <h3 id="grading-scales-heading">School grading scales</h3>
              <p>{scales.length} configured · one scale can be active at a time</p>
            </div>
          </div>
          {loading ? <p className="grading-empty">Loading grading scales…</p> : scales.length ? (
            <div className="grading-scale-list">
              {scales.map((scale) => (
                <article className="grading-scale-item" key={scale._id}>
                  <div className="grading-scale-heading">
                    <div>
                      <h4>{scale.name}</h4>
                      {scale.description && <p>{scale.description}</p>}
                    </div>
                    <span className={`grading-status grading-status-${scale.status}`}>{scale.status}</span>
                  </div>
                  <div className="grading-band-preview">
                    {scale.bands.map((band, index) => (
                      <div className="grading-band-preview-row" key={`${band.grade}-${index}`}>
                        <strong>{band.grade}</strong>
                        <span>{band.minPercentage}% – {band.maxPercentage}%{band.maxPercentage === 100 ? " (inclusive)" : ""}</span>
                        {band.description && <small>{band.description}</small>}
                      </div>
                    ))}
                  </div>
                  {canManage && <div className="grading-item-actions">
                    {scale.status === "draft" && <button type="button" className="grading-secondary" disabled={saving} onClick={() => startEdit(scale)}>Edit draft</button>}
                    {scale.status === "draft" && <button type="button" className="grading-primary" disabled={saving} onClick={() => void changeStatus(scale, "active")}>Activate scale</button>}
                    {scale.status === "active" && <button type="button" className="grading-danger" disabled={saving} onClick={() => void changeStatus(scale, "archived")}>Archive active scale</button>}
                  </div>}
                </article>
              ))}
            </div>
          ) : <p className="grading-empty">No grading scales configured. Create a scale using the grade labels and percentage ranges approved by your school.</p>}
        </section>

        {canManage && <section className="grading-card grading-editor" aria-labelledby="grading-editor-heading">
          <div className="grading-card-heading">
            <div>
              <h3 id="grading-editor-heading">{editingId ? "Edit draft scale" : "Create a grading scale"}</h3>
              <p>Only draft scales can be edited. Active scales are locked.</p>
            </div>
          </div>
          <form onSubmit={saveDraft}>
            <label className="grading-field">Scale name
              <input required maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Secondary School Assessment" />
            </label>
            <label className="grading-field">Description
              <textarea maxLength={300} rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional notes about this grading policy" />
            </label>
            <div className="grading-bands-heading">
              <div><h4>Percentage bands</h4><p>Cover 0% through 100% with no gaps or overlaps.</p></div>
              <button type="button" className="grading-secondary" onClick={() => setForm((current) => ({
                ...current,
                bands: [...current.bands, { grade: "", minPercentage: "", maxPercentage: "", description: "" }],
              }))}>Add band</button>
            </div>
            {form.bands.length ? <div className="grading-band-editor">
              {form.bands.map((band, index) => (
                <fieldset className="grading-band-fieldset" key={index}>
                  <legend>Band {index + 1}</legend>
                  <label>Grade label
                    <input required maxLength={20} value={band.grade} onChange={(event) => updateBand(index, "grade", event.target.value)} placeholder="e.g. A" />
                  </label>
                  <label>Minimum %
                    <input required type="number" min="0" max="100" step="any" value={band.minPercentage} onChange={(event) => updateBand(index, "minPercentage", event.target.value)} />
                  </label>
                  <label>Maximum %
                    <input required type="number" min="0" max="100" step="any" value={band.maxPercentage} onChange={(event) => updateBand(index, "maxPercentage", event.target.value)} />
                  </label>
                  <label className="grading-band-description">Description (optional)
                    <input maxLength={120} value={band.description} onChange={(event) => updateBand(index, "description", event.target.value)} placeholder="e.g. Excellent" />
                  </label>
                  <button type="button" className="grading-remove-band" disabled={saving} onClick={() => setForm((current) => ({
                    ...current,
                    bands: current.bands.filter((_, bandIndex) => bandIndex !== index),
                  }))}>Remove band</button>
                </fieldset>
              ))}
            </div> : <p className="grading-empty">No bands added yet. Add a band and enter its grade label and percentage range.</p>}
            <div className="grading-form-actions">
              <button type="submit" className="grading-primary" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
              {editingId && <button type="button" className="grading-secondary" disabled={saving} onClick={startNew}>Cancel edit</button>}
            </div>
          </form>
        </section>}
      </div>
    </section>
  );
}
