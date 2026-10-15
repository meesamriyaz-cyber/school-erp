
import {  useState } from "react";
import { apiRequest } from "../lib/api.js";

import { useAuth } from "../context/authContext.js";

function toDateInput(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function getInitialFields(student) {
  return {
    admissionNumber: student.admissionNumber || "",
    firstName: student.firstName || "",
    lastName: student.lastName || "",
    dateOfBirth: toDateInput(student.dateOfBirth),
    gender: student.gender || "not_specified",
    admissionDate: toDateInput(student.admissionDate),
    guardianName: student.guardianName || "",
    guardianPhone: student.guardianPhone || "",
    guardianEmail: student.guardianEmail || "",
    status: student.status || "active",
  };
}

export default function EditStudentForm({
  student,
  onCancel,
  onSaved,
}) {
  const { accessToken } = useAuth();

  const [form, setForm] = useState(() => getInitialFields(student));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

 
  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      dateOfBirth: form.dateOfBirth || null,
      admissionDate: form.admissionDate || null,
    };

    try {
      const response = await apiRequest(
        `/students/${encodeURIComponent(student._id)}`,
        {
          method: "PATCH",
          accessToken,
          body: payload,
        },
      );

      if (!response.success || !response.data) {
        throw new Error("The student could not be updated.");
      }

      onSaved(response.data);
    } catch (err) {
      setError(err.message || "Unable to save student changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="student-edit-page">
      <button type="button" onClick={onCancel}>
        ← Cancel
      </button>

      <h2>Edit Student</h2>
      <p>Update the student's information below.</p>

      {error && <p role="alert">{error}</p>}

      <form onSubmit={handleSubmit}>
        <label>
          Admission Number
          <input
            name="admissionNumber"
            value={form.admissionNumber}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          First Name
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Last Name
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
          />
        </label>

        <label>
          Date of Birth
          <input
            type="date"
            name="dateOfBirth"
            value={form.dateOfBirth}
            onChange={handleChange}
          />
        </label>

        <label>
          Gender
          <select
            name="gender"
            value={form.gender}
            onChange={handleChange}
            required
          >
            <option value="not_specified">Not specified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label>
          Admission Date
          <input
            type="date"
            name="admissionDate"
            value={form.admissionDate}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Guardian Name
          <input
            name="guardianName"
            value={form.guardianName}
            onChange={handleChange}
          />
        </label>

        <label>
          Guardian Phone
          <input
            type="tel"
            name="guardianPhone"
            value={form.guardianPhone}
            onChange={handleChange}
          />
        </label>

        <label>
          Guardian Email
          <input
            type="email"
            name="guardianEmail"
            value={form.guardianEmail}
            onChange={handleChange}
          />
        </label>

        <label>
          Status
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            required
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>

        <div>
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
