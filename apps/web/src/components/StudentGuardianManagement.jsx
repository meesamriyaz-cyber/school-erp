import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";

const RELATIONSHIPS = [
  ["mother", "Mother"],
  ["father", "Father"],
  ["uncle", "Uncle"],
  ["aunt", "Aunt"],
  ["legal_guardian", "Legal guardian"],
  ["grandparent", "Grandparent"],
  ["step_parent", "Step-parent"],
  ["sibling", "Sibling"],
  ["other", "Other"],
];

const EMPTY_GUARDIAN = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
};

const EMPTY_FLAGS = {
  isPrimary: false,
  isEmergencyContact: false,
  canPickup: false,
  receivesCommunication: true,
};

function relationshipLabel(value) {
  return RELATIONSHIPS.find(([key]) => key === value)?.[1] || value || "Not specified";
}

function guardianName(guardian) {
  if (!guardian || typeof guardian !== "object") return "Guardian details unavailable";
  return [guardian.firstName, guardian.lastName].filter(Boolean).join(" ") || "Unnamed guardian";
}

export default function StudentGuardianManagement({
  studentId,
  accessToken,
  canManage = false,
}) {
  const [links, setLinks] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedGuardianId, setSelectedGuardianId] = useState("__new__");
  const [guardianForm, setGuardianForm] = useState(EMPTY_GUARDIAN);
  const [relationship, setRelationship] = useState("other");
  const [flags, setFlags] = useState(EMPTY_FLAGS);
  const [saving, setSaving] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [editForm, setEditForm] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGuardians() {
      setLoading(true);
      setError("");
      try {
        const [linkResponse, guardianResponse] = await Promise.all([
          apiRequest(`/students/${encodeURIComponent(studentId)}/guardians`, {
            accessToken,
            signal: controller.signal,
          }),
          apiRequest("/guardians", {
            accessToken,
            signal: controller.signal,
          }),
        ]);

        if (!linkResponse?.success || !Array.isArray(linkResponse.data)) {
          throw new Error("Unable to load this student's guardians.");
        }
        if (!guardianResponse?.success || !Array.isArray(guardianResponse.data)) {
          throw new Error("Unable to load the guardian directory.");
        }

        if (!controller.signal.aborted) {
          setLinks(linkResponse.data);
          setGuardians(guardianResponse.data.filter((guardian) => guardian.status === "active"));
        }
      } catch (loadError) {
        if (loadError.name !== "AbortError" && !controller.signal.aborted) {
          setError(loadError.message || "Unable to load guardian information.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadGuardians();
    return () => controller.abort();
  }, [studentId, accessToken, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);
  const linkedGuardianIds = new Set(links.map((link) => String(link.guardianId?._id || link.guardianId)));
  const availableGuardians = guardians.filter((guardian) => !linkedGuardianIds.has(String(guardian._id)));

  const handleAddGuardian = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      let guardianId = selectedGuardianId;
      if (selectedGuardianId === "__new__") {
        if (!guardianForm.firstName.trim()) {
          throw new Error("Guardian first name is required.");
        }
        const guardianResponse = await apiRequest("/guardians", {
          method: "POST",
          accessToken,
          body: {
            firstName: guardianForm.firstName.trim(),
            lastName: guardianForm.lastName.trim(),
            phone: guardianForm.phone.trim(),
            email: guardianForm.email.trim(),
          },
        });
        if (!guardianResponse?.success || !guardianResponse.data?._id) {
          throw new Error("Guardian could not be created.");
        }
        guardianId = guardianResponse.data._id;
      }

      const linkResponse = await apiRequest(
        `/students/${encodeURIComponent(studentId)}/guardians`,
        {
          method: "POST",
          accessToken,
          body: {
            guardianId,
            relationship,
            ...flags,
            canAccessPortal: typeof flags.canAccessPortal === "boolean" ? flags.canAccessPortal : flags.isPrimary,
          },
        },
      );
      if (!linkResponse?.success) {
        throw new Error("Guardian could not be linked to this student.");
      }

      setShowAddForm(false);
      setGuardianForm(EMPTY_GUARDIAN);
      setSelectedGuardianId("__new__");
      setRelationship("other");
      setFlags(EMPTY_FLAGS);
      setNotice("Guardian linked successfully.");
      refresh();
    } catch (saveError) {
      setError(saveError.message || "Unable to save guardian information.");
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (link) => {
    setEditingLinkId(link._id);
    setEditForm({
      relationship: link.relationship,
      isPrimary: Boolean(link.isPrimary),
      isEmergencyContact: Boolean(link.isEmergencyContact),
      canPickup: Boolean(link.canPickup),
      receivesCommunication: link.receivesCommunication !== false,
      canAccessPortal: typeof link.canAccessPortal === "boolean" ? link.canAccessPortal : Boolean(link.isPrimary),
    });
    setError("");
    setNotice("");
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingLinkId || !editForm) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(
        `/students/${encodeURIComponent(studentId)}/guardians/${encodeURIComponent(editingLinkId)}`,
        {
          method: "PATCH",
          accessToken,
          body: editForm,
        },
      );
      if (!response?.success) throw new Error("Relationship could not be updated.");
      setEditingLinkId("");
      setEditForm(null);
      setNotice("Guardian relationship updated.");
      refresh();
    } catch (saveError) {
      setError(saveError.message || "Unable to update the relationship.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (link, status) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(
        `/students/${encodeURIComponent(studentId)}/guardians/${encodeURIComponent(link._id)}`,
        {
          method: "PATCH",
          accessToken,
          body: { status },
        },
      );
      if (!response?.success) throw new Error("Guardian relationship status could not be updated.");
      setNotice(status === "inactive" ? "Guardian relationship deactivated." : "Guardian relationship reactivated.");
      refresh();
    } catch (statusError) {
      setError(statusError.message || "Unable to update guardian relationship status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="student-details-card student-guardian-management" aria-labelledby="student-guardians-title">
      <div className="student-guardian-heading">
        <div>
          <h3 id="student-guardians-title">Linked Guardians</h3>
          <p>Guardian contacts and their permissions for this student.</p>
        </div>
        {canManage && (
          <button
            type="button"
            className="student-guardian-primary-button"
            onClick={() => {
              setShowAddForm((value) => !value);
              setError("");
              setNotice("");
            }}
          >
            {showAddForm ? "Cancel" : "Add guardian"}
          </button>
        )}
      </div>

      {error && <p className="student-guardian-error" role="alert">{error}</p>}
      {notice && <p className="student-guardian-notice" role="status">{notice}</p>}

      {showAddForm && canManage && (
        <form className="student-guardian-form" onSubmit={handleAddGuardian}>
          <h4>Link a guardian</h4>
          <label>
            Guardian record
            <select
              value={selectedGuardianId}
              onChange={(event) => setSelectedGuardianId(event.target.value)}
            >
              <option value="__new__">Create a new guardian</option>
              {availableGuardians.map((guardian) => (
                <option key={guardian._id} value={guardian._id}>
                  {guardianName(guardian)}{guardian.phone ? ` · ${guardian.phone}` : ""}
                </option>
              ))}
              {availableGuardians.length === 0 && (
                <option value="" disabled>No unlinked active guardians available</option>
              )}
            </select>
          </label>

          {selectedGuardianId === "__new__" && (
            <div className="student-guardian-form-grid">
              <label>
                First name *
                <input
                  required
                  value={guardianForm.firstName}
                  onChange={(event) => setGuardianForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                Last name
                <input
                  value={guardianForm.lastName}
                  onChange={(event) => setGuardianForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={guardianForm.phone}
                  onChange={(event) => setGuardianForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={guardianForm.email}
                  onChange={(event) => setGuardianForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
            </div>
          )}

          <label>
            Relationship *
            <select value={relationship} onChange={(event) => setRelationship(event.target.value)}>
              {RELATIONSHIPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <div className="student-guardian-flags">
            <p className="student-guardian-permission-help">Academic portal access is separate from emergency-contact and pickup permissions. Secondary guardians are not granted academic access unless the school enables it.</p>
            {[
              ["isPrimary", "Primary guardian"],
              ["isEmergencyContact", "Emergency contact"],
              ["canPickup", "May pick up student"],
              ["receivesCommunication", "Receives school communication"],
              ["canAccessPortal", "Can access academic portal"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={key === "canAccessPortal" ? (flags.canAccessPortal ?? Boolean(flags.isPrimary)) : flags[key]}
                  onChange={(event) => setFlags((current) => ({ ...current, [key]: event.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="student-guardian-form-actions">
            <button type="submit" className="student-guardian-primary-button" disabled={saving}>
              {saving ? "Saving…" : "Save guardian"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p role="status">Loading guardian information…</p>
      ) : links.length === 0 ? (
        <p className="student-guardian-empty">No guardians are linked to this student yet.</p>
      ) : (
        <div className="student-guardian-list">
          {links.map((link) => {
            const guardian = link.guardianId;
            const isEditing = editingLinkId === link._id;
            return (
              <article className="student-guardian-item" key={link._id}>
                <div className="student-guardian-item-heading">
                  <div>
                    <h4>{guardianName(guardian)}</h4>
                    <span className="student-guardian-relationship">{relationshipLabel(link.relationship)}</span>
                  </div>
                  <span className={`student-guardian-status student-guardian-status-${link.status || "active"}`}>
                    {link.status || "active"}
                  </span>
                </div>

                <div className="student-guardian-contact">
                  {guardian?.phone && <span>Phone: {guardian.phone}</span>}
                  {guardian?.email && <span>Email: {guardian.email}</span>}
                </div>

                <div className="student-guardian-badges">
                  {link.isPrimary && <span>Primary</span>}
                  {link.isEmergencyContact && <span>Emergency contact</span>}
                  {link.canPickup && <span>Pickup permitted</span>}
                  {link.receivesCommunication && <span>Receives communication</span>}
                  {(link.canAccessPortal ?? link.isPrimary) && <span>Academic portal access</span>}
                </div>

                {isEditing && canManage && editForm && (
                  <form className="student-guardian-form student-guardian-edit-form" onSubmit={saveEdit}>
                    <label>
                      Relationship
                      <select
                        value={editForm.relationship}
                        onChange={(event) => setEditForm((current) => ({ ...current, relationship: event.target.value }))}
                      >
                        {RELATIONSHIPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <div className="student-guardian-flags">
                      {[
                        ["isPrimary", "Primary guardian"],
                        ["isEmergencyContact", "Emergency contact"],
                        ["canPickup", "May pick up student"],
                        ["receivesCommunication", "Receives school communication"],
                        ["canAccessPortal", "Can access academic portal"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={editForm[key]}
                            onChange={(event) => setEditForm((current) => ({
                              ...current,
                              [key]: event.target.checked,
                              ...(key === "isPrimary" ? { canAccessPortal: event.target.checked } : {}),
                            }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="student-guardian-permission-help">Portal access controls academic records. Emergency contact and pickup permissions remain independent.</p>
                    <div className="student-guardian-form-actions">
                      <button type="submit" className="student-guardian-primary-button" disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                      <button type="button" onClick={() => { setEditingLinkId(""); setEditForm(null); }} disabled={saving}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {Array.isArray(link.auditTrail) && link.auditTrail.length > 0 && (
                  <details className="student-guardian-audit">
                    <summary>Relationship history ({link.auditTrail.length})</summary>
                    <ol>
                      {link.auditTrail.slice().reverse().map((entry, index) => (
                        <li key={`${entry.changedAt || entry.action}-${index}`}>
                          <span>{String(entry.action || "updated").replaceAll("_", " ")}</span>
                          <time dateTime={entry.changedAt}>{entry.changedAt ? new Date(entry.changedAt).toLocaleString("en-IN") : "Date unavailable"}</time>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                {canManage && !isEditing && (
                  <div className="student-guardian-item-actions">
                    <button type="button" onClick={() => beginEdit(link)} disabled={saving}>Edit relationship</button>
                    {link.status === "inactive" ? (
                      <button type="button" onClick={() => updateStatus(link, "active")} disabled={saving}>Reactivate</button>
                    ) : (
                      <button type="button" onClick={() => updateStatus(link, "inactive")} disabled={saving}>Deactivate</button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
