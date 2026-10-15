
import { useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";

const initialForm = {
  admissionNumber: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "not_specified",
  admissionDate: new Date().toISOString().slice(0, 10),
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
};

export default function StudentForm({ onClose, onCreated }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = {
        ...form,
        admissionNumber: form.admissionNumber.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        guardianEmail: form.guardianEmail.trim(),
        dateOfBirth: form.dateOfBirth || null,
      };

      const response = await apiRequest("/students", {
        method: "POST",
        accessToken,
        body: payload,
      });

      if (!response.success || !response.data) {
        throw new Error("The server returned an unexpected response.");
      }

      onCreated(response.data);
    } catch (err) {
      setError(err.message || "Unable to create student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="student-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="student-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-form-title"
      >
        <div className="student-form-header">
          <div>
            <h2 id="student-form-title">Add student</h2>
            <p>Enter the admission and guardian details.</p>
          </div>
          <button
            type="button"
            className="student-form-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close form"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="student-form-body">
            <h3>Student information</h3>

            <div className="student-form-grid">
              <label>
                Admission number *
                <input
                  name="admissionNumber"
                  value={form.admissionNumber}
                  onChange={updateField}
                  maxLength={50}
                  required
                />
              </label>

              <label>
                Admission date *
                <input
                  name="admissionDate"
                  type="date"
                  value={form.admissionDate}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                First name *
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={updateField}
                  maxLength={80}
                  required
                />
              </label>

              <label>
                Last name
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={updateField}
                  maxLength={80}
                />
              </label>

              <label>
                Date of birth
                <input
                  name="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={updateField}
                />
              </label>

              <label>
                Gender
                <select
                  name="gender"
                  value={form.gender}
                  onChange={updateField}
                >
                  <option value="not_specified">Prefer not to specify</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>

            <h3>Guardian information</h3>

            <div className="student-form-grid">
              <label>
                Guardian name
                <input
                  name="guardianName"
                  value={form.guardianName}
                  onChange={updateField}
                  maxLength={160}
                />
              </label>

              <label>
                Guardian phone
                <input
                  name="guardianPhone"
                  type="tel"
                  value={form.guardianPhone}
                  onChange={updateField}
                  maxLength={20}
                />
              </label>

              <label className="student-form-full">
                Guardian email
                <input
                  name="guardianEmail"
                  type="email"
                  value={form.guardianEmail}
                  onChange={updateField}
                  maxLength={254}
                />
              </label>
            </div>

            {error && (
              <div className="student-error" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="student-form-footer">
            <button
              type="button"
              className="student-cancel-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save student"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
