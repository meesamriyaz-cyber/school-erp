import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./StudentResultsPortal.css";

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  : "—";

export default function StudentResultsPortal() {
  const { user, accessToken, logout } = useAuth();
  const [results, setResults] = useState([]);
  const [homework, setHomework] = useState([]);
  const [activeTab, setActiveTab] = useState("results");
  const [selectedStudent, setSelectedStudent] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.allSettled([
      apiRequest("/portal/results", { accessToken, signal: controller.signal }),
      apiRequest("/portal/homework", { accessToken, signal: controller.signal }),
    ]).then(([resultResponse, homeworkResponse]) => {
      if (controller.signal.aborted) return;
      if (resultResponse.status === "fulfilled") setResults(Array.isArray(resultResponse.value?.data) ? resultResponse.value.data : []);
      else setError(resultResponse.reason?.message || "Unable to load published results.");
      if (homeworkResponse.status === "fulfilled") setHomework(Array.isArray(homeworkResponse.value?.data) ? homeworkResponse.value.data : []);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [accessToken]);

  const students = useMemo(() => {
    const unique = new Map();
    results.forEach((item) => unique.set(String(item.student?._id), item.student));
    return [...unique.values()];
  }, [results]);

  const visibleResults = useMemo(() => selectedStudent === "all"
    ? results
    : results.filter((item) => String(item.student?._id) === selectedStudent),
  [results, selectedStudent]);

  const isParent = user?.role === "parent";
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <main className="student-portal">
      <header className="student-portal-header">
        <div>
          <div className="portal-eyebrow">SCHOOLSUITE · STUDENT PORTAL</div>
          <h1>{isParent ? "Children’s examination results" : "My examination results"}</h1>
          <p>Only results officially published by your school appear here.</p>
        </div>
        <div className="portal-account">
          <span>{fullName || (isParent ? "Parent account" : "Student account")}</span>
          <button type="button" className="portal-signout" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <nav className="portal-tabs no-print" aria-label="Student portal sections">
        <button type="button" className={activeTab === "results" ? "active" : ""} aria-pressed={activeTab === "results"} onClick={() => setActiveTab("results")}>Examination results</button>
        <button type="button" className={activeTab === "homework" ? "active" : ""} aria-pressed={activeTab === "homework"} onClick={() => setActiveTab("homework")}>Homework & classwork ({homework.length})</button>
      </nav>
      {activeTab === "homework" ? (
        loading ? <div className="portal-state">Loading homework…</div> : homework.length === 0 ? <div className="portal-empty"><h2>No published homework</h2><p>Assignments shared by your school will appear here.</p></div> : (
          <div className="portal-homework-list">{homework.map((item) => <article className="portal-homework-card" key={String(item.homework._id) + String(item.student?._id)}>
            <div className="portal-homework-heading"><div><span>{item.homework.subjectId?.name || "Subject"} · {item.homework.classId?.name || "Class"}{item.homework.sectionId?.name ? ` · ${item.homework.sectionId.name}` : ""}</span><h2>{item.homework.title}</h2></div><strong>Due {formatDate(item.homework.dueDate)}</strong></div>
            {isParent && <p className="portal-homework-student">For: {[item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ")}</p>}
            <p className="portal-homework-instructions">{item.homework.instructions}</p>
            <footer>Assigned {formatDate(item.homework.assignedDate)} · {item.homework.teacherId ? `By ${[item.homework.teacherId.firstName, item.homework.teacherId.lastName].filter(Boolean).join(" ")}` : "School assignment"}</footer>
          </article>)}</div>
        )
      ) : <>
      {isParent && students.length > 1 && (
        <div className="portal-filter no-print">
          <label htmlFor="portal-student-filter">View results for</label>
          <select id="portal-student-filter" value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)}>
            <option value="all">All linked children</option>
            {students.map((student) => (
              <option key={student._id} value={String(student._id)}>
                {[student.firstName, student.lastName].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="portal-state">Loading published results…</div>
      ) : error ? (
        <div className="portal-state portal-error" role="alert">{error}</div>
      ) : visibleResults.length === 0 ? (
        <div className="portal-empty">
          <div className="portal-empty-icon">▤</div>
          <h2>No published results yet</h2>
          <p>Your school’s examination results will appear here once they are finalized and published.</p>
        </div>
      ) : (
        <div className="portal-results">
          <div className="portal-results-toolbar no-print">
            <span>{visibleResults.length} published result{visibleResults.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={() => window.print()}>Print report card</button>
          </div>
          {visibleResults.map((item) => (
            <article className="report-card" key={String(item.examination._id) + String(item.result.enrollmentId)}>
              <div className="report-card-heading">
                <div>
                  <div className="report-kicker">OFFICIAL EXAMINATION RESULT</div>
                  <h2>{item.examination.name}</h2>
                  <p>{formatDate(item.examination.startDate)} – {formatDate(item.examination.endDate)}</p>
                </div>
                <div className="report-school-mark">S</div>
              </div>
              <div className="report-student">
                <div><span>Student</span><strong>{[item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ")}</strong></div>
                <div><span>Admission No.</span><strong>{item.student?.admissionNumber || "—"}</strong></div>
              </div>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr><th>Subject</th><th>Maximum</th><th>Pass mark</th><th>Marks obtained</th><th>Status</th></tr></thead>
                  <tbody>
                    {item.result.subjects.map((subject) => (
                      <tr key={String(subject.examSubjectId)}>
                        <td>{subject.subject?.name || "Subject"}</td>
                        <td>{subject.maxMarks}</td>
                        <td>{subject.passMarks}</td>
                        <td>{subject.absent ? "Absent" : subject.marksObtained ?? "—"}</td>
                        <td><span className={"result-status status-" + subject.status}>{subject.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="report-summary">
                <div><span>Total</span><strong>{item.result.totalObtained} / {item.result.totalMaximum}</strong></div>
                <div><span>Percentage</span><strong>{item.result.percentage}%</strong></div>
                <div><span>Result</span><strong className={"overall-" + item.result.status}>{item.result.status.toUpperCase()}</strong></div>
              </div>
              <footer className="report-footer">This result is system-generated and reflects the published school record.</footer>
            </article>
          ))}
        </div>
      )}
      </>}
    </main>
  );
}
