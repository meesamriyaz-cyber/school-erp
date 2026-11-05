import { useEffect, useState } from "react";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";
import "./SchoolUserDetails.css";

function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Unnamed user";
}

function display(value) {
  return value === null || value === undefined || value === "" ? "Not provided" : value;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function roleLabel(role) {
  return role ? role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}

const SCHOOL_ROLE_OPTIONS = [
  ["principal", "Principal"],
  ["teacher", "Teacher"],
  ["accountant", "Accountant"],
  ["librarian", "Librarian"],
  ["transport_manager", "Transport manager"],
  ["student", "Student"],
  ["parent", "Parent"],
];

export default function SchoolUserDetails({ userId, onBack }) {
  const { accessToken } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [selectedRole, setSelectedRole] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [roleMessage, setRoleMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/school/users/${encodeURIComponent(userId)}`, {
      accessToken,
      signal: controller.signal,
    }).then((response) => {
      if (!response?.success || !response.data?.user) {
        throw new Error("The server returned an unexpected user record.");
      }
      if (controller.signal.aborted) return;
      const nextUser = response.data.user;
      setRecord(nextUser);
      setSelectedRole(nextUser.role || "");
      setForm({
        firstName: nextUser.firstName || "",
        lastName: nextUser.lastName || "",
        email: nextUser.email || "",
        phone: nextUser.phone || "",
      });
    }).catch((requestError) => {
      if (!controller.signal.aborted && requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to load user details.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [accessToken, userId]);

  const startEditing = () => {
    setForm({
      firstName: record.firstName || "",
      lastName: record.lastName || "",
      email: record.email || "",
      phone: record.phone || "",
    });
    setError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setForm({
      firstName: record.firstName || "",
      lastName: record.lastName || "",
      email: record.email || "",
      phone: record.phone || "",
    });
    setError("");
    setEditing(false);
  };

  const handleRoleSubmit = async (event) => {
    event.preventDefault();
    if (!record || !SCHOOL_ROLE_OPTIONS.some(([value]) => value === selectedRole)) {
      setRoleError("Select a valid school-level role.");
      return;
    }
    if (selectedRole === record.role) {
      setRoleError("Select a different role before saving.");
      return;
    }

    setSavingRole(true);
    setRoleError("");
    setRoleMessage("");
    try {
      const response = await apiRequest(`/school/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        accessToken,
        body: { role: selectedRole },
      });
      if (!response?.success || !response.data?.user) {
        throw new Error(response?.message || "Unable to update this user's role.");
      }
      setRecord(response.data.user);
      setSelectedRole(response.data.user.role);
      setRoleMessage("Role updated. The user's existing sessions have been revoked.");
    } catch (requestError) {
      setRoleError(requestError.message || "Unable to update this user's role.");
    } finally {
      setSavingRole(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!firstName) {
      setError("First name is required.");
      return;
    }
    if (firstName.length > 80 || lastName.length > 80) {
      setError("Names must not exceed 80 characters.");
      return;
    }
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (phone.length > 20) {
      setError("Phone must not exceed 20 characters.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await apiRequest(`/school/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        accessToken,
        body: { firstName, lastName, email, phone: phone || null },
      });
      if (!response?.success || !response.data?.user) {
        throw new Error("The server returned an unexpected update response.");
      }
      setRecord(response.data.user);
      setForm({
        firstName: response.data.user.firstName || "",
        lastName: response.data.user.lastName || "",
        email: response.data.user.email || "",
        phone: response.data.user.phone || "",
      });
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message || "Unable to save user profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="school-user-details" aria-labelledby="school-user-details-title">
      <div className="school-user-details-toolbar">
        <button type="button" className="school-user-back" onClick={onBack}>
          ← Back to users
        </button>
        {record && !editing && (
          <button type="button" className="school-user-edit" onClick={startEditing}>
            Edit profile
          </button>
        )}
      </div>

      {loading ? (
        <p className="school-user-details-message" role="status">Loading user details…</p>
      ) : error && !record ? (
        <div className="school-user-details-error" role="alert">
          <p>{error}</p>
        </div>
      ) : record ? (
        <>
          <header className="school-user-profile-header">
            <div className="school-user-profile-avatar" aria-hidden="true">
              {fullName(record).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 id="school-user-details-title">{fullName(record)}</h2>
              <p>{record.email}</p>
              <div className="school-user-profile-meta">
                <span>{roleLabel(record.role)}</span>
                <span className={`school-user-status school-user-status-${record.status || "unknown"}`}>{record.status || "Unknown"}</span>
              </div>
            </div>
          </header>

          {error && <p className="school-user-details-inline-error" role="alert">{error}</p>}

          <form className="school-user-edit-form school-user-role-form" onSubmit={handleRoleSubmit}>
            <h3>Change user role</h3>
            <p>Only roles within this school can be assigned. Changing a role revokes the user's existing sessions.</p>
            <label>
              <span>New role</span>
              <select value={selectedRole} onChange={(event) => {
                setSelectedRole(event.target.value);
                setRoleError("");
                setRoleMessage("");
              }}>
                {SCHOOL_ROLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {roleError && <p className="school-user-details-inline-error" role="alert">{roleError}</p>}
            {roleMessage && <p className="school-user-details-success" role="status">{roleMessage}</p>}
            <div className="school-user-form-actions">
              <button type="submit" className="school-user-save" disabled={savingRole || selectedRole === record.role}>
                {savingRole ? "Saving role…" : "Save role"}
              </button>
            </div>
          </form>

          {editing ? (
            <form className="school-user-edit-form" onSubmit={handleSubmit} noValidate>
              <h3>Edit personal information</h3>
              <div className="school-user-edit-grid">
                <label>
                  <span>First name</span>
                  <input name="firstName" value={form.firstName} onChange={handleChange} maxLength={80} required />
                </label>
                <label>
                  <span>Last name</span>
                  <input name="lastName" value={form.lastName} onChange={handleChange} maxLength={80} />
                </label>
                <label>
                  <span>Email</span>
                  <input name="email" type="email" value={form.email} onChange={handleChange} maxLength={254} required />
                </label>
                <label>
                  <span>Phone</span>
                  <input name="phone" type="tel" value={form.phone} onChange={handleChange} maxLength={20} />
                </label>
              </div>
              <div className="school-user-form-actions">
                <button type="button" className="school-user-cancel" onClick={cancelEditing} disabled={saving}>Cancel</button>
                <button type="submit" className="school-user-save" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          ) : (
            <div className="school-user-details-grid">
              <article><span>First name</span><strong>{display(record.firstName)}</strong></article>
              <article><span>Last name</span><strong>{display(record.lastName)}</strong></article>
              <article><span>Email address</span><strong>{display(record.email)}</strong></article>
              <article><span>Phone</span><strong>{display(record.phone)}</strong></article>
              <article><span>Role</span><strong>{roleLabel(record.role)}</strong></article>
              <article><span>Account status</span><strong>{display(record.status)}</strong></article>
              <article><span>Last login</span><strong>{formatDate(record.lastLoginAt)}</strong></article>
              <article><span>Account created</span><strong>{formatDate(record.createdAt)}</strong></article>
              <article><span>Last profile update</span><strong>{formatDate(record.updatedAt)}</strong></article>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
