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
  photoUrl: "",
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
  const [guardianPhotoFile, setGuardianPhotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [relationship, setRelationship] = useState("other");
  const [flags, setFlags] = useState(EMPTY_FLAGS);
  const [saving, setSaving] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [editingGuardianId, setEditingGuardianId] = useState("");
  const [guardianEditForm, setGuardianEditForm] = useState(null);
  const [guardianEditPhotoFile, setGuardianEditPhotoFile] = useState(null);

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

  const uploadGuardianPhoto = async (guardianId, file) => {
    if (!file) return null;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPG or PNG image up to 5 MB.");
    const signatureResponse = await apiRequest(`/guardians/${encodeURIComponent(guardianId)}/photo-signature`, { method: "POST", accessToken, body: {} });
    if (!signatureResponse?.success || !signatureResponse.data) throw new Error("Could not prepare secure photo upload.");
    const signature = signatureResponse.data;
    const payload = new FormData();
    payload.append("file", file); payload.append("api_key", signature.apiKey); payload.append("timestamp", String(signature.timestamp));
    payload.append("folder", signature.folder); payload.append("public_id", signature.publicId);
    payload.append("allowed_formats", signature.allowedFormats); payload.append("signature", signature.signature);
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: "POST", body: payload });
    const uploaded = await uploadResponse.json();
    if (!uploadResponse.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || "Guardian photo upload failed.");
    const saved = await apiRequest(`/guardians/${encodeURIComponent(guardianId)}`, { method: "PATCH", accessToken, body: { photoUrl: uploaded.secure_url } });
    if (!saved?.success || !saved.data) throw new Error("Photo uploaded, but could not be attached to the guardian record.");
    return uploaded.secure_url;
  };

  const handleAddGuardian = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    let emailVerificationNotice = "";
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
            phone: guardianForm.phone.trim() || null,
            email: guardianForm.email.trim(),
            photoUrl: guardianForm.photoUrl.trim(),
          },
        });
        if (!guardianResponse?.success || !guardianResponse.data?._id) {
          throw new Error("Guardian could not be created.");
        }
        guardianId = guardianResponse.data._id;
        if (guardianPhotoFile) { setUploadingPhoto(true); await uploadGuardianPhoto(guardianId, guardianPhotoFile); setUploadingPhoto(false); }
        if (guardianForm.email.trim()) {
          try {
            await apiRequest(`/guardians/${encodeURIComponent(guardianId)}/email-verification/send`, { method: "POST", accessToken, body: { email: guardianForm.email.trim() } });
            emailVerificationNotice = " Email verification code sent.";
          } catch (verificationError) {
            emailVerificationNotice = ` Email verification could not be sent: ${verificationError.message || "Please resend from Guardian Directory."}`;
          }
        }
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
            ...(relationship === "mother" ? { isPrimary: false, receivesCommunication: false, canAccessPortal: false } : {}),
            canAccessPortal: relationship === "mother" ? false : (typeof flags.canAccessPortal === "boolean" ? flags.canAccessPortal : flags.isPrimary),
          },
        },
      );
      if (!linkResponse?.success) {
        throw new Error("Guardian could not be linked to this student.");
      }

      setShowAddForm(false);
      setGuardianForm(EMPTY_GUARDIAN);
      setGuardianPhotoFile(null);
      setSelectedGuardianId("__new__");
      setRelationship("other");
      setFlags(relationship === "mother" ? { ...EMPTY_FLAGS, receivesCommunication: false, isPrimary: false, canAccessPortal: false } : EMPTY_FLAGS);
      setNotice(`Guardian linked successfully.${emailVerificationNotice}`);
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
      receivesCommunication: link.relationship === "mother" ? false : link.receivesCommunication !== false,
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
          body: { ...editForm, ...(editForm.relationship === "mother" ? { isPrimary: false, receivesCommunication: false, canAccessPortal: false } : {}) },
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

  const beginGuardianEdit = (link) => {
    const guardian = link.guardianId;
    if (!guardian?._id) return;
    setEditingGuardianId(String(guardian._id));
    setGuardianEditForm({
      firstName: guardian.firstName || "",
      lastName: guardian.lastName || "",
      phone: guardian.phone || "",
      email: guardian.pendingEmail || guardian.email || "",
    });
    setError("");
    setNotice("");
  };

  const saveGuardianContact = async (event, link) => {
    event.preventDefault();
    if (!guardianEditForm || !link.guardianId?._id) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (link.relationship === "mother") {
        await apiRequest(`/students/${encodeURIComponent(studentId)}/guardians/${encodeURIComponent(link._id)}`, { method: "PATCH", accessToken, body: { receivesCommunication: false } });
      }
      const response = await apiRequest(`/guardians/${encodeURIComponent(link.guardianId._id)}`, {
        method: "PATCH",
        accessToken,
        body: {
          firstName: guardianEditForm.firstName.trim(),
          lastName: guardianEditForm.lastName.trim(),
          phone: guardianEditForm.phone.trim() || null,
          email: guardianEditForm.email.trim() || null,
        },
      });
      if (!response?.success) throw new Error("Guardian contact details could not be updated.");
      if (guardianEditPhotoFile) await uploadGuardianPhoto(link.guardianId._id, guardianEditPhotoFile);
      setGuardianEditPhotoFile(null);
      if (guardianEditForm.email.trim()) {
        try {
          await apiRequest(`/guardians/${encodeURIComponent(link.guardianId._id)}/email-verification/send`, {
            method: "POST", accessToken, body: { email: guardianEditForm.email.trim() },
          });
          setNotice("Guardian details saved. An email verification code was sent.");
        } catch (verificationError) {
          setNotice(`Guardian details saved. Email verification could not be sent: ${verificationError.message || "Please retry from Guardian Directory."}`);
        }
      } else {
        setNotice("Guardian contact details saved.");
      }
      setEditingGuardianId("");
      setGuardianEditForm(null);
      refresh();
    } catch (saveError) {
      setError(saveError.message || "Unable to update guardian contact details.");
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
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={guardianForm.phone}
                  onChange={(event) => setGuardianForm((current) => ({ ...current, phone: event.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))}
                />
              </label>
              <label>
                Email (OTP verified)
                <input
                  type="email"
                  value={guardianForm.email}
                  onChange={(event) => setGuardianForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="student-guardian-form-full">
                Guardian photo (JPG or PNG, up to 5 MB)
                <input type="file" accept="image/jpeg,image/png" onChange={(event) => setGuardianPhotoFile(event.target.files?.[0] || null)} />
              </label>
              {guardianPhotoFile && <p className="student-guardian-permission-help">Selected photo: {guardianPhotoFile.name}. It uploads securely when you save the guardian.</p>}
            </div>
          )}

          <label>
            Relationship *
            <select value={relationship} onChange={(event) => {
              const nextRelationship = event.target.value;
              setRelationship(nextRelationship);
              if (nextRelationship === "mother") setFlags((current) => ({ ...current, isPrimary: false, receivesCommunication: false, canAccessPortal: false }));
            }}>
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
              {uploadingPhoto ? "Uploading photo…" : saving ? "Saving…" : "Save guardian"}
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
                  {guardian?.photoUrl && <img src={guardian.photoUrl} alt={`${guardianName(guardian)} profile`} className="student-guardian-photo" />}
                  {guardian?.phone && <span>Phone: {guardian.phone}</span>}
                  {guardian?.email && <span>Email: {guardian.email} · {guardian.emailVerifiedAt && guardian.verifiedEmail === guardian.email ? "verified" : "not verified"}</span>}
                  {guardian?.pendingEmail && <span>Pending email: {guardian.pendingEmail}</span>}
                </div>

                {canManage && editingGuardianId === String(guardian?._id) && guardianEditForm && (
                  <form className="student-guardian-form student-guardian-edit-form" onSubmit={(event) => saveGuardianContact(event, link)}>
                    <h4>Edit {relationshipLabel(link.relationship)} contact details</h4>
                    <div className="student-guardian-form-grid">
                      <label>First name *<input required value={guardianEditForm.firstName} onChange={(event) => setGuardianEditForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
                      <label>Last name<input value={guardianEditForm.lastName} onChange={(event) => setGuardianEditForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
                      <label>Phone<input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={guardianEditForm.phone} onChange={(event) => setGuardianEditForm((current) => ({ ...current, phone: event.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))} /></label>
                      <label>Email<input type="email" value={guardianEditForm.email} onChange={(event) => setGuardianEditForm((current) => ({ ...current, email: event.target.value }))} /></label>
                      <label className="student-guardian-form-full">Replace photo (JPG or PNG, up to 5 MB)<input type="file" accept="image/jpeg,image/png" onChange={(event) => setGuardianEditPhotoFile(event.target.files?.[0] || null)} /></label>
                    </div>
                    {link.relationship === "mother" && <p className="student-guardian-permission-help">Mother's phone and email are stored for school records only. School communications remain directed to the primary Father contact.</p>}
                    <div className="student-guardian-form-actions">
                      <button type="submit" className="student-guardian-primary-button" disabled={saving}>{saving ? "Saving…" : "Save contact details"}</button>
                      <button type="button" onClick={() => { setEditingGuardianId(""); setGuardianEditForm(null); }} disabled={saving}>Cancel</button>
                    </div>
                  </form>
                )}

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
                    <button type="button" onClick={() => beginGuardianEdit(link)} disabled={saving}>Edit contact details</button>
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
