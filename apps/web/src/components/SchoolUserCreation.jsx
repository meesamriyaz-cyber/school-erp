import { useState } from "react";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";
import "./SchoolUserCreation.css";

const ROLE_OPTIONS = [
  { value: "principal", label: "Principal" },
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "",
  password: "",
};

export default function SchoolUserCreation({ onCreated = () => {}, onCancel = () => {} }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (error) setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      role: form.role,
      password: form.password,
    };

    if (!payload.firstName) return setError("First name is required.");
    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return setError("Enter a valid email address.");
    }
    if (!payload.role) return setError("Select a role.");
    if (payload.password.length < 8) return setError("Initial password must contain at least 8 characters.");
    if (new TextEncoder().encode(payload.password).length > 72) {
      return setError("Initial password must not exceed 72 UTF-8 bytes.");
    }
    if (payload.phone.length > 20) return setError("Phone must not exceed 20 characters.");

    setSaving(true);
    try {
      const response = await apiRequest("/school/users", {
        method: "POST",
        accessToken,
        body: payload,
      });
      if (!response?.success || !response?.data?.user) {
        throw new Error("The server returned an unexpected response.");
      }
      const createdUser = response.data.user;
      setSuccess(`${createdUser.firstName} ${createdUser.lastName || ""} created with pending status. The account must be activated separately.`.trim());
      setForm(INITIAL_FORM);
      onCreated(response.data);
    } catch (requestError) {
      setError(requestError.message || "Unable to create school user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="school-user-creation" aria-labelledby="school-user-creation-title">
      <header className="school-user-creation-header">
        <div>
          <h2 id="school-user-creation-title">Create school user</h2>
          <p>Add an account to this school. New accounts are created as pending.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <div className="school-user-creation-grid">
          <label>
            First name *
            <input name="firstName" value={form.firstName} onChange={updateField} maxLength={80} autoComplete="given-name" required />
          </label>
          <label>
            Last name
            <input name="lastName" value={form.lastName} onChange={updateField} maxLength={80} autoComplete="family-name" />
          </label>
          <label>
            Email *
            <input name="email" type="email" value={form.email} onChange={updateField} maxLength={254} autoComplete="email" required />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" value={form.phone} onChange={updateField} maxLength={20} autoComplete="tel" />
          </label>
          <label>
            Role *
            <select name="role" value={form.role} onChange={updateField} required>
              <option value="">Select a role</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Initial password *
            <input name="password" type="password" value={form.password} onChange={updateField} minLength={8} maxLength={72} autoComplete="new-password" required />
            <span className="school-user-creation-hint">At least 8 characters. Share it securely with the user.</span>
          </label>
        </div>

        {error && <div className="school-user-creation-error" role="alert">{error}</div>}
        {success && <div className="school-user-creation-success" role="status">{success}</div>}

        <div className="school-user-creation-actions">
          <button type="button" className="school-user-creation-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="school-user-creation-submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</button>
        </div>
      </form>
    </section>
  );
}
