import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./StudentResultsPortal.css";

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  : "—";

export default function StudentResultsPortal() {
  const { user, accessToken, logout } = useAuth();
  const [children, setChildren] = useState([]);
  const [results, setResults] = useState([]);
  const [homework, setHomework] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fees, setFees] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState("");
  const [homeworkNotice, setHomeworkNotice] = useState("");
  const [activeTab, setActiveTab] = useState("results");
  const [selectedStudent, setSelectedStudent] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return undefined;
    const controller = new AbortController();
    Promise.allSettled([
      apiRequest("/portal/children", { accessToken, signal: controller.signal }),
      apiRequest("/portal/results", { accessToken, signal: controller.signal }),
      apiRequest("/portal/homework", { accessToken, signal: controller.signal }),
      apiRequest("/portal/homework-submissions", { accessToken, signal: controller.signal }),
      apiRequest("/portal/attendance", { accessToken, signal: controller.signal }),
      apiRequest("/portal/fees", { accessToken, signal: controller.signal }),
      apiRequest("/portal/timetable", { accessToken, signal: controller.signal }),
    ]).then(([childrenResponse, resultResponse, homeworkResponse, submissionResponse, attendanceResponse, feesResponse, timetableResponse]) => {
      if (controller.signal.aborted) return;
      setError("");
      if (childrenResponse.status === "fulfilled") setChildren(Array.isArray(childrenResponse.value?.data) ? childrenResponse.value.data : []);
      else setError(childrenResponse.reason?.message || "Unable to load linked student records.");
      if (resultResponse.status === "fulfilled") setResults(Array.isArray(resultResponse.value?.data) ? resultResponse.value.data : []);
      else setError((current) => current || resultResponse.reason?.message || "Unable to load published results.");
      if (homeworkResponse.status === "fulfilled") setHomework(Array.isArray(homeworkResponse.value?.data) ? homeworkResponse.value.data : []);
      if (submissionResponse.status === "fulfilled") setSubmissions(Array.isArray(submissionResponse.value?.data) ? submissionResponse.value.data : []);
      if (attendanceResponse.status === "fulfilled") setAttendance(Array.isArray(attendanceResponse.value?.data) ? attendanceResponse.value.data : []);
      if (feesResponse.status === "fulfilled") setFees(Array.isArray(feesResponse.value?.data) ? feesResponse.value.data : []);
      if (timetableResponse.status === "fulfilled") setTimetable(Array.isArray(timetableResponse.value?.data) ? timetableResponse.value.data : []);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [accessToken]);

  const visibleResults = useMemo(() => selectedStudent === "all"
    ? results
    : results.filter((item) => String(item.student?._id) === selectedStudent),
  [results, selectedStudent]);

  const visibleHomework = useMemo(() => selectedStudent === "all"
    ? homework
    : homework.filter((item) => String(item.student?._id) === selectedStudent),
  [homework, selectedStudent]);

  const visibleAttendance = useMemo(() => selectedStudent === "all"
    ? attendance
    : attendance.filter((item) => String(item.student?._id) === selectedStudent),
  [attendance, selectedStudent]);

  const visibleFees = useMemo(() => selectedStudent === "all"
    ? fees
    : fees.filter((item) => String(item.student?._id) === selectedStudent),
  [fees, selectedStudent]);

  const visibleTimetable = useMemo(() => selectedStudent === "all"
    ? timetable
    : timetable.filter((item) => String(item.student?._id) === selectedStudent),
  [timetable, selectedStudent]);

  const visibleSubmissions = useMemo(() => selectedStudent === "all"
    ? submissions
    : submissions.filter((item) => String(item.studentId?._id || item.studentId) === selectedStudent),
  [submissions, selectedStudent]);

  const isParent = user?.role === "parent";
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <main className="student-portal">
      <header className="student-portal-header">
        <div>
          <div className="portal-eyebrow">SCHOOLSUITE · FAMILY & STUDENT PORTAL</div>
          <h1>{isParent ? "Family learning overview" : "My student dashboard"}</h1>
          <p>View attendance, homework, examination results, fees and the class timetable.</p>
        </div>
        <div className="portal-account">
          <span>{fullName || (isParent ? "Parent account" : "Student account")}</span>
          <button type="button" className="portal-signout" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <nav className="portal-tabs no-print" aria-label="Student portal sections">
        <button type="button" className={activeTab === "results" ? "active" : ""} aria-pressed={activeTab === "results"} onClick={() => setActiveTab("results")}>Results</button>
        <button type="button" className={activeTab === "attendance" ? "active" : ""} aria-pressed={activeTab === "attendance"} onClick={() => setActiveTab("attendance")}>Attendance</button>
        <button type="button" className={activeTab === "homework" ? "active" : ""} aria-pressed={activeTab === "homework"} onClick={() => setActiveTab("homework")}>Homework ({visibleHomework.length})</button>
        <button type="button" className={activeTab === "fees" ? "active" : ""} aria-pressed={activeTab === "fees"} onClick={() => setActiveTab("fees")}>Fees</button>
        <button type="button" className={activeTab === "timetable" ? "active" : ""} aria-pressed={activeTab === "timetable"} onClick={() => setActiveTab("timetable")}>Timetable</button>
      </nav>
      {isParent && children.length > 0 && (
        <section className="portal-child-overview" aria-label="Linked children">
          <div className="portal-child-overview-heading">
            <div><strong>Linked children</strong><span>{children.length} student{children.length === 1 ? "" : "s"} connected to this parent account</span></div>
            {children.length > 1 && <label>Viewing <select aria-label="Select child" value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)}><option value="all">All children</option>{children.map(({ student }) => <option key={student._id} value={String(student._id)}>{[student.firstName, student.lastName].filter(Boolean).join(" ")}</option>)}</select></label>}
          </div>
          <div className="portal-child-cards">
            {children.filter(({ student }) => selectedStudent === "all" || String(student?._id) === selectedStudent).map(({ student, currentEnrollment }) => (
              <button type="button" className={"portal-child-card" + (selectedStudent === String(student?._id) ? " selected" : "")} key={student._id} onClick={() => setSelectedStudent((current) => current === String(student._id) ? "all" : String(student._id))}>
                <span className="portal-child-avatar">{(student.firstName || "S").slice(0, 1).toUpperCase()}</span>
                <span className="portal-child-info"><strong>{[student.firstName, student.lastName].filter(Boolean).join(" ")}</strong><small>{student.admissionNumber || "Student"}</small><small>{currentEnrollment ? [currentEnrollment.classId?.name, currentEnrollment.sectionId?.name].filter(Boolean).join(" · ") : "No active enrollment"}</small></span>
                <span className="portal-child-action">{selectedStudent === String(student._id) ? "Selected" : "View details"}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {activeTab === "attendance" ? (
        loading ? <div className="portal-state">Loading attendance…</div> : visibleAttendance.length === 0 ? <div className="portal-empty"><h2>No attendance records</h2><p>Attendance records shared by your school will appear here.</p></div> : (
          <section className="portal-data-panel"><div className="portal-data-heading"><h2>Attendance history</h2><span>{visibleAttendance.length} records · recent 12 months</span></div><div className="portal-table-wrap"><table className="portal-data-table"><thead><tr><th>Date</th>{isParent && <th>Student</th>}<th>Status</th><th>Remarks</th></tr></thead><tbody>{visibleAttendance.map((record) => <tr key={record._id}><td>{formatDate(record.date)}</td>{isParent && <td>{[record.student?.firstName, record.student?.lastName].filter(Boolean).join(" ")}</td>}<td><span className={"portal-attendance-status attendance-" + record.status}>{record.status}</span></td><td>{record.remarks || "—"}</td></tr>)}</tbody></table></div></section>
        )
      ) : activeTab === "fees" ? (
        loading ? <div className="portal-state">Loading fee statements…</div> : visibleFees.length === 0 ? <div className="portal-empty"><h2>No fee invoices</h2><p>Fee invoices and receipts issued by your school will appear here.</p></div> : (
          <section className="portal-fee-list">{visibleFees.map((invoice) => <article className="portal-fee-card" key={invoice._id}><div className="portal-fee-heading"><div><span>{invoice.invoiceNumber} · {invoice.academicYearId?.name || "Academic year"}</span><h2>{isParent ? [invoice.student?.firstName, invoice.student?.lastName].filter(Boolean).join(" ") : "Fee statement"}</h2></div><strong className={"portal-fee-status fee-" + invoice.status}>{invoice.status}</strong></div><div className="portal-fee-totals"><div><span>Total</span><strong>₹{Number(invoice.totalAmount || 0).toLocaleString("en-IN")}</strong></div><div><span>Paid</span><strong>₹{Number(invoice.paidAmount || 0).toLocaleString("en-IN")}</strong></div><div><span>Balance</span><strong>₹{Number(invoice.balance || 0).toLocaleString("en-IN")}</strong></div><div><span>Due date</span><strong>{formatDate(invoice.dueDate)}</strong></div></div>{invoice.payments?.length > 0 && <div className="portal-receipts"><strong>Receipts</strong>{invoice.payments.map((payment) => <div key={payment._id}><span>{payment.receiptNumber} · {formatDate(payment.paymentDate)} · {payment.method?.replaceAll("_", " ")}</span><b>₹{Number(payment.amount || 0).toLocaleString("en-IN")} · {payment.status}</b></div>)}</div>}</article>)}</section>
        )
      ) : activeTab === "timetable" ? (
        loading ? <div className="portal-state">Loading timetable…</div> : visibleTimetable.length === 0 || visibleTimetable.every((item) => !item.entries?.length) ? <div className="portal-empty"><h2>No timetable available</h2><p>Your current class timetable will appear here once it is published in the school workspace.</p></div> : (
          <section className="portal-timetable-list">{visibleTimetable.map((item) => <article className="portal-data-panel" key={String(item.student?._id)}><div className="portal-data-heading"><h2>{isParent ? [item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ") : "My timetable"}</h2><span>{[item.enrollment?.classId?.name, item.enrollment?.sectionId?.name, item.enrollment?.academicYearId?.name].filter(Boolean).join(" · ")}</span></div><div className="portal-table-wrap"><table className="portal-data-table"><thead><tr><th>Day</th><th>Period</th><th>Time</th><th>Subject</th><th>Teacher</th><th>Room</th></tr></thead><tbody>{item.entries.map((entry) => <tr key={entry._id}><td>{["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][entry.dayOfWeek]}</td><td>{entry.periodNumber}</td><td>{entry.startTime}–{entry.endTime}</td><td>{entry.assignmentId?.subjectId?.name || "—"}</td><td>{[entry.assignmentId?.teacherId?.firstName, entry.assignmentId?.teacherId?.lastName].filter(Boolean).join(" ") || "—"}</td><td>{entry.room || "—"}</td></tr>)}</tbody></table></div></article>)}</section>
        )
      ) : activeTab === "homework" ? (
        loading ? <div className="portal-state">Loading homework…</div> : visibleHomework.length === 0 ? <div className="portal-empty"><h2>No published homework</h2><p>Assignments shared by your school will appear here.</p></div> : (
          <>
          {homeworkNotice && <div className="portal-homework-notice" role="status">{homeworkNotice}</div>}
          <div className="portal-homework-list">{visibleHomework.map((item) => <article className="portal-homework-card" key={String(item.homework._id) + String(item.student?._id)}>
            <div className="portal-homework-heading"><div><span>{item.homework.subjectId?.name || "Subject"} · {item.homework.classId?.name || "Class"}{item.homework.sectionId?.name ? ` · ${item.homework.sectionId.name}` : ""}</span><h2>{item.homework.title}</h2></div><strong>Due {formatDate(item.homework.dueDate)}</strong></div>
            {isParent && <p className="portal-homework-student">For: {[item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ")}</p>}
            <p className="portal-homework-instructions">{item.homework.instructions}</p>
            {(() => {
              const submission = visibleSubmissions.find((entry) => String(entry.homeworkId?._id || entry.homeworkId) === String(item.homework._id) && String(entry.studentId?._id || entry.studentId) === String(item.student?._id));
              return submission ? <div className="portal-submission-state">
                <strong>Your submission · {submission.status}</strong>
                <p>{submission.answer}</p>
                {submission.status === "reviewed" && <div className="portal-review-feedback">{submission.marksObtained !== null ? `Marks: ${submission.marksObtained}/${submission.maxMarks}. ` : ""}{submission.feedback || "Your teacher has reviewed this work."}</div>}
                <small>Submitted {formatDate(submission.submittedAt)}</small>
              </div> : !isParent ? <form className="portal-submit-form" onSubmit={async (event) => {
                event.preventDefault(); setSubmitting(item.homework._id); setError(""); setHomeworkNotice("");
                try {
                  await apiRequest(`/homework/${item.homework._id}/submissions`, { method: "POST", accessToken, body: { answer: answers[item.homework._id] || "" } });
                  const response = await apiRequest("/portal/homework-submissions", { accessToken });
                  setSubmissions(response.data || []); setHomeworkNotice("Your homework has been submitted.");
                } catch (err) { setError(err.message || "Unable to submit homework."); }
                finally { setSubmitting(""); }
              }}>
                <label htmlFor={`answer-${item.homework._id}`}>Your answer</label>
                <textarea id={`answer-${item.homework._id}`} required maxLength="10000" rows="4" value={answers[item.homework._id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.homework._id]: event.target.value }))} placeholder="Write your answer here…" />
                <button type="submit" disabled={submitting === item.homework._id}>{submitting === item.homework._id ? "Submitting…" : "Submit homework"}</button>
              </form> : <p className="portal-homework-student">No submission recorded yet.</p>;
            })()}
            <footer>Assigned {formatDate(item.homework.assignedDate)} · {item.homework.teacherId ? `By ${[item.homework.teacherId.firstName, item.homework.teacherId.lastName].filter(Boolean).join(" ")}` : "School assignment"}</footer>
          </article>)}</div>
          </>
        )
      ) : <>


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
                <div><span>Academic year</span><strong>{item.examination.academicYear?.name || "—"}</strong></div>
                <div><span>Class</span><strong>{item.examination.class?.name || "—"}</strong></div>
                <div><span>Section</span><strong>{item.examination.section?.name || "All sections"}</strong></div>
                <div><span>Examination period</span><strong>{formatDate(item.examination.startDate)} – {formatDate(item.examination.endDate)}</strong></div>
              </div>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr><th>Subject</th><th>Maximum</th><th>Pass mark</th><th>Marks obtained</th><th>Status</th><th>Remarks</th></tr></thead>
                  <tbody>
                    {item.result.subjects.map((subject) => (
                      <tr key={String(subject.examSubjectId)}>
                        <td>{subject.subject?.name || "Subject"}</td>
                        <td>{subject.maxMarks}</td>
                        <td>{subject.passMarks}</td>
                        <td>{subject.absent ? "Absent" : subject.marksObtained ?? "—"}</td>
                        <td><span className={"result-status status-" + subject.status}>{subject.status}</span></td>
                        <td>{subject.remarks || "—"}</td>
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
