import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./GuardianDirectory.css";
import PortalAccountLink from "./PortalAccountLink.jsx";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function fullName(guardian) {
  return [guardian.firstName, guardian.lastName].filter(Boolean).join(" ") || "Unnamed guardian";
}

function GuardianStatus({ status }) {
  return (
    <span className={`guardian-directory-status guardian-directory-status-${status || "unknown"}`}>
      {status || "Unknown"}
    </span>
  );
}

export default function GuardianDirectory() {
  const { accessToken } = useAuth();
  const [guardians, setGuardians] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedGuardian, setSelectedGuardian] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const { user } = useAuth();
  const canManage = ["school_admin", "principal"].includes(user?.role);
  const canLinkPortal = user?.role === "school_admin";
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [mutationNotice, setMutationNotice] = useState("");
  const [confirmStatusChange, setConfirmStatusChange] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGuardians() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      try {
        const response = await apiRequest("/guardians?" + params.toString(), {
          accessToken,
          signal: controller.signal,
        });
        if (!response?.success || !Array.isArray(response.data)) {
          throw new Error("The server returned an unexpected guardian directory response.");
        }
        if (!controller.signal.aborted) {
          setGuardians(response.data);
          setPagination(response.pagination || {
            page,
            limit: PAGE_SIZE,
            total: response.data.length,
            totalPages: response.data.length ? 1 : 0,
          });
        }
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !controller.signal.aborted) {
          setGuardians([]);
          setPagination({ page, limit: PAGE_SIZE, total: 0, totalPages: 0 });
          setError(requestError.message || "Unable to load guardians.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadGuardians();
    return () => controller.abort();
  }, [accessToken, refreshKey, page, search, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const totalPages = Math.max(1, Number(pagination.totalPages) || 1);
  const currentPage = Math.min(page, totalPages);
  const visibleGuardians = guardians;

  const openGuardian = async (guardian) => {
    setSelectedGuardian(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await apiRequest(`/guardians/${guardian._id}`, { accessToken });
      if (!response?.success || !response.data) {
        throw new Error("Unable to load guardian details.");
      }
      setSelectedGuardian(response.data);
    } catch (requestError) {
      setDetailError(requestError.message || "Unable to load guardian details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeGuardian = () => {
    setSelectedGuardian(null);
    setDetailError("");
    setEditing(false);
    setEditForm(null);
    setMutationError("");
    setMutationNotice("");
    setConfirmStatusChange(false);
  };

  const beginEdit = () => {
    if (!selectedGuardian || !canManage) return;
    setEditForm({
      firstName: selectedGuardian.firstName || "",
      lastName: selectedGuardian.lastName || "",
      phone: selectedGuardian.phone || "",
      email: selectedGuardian.pendingEmail || selectedGuardian.email || "",
      photoUrl: selectedGuardian.photoUrl || "",
    });
    setMutationError("");
    setMutationNotice("");
    setEditing(true);
  };

  const saveGuardian = async (event) => {
    event.preventDefault();
    if (!selectedGuardian || !editForm) return;
    const payload = {
      firstName: editForm.firstName.trim(),
      lastName: editForm.lastName.trim(),
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      photoUrl: editForm.photoUrl.trim() || null,
    };
    if (!payload.firstName) {
      setMutationError("Guardian first name is required.");
      return;
    }
    if (payload.firstName.length > 80 || payload.lastName.length > 80) {
      setMutationError("Names must not exceed 80 characters.");
      return;
    }
    if (payload.phone && !/^[0-9]{10}$/.test(payload.phone)) {
      setMutationError("Phone must contain exactly 10 digits (0-9).");
      return;
    }
    if ((payload.photoUrl || "") && (!/^https:\/\//i.test(payload.photoUrl) || payload.photoUrl.length > 2048)) {
      setMutationError("Photo URL must be a valid HTTPS URL (maximum 2048 characters).");
      return;
    }
    if ((payload.email || "").length > 254 ||
        (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))) {
      setMutationError("Enter a valid email address (maximum 254 characters).");
      return;
    }

    setSaving(true);
    setMutationError("");
    setMutationNotice("");
    try {
      const response = await apiRequest(`/guardians/${encodeURIComponent(selectedGuardian._id)}`, {
        method: "PATCH",
        accessToken,
        body: payload,
      });
      if (!response?.success || !response.data) {
        throw new Error(response?.message || "Guardian details could not be updated.");
      }
      const updated = { ...selectedGuardian, ...response.data };
      setSelectedGuardian(updated);
      setGuardians((current) => current.map((item) => (
        item._id === updated._id ? { ...item, ...updated } : item
      )));
      setEditForm(null);
      setEditing(false);
      setMutationNotice("Guardian details updated successfully.");
    } catch (saveError) {
      setMutationError(saveError.message || "Unable to update guardian details.");
    } finally {
      setSaving(false);
    }
  };

  const uploadParentPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedGuardian) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMutationError("Choose a JPG or PNG image up to 5 MB.");
      return;
    }
    setUploadingPhoto(true); setMutationError(""); setMutationNotice("");
    try {
      const signatureResponse = await apiRequest(`/guardians/${encodeURIComponent(selectedGuardian._id)}/photo-signature`, { method: "POST", accessToken, body: {} });
      if (!signatureResponse?.success || !signatureResponse.data) throw new Error("Could not prepare secure photo upload.");
      const signature = signatureResponse.data;
      const payload = new FormData();
      payload.append("file", file);
      payload.append("api_key", signature.apiKey);
      payload.append("timestamp", String(signature.timestamp));
      payload.append("folder", signature.folder);
      payload.append("public_id", signature.publicId);
      payload.append("allowed_formats", signature.allowedFormats);
      payload.append("signature", signature.signature);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: "POST", body: payload });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || "Parent photo upload failed.");
      const saved = await apiRequest(`/guardians/${encodeURIComponent(selectedGuardian._id)}`, { method: "PATCH", accessToken, body: { photoUrl: uploaded.secure_url } });
      if (!saved?.success || !saved.data) throw new Error("Photo uploaded, but could not be attached to the guardian record.");
      setSelectedGuardian((current) => ({ ...current, ...saved.data }));
      setGuardians((current) => current.map((item) => item._id === selectedGuardian._id ? { ...item, ...saved.data } : item));
      setEditForm((current) => current ? { ...current, photoUrl: uploaded.secure_url } : current);
      setMutationNotice("Parent photo uploaded and saved.");
    } catch (uploadError) { setMutationError(uploadError.message || "Unable to upload parent photo."); }
    finally { setUploadingPhoto(false); }
  };

  const sendVerificationCode = async () => {
    if (!selectedGuardian) return;
    const email = selectedGuardian.pendingEmail || selectedGuardian.email;
    if (!email) { setMutationError("Save a parent email address before requesting verification."); return; }
    setSaving(true); setMutationError(""); setMutationNotice("");
    try {
      await apiRequest(`/guardians/${encodeURIComponent(selectedGuardian._id)}/email-verification/send`, { method: "POST", accessToken, body: { email } });
      setMutationNotice(`A six-digit verification code was sent to ${email}.`);
    } catch (requestError) { setMutationError(requestError.message || "Could not send verification email."); }
    finally { setSaving(false); }
  };

  const verifyEmailCode = async () => {
    if (!selectedGuardian || !/^\d{6}$/.test(verificationCode.trim())) { setMutationError("Enter the six-digit code sent by email."); return; }
    setSaving(true); setMutationError(""); setMutationNotice("");
    try {
      const response = await apiRequest(`/guardians/${encodeURIComponent(selectedGuardian._id)}/email-verification/verify`, { method: "POST", accessToken, body: { code: verificationCode.trim() } });
      if (!response?.success) throw new Error(response?.message || "Email verification failed.");
      setSelectedGuardian((current) => ({ ...current, email: response.data.email, verifiedEmail: response.data.email, pendingEmail: null, emailVerifiedAt: response.data.emailVerifiedAt }));
      setVerificationCode("");
      setMutationNotice("Parent email address verified successfully.");
      setRefreshKey((current) => current + 1);
    } catch (requestError) { setMutationError(requestError.message || "Email verification failed."); }
    finally { setSaving(false); }
  };

  const changeGuardianStatus = async () => {
    if (!selectedGuardian || !canManage) return;
    const nextStatus = selectedGuardian.status === "active" ? "inactive" : "active";
    setSaving(true);
    setMutationError("");
    setMutationNotice("");
    try {
      const response = await apiRequest(`/guardians/${encodeURIComponent(selectedGuardian._id)}`, {
        method: "PATCH",
        accessToken,
        body: { status: nextStatus },
      });
      if (!response?.success || !response.data) {
        throw new Error(response?.message || "Guardian status could not be updated.");
      }
      const updated = { ...selectedGuardian, ...response.data };
      setSelectedGuardian(updated);
      setGuardians((current) => current.map((item) => (
        item._id === updated._id ? { ...item, ...updated } : item
      )));
      setConfirmStatusChange(false);
      setMutationNotice(nextStatus === "inactive"
        ? "Guardian record deactivated. Linked student history has been retained."
        : "Guardian record reactivated.");
    } catch (statusError) {
      setMutationError(statusError.message || "Unable to update guardian status.");
    } finally {
      setSaving(false);
    }
  };

  const updateSearch = (value) => {
    setSearchInput(value);
    setPage(1);
  };

  const updateStatus = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <section className="guardian-directory" aria-labelledby="guardian-directory-heading">
      <div className="guardian-directory-toolbar">
        <div>
          <h2 id="guardian-directory-heading">Guardian directory</h2>
          <p>View guardian contact records registered with your school.</p>
        </div>
        <div className="guardian-directory-total" aria-live="polite">
          <strong>{pagination.total}</strong>
          <span>{pagination.total === 1 ? "guardian" : "guardians"} found</span>
        </div>
      </div>

      <div className="guardian-directory-filters">
        <label className="guardian-directory-search">
          <span className="sr-only">Search guardians</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search name, phone or email…"
          />
        </label>
        <label className="guardian-directory-status-filter">
          <span className="sr-only">Filter guardians by status</span>
          <select value={statusFilter} onChange={(event) => updateStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="guardian-directory-refresh"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="guardian-directory-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Retry</button>
        </div>
      )}

      <div className="guardian-directory-table-wrap">
        <table className="guardian-directory-table">
          <thead>
            <tr>
              <th scope="col">Guardian</th>
              <th scope="col">Phone</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="guardian-directory-message">Loading guardians…</td></tr>
            ) : error ? (
              <tr><td colSpan={4} className="guardian-directory-message">Guardian records could not be loaded.</td></tr>
            ) : visibleGuardians.length === 0 ? (
              <tr><td colSpan={4} className="guardian-directory-message">No guardians found. Try changing your search or filters.</td></tr>
            ) : visibleGuardians.map((guardian) => (
              <tr key={guardian._id}>
                <td>
                  <button type="button" className="guardian-directory-name" onClick={() => openGuardian(guardian)}>
                    {fullName(guardian)}
                  </button>
                </td>
                <td>{guardian.phone || "—"}</td>
                <td>{guardian.email || "—"}</td>
                <td><GuardianStatus status={guardian.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="guardian-directory-mobile-list" aria-live="polite">
        {loading ? <p>Loading guardians…</p>
          : error ? <p>Guardian records could not be loaded.</p>
            : visibleGuardians.length === 0 ? <p>No guardians found. Try changing your search or filters.</p>
              : visibleGuardians.map((guardian) => (
                <article className="guardian-directory-mobile-card" key={guardian._id}>
                  <div className="guardian-directory-mobile-heading">
                    <button type="button" className="guardian-directory-name" onClick={() => openGuardian(guardian)}>
                      {fullName(guardian)}
                    </button>
                    <GuardianStatus status={guardian.status} />
                  </div>
                  <span>Phone: {guardian.phone || "—"}</span>
                  <span>Email: {guardian.email || "—"}</span>
                </article>
              ))}
      </div>

      {(detailLoading || detailError || selectedGuardian) && (
        <section className="guardian-directory-detail" aria-labelledby="guardian-detail-heading">
          <div className="guardian-directory-detail-header">
            <div>
              <h3 id="guardian-detail-heading">Guardian details</h3>
              {selectedGuardian && <p>{fullName(selectedGuardian)}</p>}
            </div>
            <div className="guardian-directory-detail-actions">
              {canManage && selectedGuardian && !editing && (
                <>
                  <button type="button" onClick={beginEdit}>Edit guardian</button>
                  <button
                    type="button"
                    className={selectedGuardian.status === "active" ? "guardian-directory-danger" : ""}
                    onClick={() => {
                      setConfirmStatusChange(true);
                      setMutationError("");
                      setMutationNotice("");
                    }}
                    disabled={saving}
                  >
                    {selectedGuardian.status === "active" ? "Deactivate" : "Reactivate"}
                  </button>
                </>
              )}
              <button type="button" onClick={closeGuardian}>Close</button>
            </div>
          </div>
          {detailLoading ? <p role="status">Loading guardian details…</p>
            : detailError ? <p role="alert">{detailError}</p>
              : (
                <>
                  {mutationError && <p className="guardian-directory-mutation-error" role="alert">{mutationError}</p>}
                  {mutationNotice && <p className="guardian-directory-mutation-notice" role="status">{mutationNotice}</p>}
                  {confirmStatusChange && canManage && (
                    <div className="guardian-directory-confirm-status">
                      <p>
                        {selectedGuardian.status === "active"
                          ? "Deactivate this guardian record? Existing student links and history will be retained."
                          : "Reactivate this guardian record?"}
                      </p>
                      <button type="button" onClick={changeGuardianStatus} disabled={saving}>
                        {saving ? "Saving…" : "Confirm"}
                      </button>
                      <button type="button" onClick={() => setConfirmStatusChange(false)} disabled={saving}>Cancel</button>
                    </div>
                  )}
                  {editing && canManage ? (
                    <form className="guardian-directory-edit-form" onSubmit={saveGuardian}>
                      <h4>Edit guardian contact information</h4>
                      <div className="guardian-directory-edit-grid">
                        <label>
                          First name *
                          <input value={editForm.firstName} onChange={(event) => setEditForm((current) => ({ ...current, firstName: event.target.value }))} maxLength={80} required />
                        </label>
                        <label>
                          Last name
                          <input value={editForm.lastName} onChange={(event) => setEditForm((current) => ({ ...current, lastName: event.target.value }))} maxLength={80} />
                        </label>
                        <label>
                          Phone
                          <input type="tel" inputMode="numeric" pattern="[0-9]{10}" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))} maxLength={10} />
                        </label>
                        <label>
                          Email
                          <input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} maxLength={254} />
                        </label>
                        <label className="guardian-directory-edit-full">Upload parent photo (JPG/PNG, max 5 MB)
                          <input type="file" accept="image/jpeg,image/png" onChange={uploadParentPhoto} disabled={uploadingPhoto || saving} />
                          {uploadingPhoto ? <span role="status">Uploading photo…</span> : null}
                        </label>
                        <label className="guardian-directory-edit-full">Parent photo URL (HTTPS)
                          <input type="url" value={editForm.photoUrl} onChange={(event) => setEditForm((current) => ({ ...current, photoUrl: event.target.value }))} maxLength={2048} placeholder="https://…" />
                        </label>
                      </div>
                      <div className="guardian-directory-edit-actions">
                        <button type="button" onClick={() => { setEditing(false); setEditForm(null); setMutationError(""); }} disabled={saving}>Cancel</button>
                        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
                      </div>
                    </form>
                  ) : null}
                  {!editing && <div className="guardian-directory-contact">
                    <span><strong>Phone:</strong> {selectedGuardian.phone || "—"}</span>
                    <span><strong>Email:</strong> {selectedGuardian.email || "—"}</span>
                    <span><strong>Pending email:</strong> {selectedGuardian.pendingEmail || "—"}</span>
                    <span><strong>Email verification:</strong> {selectedGuardian.emailVerifiedAt && selectedGuardian.verifiedEmail === selectedGuardian.email ? "Verified" : "Not verified"}</span>
                    <span><strong>Phone verification:</strong> Not performed (contact number only)</span>
                    <span><strong>Status:</strong> <GuardianStatus status={selectedGuardian.status} /></span>
                    {selectedGuardian.photoUrl ? <img src={selectedGuardian.photoUrl} alt={`${fullName(selectedGuardian)} profile`} className="guardian-directory-photo" /> : null}
                    {canManage && <div className="guardian-directory-verify-actions">
                      <button type="button" onClick={sendVerificationCode} disabled={saving || !(selectedGuardian.pendingEmail || selectedGuardian.email)}>Send email OTP</button>
                      <label>6-digit email code <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} /></label>
                      <button type="button" onClick={verifyEmailCode} disabled={saving || verificationCode.length !== 6}>Verify email</button>
                    </div>}
                  </div>}
                  {canLinkPortal && !editing && (
                    <div className="guardian-directory-portal-link">
                      <h4>Parent portal access</h4>
                      <PortalAccountLink
                        record={selectedGuardian}
                        recordType="guardian"
                        onLinked={(updated) => {
                          setSelectedGuardian((current) => ({ ...current, ...updated }));
                          setGuardians((current) => current.map((item) => (
                            item._id === updated._id ? { ...item, ...updated } : item
                          )));
                          setMutationNotice("Parent portal account linked successfully.");
                        }}
                      />
                    </div>
                  )}
                  <h4>Linked students ({selectedGuardian.linkedStudents?.length || 0})</h4>
                  {!selectedGuardian.linkedStudents?.length ? (
                    <p>No students are currently linked to this guardian.</p>
                  ) : (
                    <div className="guardian-directory-linked-students">
                      {selectedGuardian.linkedStudents.map((link) => (
                        <article key={link._id} className="guardian-directory-linked-student">
                          <div>
                            <strong>{fullName(link.student)}</strong>
                            <span>Admission no.: {link.student?.admissionNumber || "—"}</span>
                          </div>
                          <div>
                            <span>Relationship: {String(link.relationship || "other").replaceAll("_", " ")}</span>
                            <GuardianStatus status={link.status} />
                          </div>
                          <div className="guardian-directory-flags">
                            {link.isPrimary && <span>Primary guardian</span>}
                            {link.isEmergencyContact && <span>Emergency contact</span>}
                            {link.canPickup && <span>Can pick up</span>}
                            {link.receivesCommunication && <span>Receives communication</span>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
        </section>
      )}

      <div className="guardian-directory-pagination">
        <span>
          {pagination.total === 0
            ? "No records"
            : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, pagination.total)} of ${pagination.total}`}
        </span>
        <div>
          <button type="button" disabled={currentPage <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}
