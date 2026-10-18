
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import EditStudentForm from "./EditStudentForm.jsx";

function formatDate(value) {
  if (!value) return "Not provided";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not provided";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DetailItem({ label, value }) {
  return (
    <div className="student-detail-item">
      <span className="student-detail-label">{label}</span>
      <span className="student-detail-value">
        {value || "Not provided"}
      </span>
    </div>
  );
}

export default function StudentDetails({ studentId, onBack }) {
  const { accessToken } = useAuth();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStudent() {
      setLoading(true);
      setError("");

      try {
        const response = await apiRequest(
          `/students/${encodeURIComponent(studentId)}`,
          {
            accessToken,
            signal: controller.signal,
          },
        );

        if (!response.success || !response.data) {
          throw new Error("Unable to load student details.");
        }

        setStudent(response.data);
      } catch (err) {
        if (err.name === "AbortError") return;

        setError(
          err.message || "Unable to load student details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadStudent();

    return () => controller.abort();
  }, [studentId, accessToken]);

  if (loading) {
    return (
      <section className="student-details-page">
        <button type="button" onClick={onBack}>
          ← Back to Students
        </button>
        <p>Loading student details...</p>
      </section>
    );
  }

  if (error || !student) {
    return (
      <section className="student-details-page">
        <button type="button" onClick={onBack}>
          ← Back to Students
        </button>
        <p role="alert">
          {error || "Student details could not be found."}
        </p>
      </section>
    );
  }

  if (isEditing) {
    return (
      <EditStudentForm
        student={student}
        onCancel={() => setIsEditing(false)}
        onSaved={(updatedStudent) => {
          setStudent(updatedStudent);
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <section className="student-details-page">
      <button type="button" onClick={onBack}>
        ← Back to Students
      </button>

      <header className="student-details-header">
       <div className="student-profile-identity">
    {student.photoUrl ? (
      <img
        className="student-profile-photo"
        src={student.photoUrl}
        alt={`${student.firstName} ${student.lastName || ""}`}
      />
    ) : (
      <div
  className="student-profile-avatar"
  aria-label="Student photo not available"
>
  {student.firstName
    ? student.firstName.charAt(0).toUpperCase()
    : "S"}
  {student.lastName
    ? student.lastName.charAt(0).toUpperCase()
    : ""}
</div>
    )}
        <div>
          <h2>
            {student.firstName} {student.lastName || ""}
          </h2>
          <p>Admission No.: {student.admissionNumber}</p>
        </div>

        <div className="student-details-actions">
          <span
            className={`student-status student-status-${student.status}`}
          >
            {student.status}
          </span>

          <button
            type="button"
            onClick={() => setIsEditing(true)}
          >
            Edit Student
          </button>
        </div>
        </div>
      </header>

      <div className="student-details-card">
        <h3>Personal Information</h3>

        <div className="student-details-grid">
          <DetailItem
            label="First Name"
            value={student.firstName}
          />
          <DetailItem
            label="Last Name"
            value={student.lastName}
          />
          <DetailItem
            label="Date of Birth"
            value={formatDate(student.dateOfBirth)}
          />
          <DetailItem
            label="Gender"
            value={student.gender}
          />
          <DetailItem
            label="Admission Date"
            value={formatDate(student.admissionDate)}
          />
          <DetailItem
            label="Admission Number"
            value={student.admissionNumber}
          />
        </div>
      </div>

      <div className="student-details-card">
        <h3>Guardian Information</h3>

        <div className="student-details-grid">
          <DetailItem
            label="Guardian Name"
            value={student.guardianName}
          />
          <DetailItem
            label="Guardian Phone"
            value={student.guardianPhone}
          />
          <DetailItem
            label="Guardian Email"
            value={student.guardianEmail}
          />
        </div>
      </div>
    </section>
  );
}
