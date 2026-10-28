import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import EditStudentForm from "./EditStudentForm.jsx";

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function DetailItem({ label, value }) {
  return (
    <div className="student-detail-item">
      <span className="student-detail-label">{label}</span>
      <span className="student-detail-value">{value || "Not provided"}</span>
    </div>
  );
}

function enrollmentName(enrollment) {
  const year = enrollment.academicYearId?.name || "Academic year not available";
  const className = enrollment.classId?.name || "Class not available";
  const sectionName = enrollment.sectionId?.name;
  return [year, className, sectionName ? `Section ${sectionName}` : null].filter(Boolean).join(" · ");
}

export default function StudentDetails({ studentId, onBack }) {
  const { accessToken } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [academicHistory, setAcademicHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyRetry, setHistoryRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStudentAndHistory() {
      setLoading(true);
      setError("");
      setHistoryLoading(true);
      setHistoryError("");
      setAcademicHistory([]);

      try {
        const response = await apiRequest(
          `/students/${encodeURIComponent(studentId)}`,
          { accessToken, signal: controller.signal },
        );
        if (!response?.success || !response.data) {
          throw new Error("Unable to load student details.");
        }
        if (controller.signal.aborted) return;
        setStudent(response.data);
        setLoading(false);

        try {
          const historyResponse = await apiRequest(
            `/enrollments?studentId=${encodeURIComponent(studentId)}`,
            { accessToken, signal: controller.signal },
          );
          if (!historyResponse?.success || !Array.isArray(historyResponse.data)) {
            throw new Error("Unable to load academic history.");
          }
          if (!controller.signal.aborted) setAcademicHistory(historyResponse.data);
        } catch (historyLoadError) {
          if (historyLoadError.name !== "AbortError" && !controller.signal.aborted) {
            setHistoryError(historyLoadError.message || "Unable to load academic history.");
          }
        } finally {
          if (!controller.signal.aborted) setHistoryLoading(false);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Unable to load student details.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadStudentAndHistory();
    return () => controller.abort();
  }, [studentId, accessToken, historyRetry]);

  if (loading) {
    return (
      <section className="student-details-page">
        <button type="button" onClick={onBack}>← Back to Students</button>
        <p>Loading student details...</p>
      </section>
    );
  }

  if (error || !student) {
    return (
      <section className="student-details-page">
        <button type="button" onClick={onBack}>← Back to Students</button>
        <p role="alert">{error || "Student details could not be found."}</p>
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

  const currentEnrollment = academicHistory.find((item) => item.status === "active");

  return (
    <section className="student-details-page">
      <button type="button" onClick={onBack}>← Back to Students</button>

      <header className="student-details-header">
        <div className="student-profile-identity">
          {student.photoUrl ? (
            <img className="student-profile-photo" src={student.photoUrl} alt={`${student.firstName} ${student.lastName || ""}`} />
          ) : (
            <div className="student-profile-avatar" aria-label="Student photo not available">
              {student.firstName ? student.firstName.charAt(0).toUpperCase() : "S"}
              {student.lastName ? student.lastName.charAt(0).toUpperCase() : ""}
            </div>
          )}
          <div>
            <h2>{student.firstName} {student.lastName || ""}</h2>
            <p>Admission No.: {student.admissionNumber}</p>
          </div>
          <div className="student-details-actions">
            <span className={`student-status student-status-${student.status}`}>{student.status}</span>
            <button type="button" onClick={() => setIsEditing(true)}>Edit Student</button>
          </div>
        </div>
      </header>

      <div className="student-details-card">
        <h3>Personal Information</h3>
        <div className="student-details-grid">
          <DetailItem label="First Name" value={student.firstName} />
          <DetailItem label="Last Name" value={student.lastName} />
          <DetailItem label="Date of Birth" value={formatDate(student.dateOfBirth)} />
          <DetailItem label="Gender" value={student.gender} />
          <DetailItem label="Admission Date" value={formatDate(student.admissionDate)} />
          <DetailItem label="Admission Number" value={student.admissionNumber} />
        </div>
      </div>

      <div className="student-details-card">
        <h3>Guardian Information</h3>
        <div className="student-details-grid">
          <DetailItem label="Guardian Name" value={student.guardianName} />
          <DetailItem label="Guardian Phone" value={student.guardianPhone} />
          <DetailItem label="Guardian Email" value={student.guardianEmail} />
        </div>
      </div>

      <section className="student-details-card student-academic-profile" aria-labelledby="student-current-placement-title">
        <h3 id="student-current-placement-title">Current Academic Placement</h3>
        {historyLoading ? (
          <p role="status">Loading academic placement…</p>
        ) : currentEnrollment ? (
          <div className="student-details-grid">
            <DetailItem label="Academic Year" value={currentEnrollment.academicYearId?.name} />
            <DetailItem label="Class" value={currentEnrollment.classId?.name} />
            <DetailItem label="Section" value={currentEnrollment.sectionId?.name ? `Section ${currentEnrollment.sectionId.name}` : "Not assigned"} />
            <DetailItem label="Enrollment Date" value={formatDate(currentEnrollment.enrollmentDate)} />
            <DetailItem label="Placement Status" value={currentEnrollment.status} />
          </div>
        ) : historyError ? (
          <p className="student-academic-history-error">Current placement could not be loaded.</p>
        ) : (
          <p>This student has no active academic placement.</p>
        )}
      </section>

      <section className="student-details-card student-academic-history" aria-labelledby="student-academic-history-title">
        <div className="student-academic-history-heading">
          <div>
            <h3 id="student-academic-history-title">Academic History</h3>
            <p>Current and previous class placements for this student.</p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryRetry((value) => value + 1)}
            disabled={historyLoading}
          >
            {historyLoading ? "Refreshing…" : historyError ? "Retry history" : "Refresh history"}
          </button>
        </div>
        {historyLoading ? (
          <p role="status">Loading academic history…</p>
        ) : historyError ? (
          <p className="student-academic-history-error" role="status">{historyError}</p>
        ) : academicHistory.length === 0 ? (
          <p>No academic history is recorded for this student yet.</p>
        ) : (
          <ol className="student-academic-history-list">
            {academicHistory.map((enrollment) => (
              <li key={enrollment._id}>
                <div>
                  <strong>{enrollmentName(enrollment)}</strong>
                  <span>Enrolled: {formatDate(enrollment.enrollmentDate)}</span>
                  {enrollment.endedAt && <span>Ended: {formatDate(enrollment.endedAt)}</span>}
                </div>
                <span className={`student-history-status student-history-status-${enrollment.status}`}>{enrollment.status}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
