
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import StudentForm from "./StudentForm.jsx";
import StudentDetails from "./StudentDetails.jsx";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "withdrawn", label: "Withdrawn" },
];

const PAGE_SIZE = 10;

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStudentName(student) {
  return [student.firstName, student.lastName]
    .filter(Boolean)
    .join(" ");
}

function StudentStatus({ status }) {
  return (
    <span
      className={`student-status student-status-${status || "inactive"}`}
    >
      {status || "Unknown"}
    </span>
  );
}

function StudentMobileCard({ student, onView }) {
  return (
    <article className="student-mobile-card">
      <div className="student-mobile-card-header">
        <div className="student-mobile-identity">
          <strong className="student-mobile-name">
            {getStudentName(student) || "Unnamed student"}
          </strong>
          <span className="student-subtext">
            {student.gender === "not_specified"
              ? "Gender not specified"
              : student.gender || "Gender not specified"}
          </span>
        </div>

        <StudentStatus status={student.status} />
      </div>

      <div className="student-mobile-details">
        <div className="student-mobile-detail">
          <span className="student-mobile-label">Admission number</span>
          <span className="student-admission">
            {student.admissionNumber || "—"}
          </span>
        </div>

        <div className="student-mobile-detail">
          <span className="student-mobile-label">Admission date</span>
          <span>{formatDate(student.admissionDate)}</span>
        </div>

        <div className="student-mobile-detail student-mobile-guardian">
          <span className="student-mobile-label">Guardian</span>
          <span className="student-mobile-value">
            {student.guardianName || "—"}
          </span>
          {student.guardianPhone && (
            <span className="student-subtext">
              {student.guardianPhone}
            </span>
          )}
        </div>
      </div>

      <div className="student-mobile-card-actions">
        <button
          type="button"
          className="student-view-button"
          onClick={() => onView(student._id)}
        >
          View student
        </button>
      </div>
    </article>
  );
}

export default function StudentDirectory() {
  const { accessToken } = useAuth();

  const [students, setStudents] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadStudents = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });

        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);

        const response = await apiRequest(
          `/students?${params.toString()}`,
          { accessToken, signal },
        );

        if (!response.success || !response.data) {
          throw new Error("The server returned an unexpected response.");
        }

        setStudents(response.data);
        setTotal(
  response.pagination?.total ?? response.data.length,
);
      } catch (err) {
        if (err.name === "AbortError") return;

        setStudents([]);
        setTotal(0);
        setError(err.message || "Unable to load students.");
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [accessToken, page, search, statusFilter],
  );

 useEffect(() => {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    void loadStudents(controller.signal);
  }, 0);

  return () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
}, [loadStudents, refreshKey]);

 

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleViewStudent = (studentId) => {
    setSelectedStudentId(studentId);
  };

  if (selectedStudentId) {
    return (
      <StudentDetails
        studentId={selectedStudentId}
        onBack={() => setSelectedStudentId(null)}
      />
    );
  }

  return (
    <section className="student-directory">
      <div className="student-toolbar">
        <div className="student-toolbar-heading">
          <h2>Student directory</h2>
          <p>Manage student records for your school.</p>
        </div>

        <div className="student-toolbar-actions">
          <div className="student-total">
            <strong>{total}</strong>
            <span>students found</span>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setNotice("");
              setShowStudentForm(true);
            }}
          >
            + Add student
          </button>
        </div>
      </div>

      <div className="student-filters">
        <label className="student-search">
          <span className="sr-only">Search students</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
            placeholder="Search name or admission number…"
          />
        </label>

        <label className="student-status-filter">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="student-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void loadStudents(controller.signal);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/*
        Desktop and tablet: keep the existing table.
        Mobile: render the same student records as stacked cards.
      */}
      <div className="student-table-wrap">
        <table className="student-table">
          <thead>
            <tr>
              <th>Admission no.</th>
              <th>Student</th>
              <th>Guardian</th>
              <th>Admission date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="student-empty">
                  Loading student records…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="student-empty">
                  Student records could not be loaded.
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={6} className="student-empty">
                  No students found. Try another search or add your first
                  student.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student._id}>
                  <td>
                    <span className="student-admission">
                      {student.admissionNumber || "—"}
                    </span>
                  </td>

                  <td>
                    <strong className="student-name">
                      {getStudentName(student) || "Unnamed student"}
                    </strong>
                    <span className="student-subtext">
                      {student.gender === "not_specified"
                        ? "Gender not specified"
                        : student.gender || "Gender not specified"}
                    </span>
                  </td>

                  <td>
                    <span>{student.guardianName || "—"}</span>
                    <span className="student-subtext">
                      {student.guardianPhone || ""}
                    </span>
                  </td>

                  <td>{formatDate(student.admissionDate)}</td>

                  <td>
                    <StudentStatus status={student.status} />
                  </td>

                  <td>
                    <button
                      type="button"
                      className="student-view-button"
                      onClick={() => handleViewStudent(student._id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="student-mobile-list" aria-live="polite">
        {loading ? (
          <p className="student-mobile-message">
            Loading student records…
          </p>
        ) : error ? (
          <p className="student-mobile-message">
            Student records could not be loaded.
          </p>
        ) : students.length === 0 ? (
          <p className="student-mobile-message">
            No students found. Try another search or add your first student.
          </p>
        ) : (
          students.map((student) => (
            <StudentMobileCard
              key={student._id}
              student={student}
              onView={handleViewStudent}
            />
          ))
        )}
      </div>

      <div className="student-pagination">
        <span>
          {total === 0
            ? "No records"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                page * PAGE_SIZE,
                total,
              )} of ${total}`}
        </span>

        <div className="student-pagination-actions">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>

          <span>
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {notice && (
        <div className="student-success" role="status">
          {notice}
        </div>
      )}

      {showStudentForm && (
        <StudentForm
          onClose={() => setShowStudentForm(false)}
          onCreated={(student) => {
            setShowStudentForm(false);

            setNotice(
              `Student ${student.firstName} ${student.lastName || ""} added successfully.`,
            );

            setSearchInput("");
            setSearch("");
            setStatusFilter("");
            setPage(1);
            setRefreshKey((current) => current + 1);
          }}
        />
      )}
    </section>
  );
}
