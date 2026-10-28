import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./EnrollmentsManagement.css";

const canWriteRole = (role) => ["school_admin", "principal"].includes(String(role || "").toLowerCase());
const displayName = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Student";
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const enrollmentEndCopy = {
  completed: {
    title: "Mark this enrollment as completed?",
    description: "The student’s completed placement will remain in their enrollment history.",
  },
  transferred: {
    title: "Mark this enrollment as transferred?",
    description: "The transfer will remain in the student’s history. You can create a new placement afterward.",
  },
  withdrawn: {
    title: "Withdraw this student from the enrollment?",
    description: "The withdrawn placement will remain in the student’s enrollment history.",
  },
};

export default function EnrollmentsManagement() {
  const { accessToken, user } = useAuth();
  const canManage = canWriteRole(user?.role);
  const [years, setYears] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [enrollments, setEnrollments] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState(null);
  const [endingEnrollment, setEndingEnrollment] = useState(false);
  const endingEnrollmentRef = useRef(false);

  const loadSetup = useCallback(async (signal) => {
    setLoadingSetup(true);
    try {
      const [yearResponse, studentResponse] = await Promise.all([
        apiRequest("/academic-years", { accessToken, signal }),
        apiRequest("/students?limit=100", { accessToken, signal }),
      ]);
      if (!yearResponse?.success || !Array.isArray(yearResponse.data)) throw new Error("Unable to load academic years.");
      if (!studentResponse?.success || !Array.isArray(studentResponse.data)) throw new Error("Unable to load students.");
      setYears(yearResponse.data);
      setStudents(studentResponse.data);
      setSelectedYearId((current) => current && yearResponse.data.some((year) => year._id === current)
        ? current
        : (yearResponse.data.find((year) => year.status === "active") || yearResponse.data[0])?._id || "");
      setSelectedStudentId((current) => current && studentResponse.data.some((student) => student._id === current)
        ? current
        : studentResponse.data.find((student) => student.status === "active")?._id || "");
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "Unable to load enrollment setup.");
    } finally {
      if (!signal?.aborted) setLoadingSetup(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadSetup(controller.signal));
    return () => controller.abort();
  }, [loadSetup]);

  const loadClasses = useCallback(async (signal) => {
    if (!selectedYearId) {
      setClasses([]);
      setSelectedClassId("");
      setLoadingClasses(false);
      return;
    }
    setLoadingClasses(true);
    try {
      const response = await apiRequest(`/classes?academicYearId=${encodeURIComponent(selectedYearId)}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load classes.");
      const available = response.data;
      setClasses(available);
      setSelectedClassId((current) => current && available.some((item) => item._id === current)
        ? current
        : available.find((item) => item.status === "active")?._id || "");
      setSelectedSectionId("");
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") {
        setClasses([]);
        setSelectedClassId("");
        setError(err.message || "Unable to load classes.");
      }
    } finally {
      if (!signal?.aborted) setLoadingClasses(false);
    }
  }, [accessToken, selectedYearId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadClasses(controller.signal));
    return () => controller.abort();
  }, [loadClasses]);

  const loadSections = useCallback(async (signal) => {
    if (!selectedClassId) {
      setSections([]);
      setSelectedSectionId("");
      setLoadingSections(false);
      return;
    }
    setLoadingSections(true);
    try {
      const response = await apiRequest(`/sections?classId=${encodeURIComponent(selectedClassId)}&status=active`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load sections.");
      setSections(response.data);
      setSelectedSectionId((current) => current && response.data.some((item) => item._id === current) ? current : "");
    } catch (err) {
      if (err.name !== "AbortError") {
        setSections([]);
        setError(err.message || "Unable to load sections.");
      }
    } finally {
      if (!signal?.aborted) setLoadingSections(false);
    }
  }, [accessToken, selectedClassId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadSections(controller.signal));
    return () => controller.abort();
  }, [loadSections]);

  const loadEnrollments = useCallback(async (signal) => {
    if (!selectedYearId) {
      setEnrollments([]);
      setLoadingEnrollments(false);
      return;
    }
    setLoadingEnrollments(true);
    try {
      const response = await apiRequest(`/enrollments?academicYearId=${encodeURIComponent(selectedYearId)}`, { accessToken, signal });
      if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load enrollments.");
      setEnrollments(response.data);
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") {
        setEnrollments([]);
        setError(err.message || "Unable to load enrollments.");
      }
    } finally {
      if (!signal?.aborted) setLoadingEnrollments(false);
    }
  }, [accessToken, selectedYearId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => controller.signal.aborted ? undefined : loadEnrollments(controller.signal));
    return () => controller.abort();
  }, [loadEnrollments]);

  const selectedYear = years.find((year) => year._id === selectedYearId) || null;
  const canCreate = canManage && selectedYear?.status === "active" && Boolean(selectedClassId) && students.some((student) => student._id === selectedStudentId && student.status === "active");

  const createEnrollment = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest("/enrollments", {
        method: "POST",
        accessToken,
        body: {
          studentId: selectedStudentId,
          academicYearId: selectedYearId,
          classId: selectedClassId,
          sectionId: selectedSectionId || null,
        },
      });
      if (!response?.success || !response.data) throw new Error("Unable to create enrollment.");
      setNotice("Student enrolled successfully.");
      setFormOpen(false);
      await loadEnrollments();
    } catch (err) {
      setError(err.message || "Unable to create enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const confirmEndEnrollment = async () => {
    if (!pendingEnrollment || endingEnrollmentRef.current) return;
    endingEnrollmentRef.current = true;
    setEndingEnrollment(true);
    const { enrollment, status } = pendingEnrollment;
    setError("");
    setNotice("");
    try {
      const response = await apiRequest(`/enrollments/${enrollment._id}`, {
        method: "PATCH", accessToken, body: { status },
      });
      if (!response?.success) throw new Error("Unable to update enrollment.");
      setNotice(`Enrollment marked as ${status}.`);
      setPendingEnrollment(null);
      await loadEnrollments();
    } catch (err) {
      setError(err.message || "Unable to update enrollment.");
      setPendingEnrollment(null);
    } finally {
      endingEnrollmentRef.current = false;
      setEndingEnrollment(false);
    }
  };

  return <section className="enrollments-page" aria-labelledby="enrollments-title">
    <div className="enrollments-intro">
      <div><p className="enrollments-eyebrow">STUDENT ACADEMIC PLACEMENT</p><h2 id="enrollments-title">Enrollments</h2><p>Place students in a class and optional section without changing their personal student record.</p></div>
      {canManage && selectedYear?.status === "active" && <button className="enrollment-button primary" type="button" onClick={() => { setError(""); setFormOpen((open) => !open); }}>{formOpen ? "Cancel enrollment" : "+ Enroll student"}</button>}
    </div>

    <div className="enrollments-toolbar">
      <label>Academic year<select value={selectedYearId} onChange={(event) => { setSelectedYearId(event.target.value); setFormOpen(false); setError(""); setNotice(""); }} disabled={loadingSetup || years.length === 0}>
        {years.length === 0 && <option value="">No academic years available</option>}
        {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.status === "active" ? " · Active" : year.status === "closed" ? " · Closed" : ""}</option>)}
      </select></label>
      {selectedYear && <div className="enrollment-year-summary"><strong>{selectedYear.name}</strong><span className={`enrollment-status status-${selectedYear.status}`}>{selectedYear.status}</span></div>}
    </div>

    {notice && <p className="enrollment-notice" role="status">{notice}</p>}
    {error && <div className="enrollment-error-banner" role="alert"><span>{error}</span><button type="button" className="enrollment-button secondary" onClick={() => { setError(""); void loadSetup(); void loadClasses(); void loadEnrollments(); }}>Refresh data</button></div>}

    {formOpen && <form className="enrollment-form" onSubmit={createEnrollment}>
      <div><h3>Enroll a student</h3><p>New enrollments can only be created for the active academic year.</p></div>
      <label>Student<select required value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} disabled={loadingSetup || students.filter((student) => student.status === "active").length === 0}>
        <option value="">Select student</option>{students.filter((student) => student.status === "active").map((student) => <option key={student._id} value={student._id}>{displayName(student)} · {student.admissionNumber}</option>)}
      </select></label>
      <label>Class<select required value={selectedClassId} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedSectionId(""); }} disabled={loadingClasses || !classes.some((item) => item.status === "active")}>
        <option value="">Select class</option>{classes.filter((item) => item.status === "active").map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
      </select></label>
      <label>Section (optional)<select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)} disabled={loadingSections || !selectedClassId}>
        <option value="">No section</option>{sections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
      </select></label>
      {!students.some((student) => student.status === "active") && <p className="enrollment-error" role="alert">Create an active student record before enrolling.</p>}
      {selectedYear?.status !== "active" && <p className="enrollment-info">Select the active academic year to create an enrollment.</p>}
      <div className="enrollment-form-actions"><button className="enrollment-button secondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="enrollment-button primary" type="submit" disabled={saving || !canCreate}>{saving ? "Saving…" : "Create enrollment"}</button></div>
    </form>}

    {pendingEnrollment && <div className="enrollment-confirm" role="alertdialog" aria-labelledby="enrollment-confirm-title">
      <div><h3 id="enrollment-confirm-title">{enrollmentEndCopy[pendingEnrollment.status].title}</h3><p>{enrollmentEndCopy[pendingEnrollment.status].description}</p></div>
      <div className="enrollment-form-actions"><button type="button" className="enrollment-button secondary" onClick={() => setPendingEnrollment(null)} disabled={endingEnrollment}>Cancel</button><button type="button" className="enrollment-button primary" onClick={() => void confirmEndEnrollment()} disabled={endingEnrollment}>{endingEnrollment ? "Updating…" : "Confirm"}</button></div>
    </div>}

    <div className="enrollments-list">
      {loadingSetup ? <p className="enrollments-empty" role="status">Loading students and academic years…</p>
        : !selectedYear ? <div className="enrollments-empty"><h3>No academic years available</h3><p>Create an academic year before managing enrollments.</p></div>
          : loadingEnrollments ? <p className="enrollments-empty" role="status">Loading enrollment history…</p>
            : enrollments.length === 0 && !error ? <div className="enrollments-empty"><h3>No enrollments for {selectedYear.name}</h3><p>{selectedYear.status === "active" && canManage ? "Enroll a student to assign their current class and section." : "No enrollment history exists for this academic year."}</p></div>
              : <div className="enrollments-table-wrap"><table className="enrollments-table"><thead><tr><th>Student</th><th>Admission no.</th><th>Class</th><th>Section</th><th>Enrolled on</th><th>Status</th>{canManage && <th>Actions</th>}</tr></thead><tbody>
                {enrollments.map((item) => <tr key={item._id}>
                  <td><strong>{displayName(item.studentId)}</strong></td><td>{item.studentId?.admissionNumber || "—"}</td><td>{item.classId?.name || "—"}</td><td>{item.sectionId?.name || "—"}</td><td>{formatDate(item.enrollmentDate)}</td>
                  <td><span className={`enrollment-status status-${item.status}`}>{item.status}</span></td>
                  {canManage && <td>{item.status === "active" ? <div className="enrollment-row-actions">
                    <button type="button" className="enrollment-text-button" onClick={() => setPendingEnrollment({ enrollment: item, status: "completed" })}>Complete</button>
                    <button type="button" className="enrollment-text-button" onClick={() => setPendingEnrollment({ enrollment: item, status: "transferred" })}>Transfer</button>
                    <button type="button" className="enrollment-text-button danger" onClick={() => setPendingEnrollment({ enrollment: item, status: "withdrawn" })}>Withdraw</button>
                  </div> : <span>—</span>}</td>}
                </tr>)}
              </tbody></table></div>}
    </div>
    <div className="enrollments-footer"><span>{enrollments.length} enrollment {enrollments.length === 1 ? "record" : "records"}</span>{!canManage && <span>You have read-only access to enrollments.</span>}</div>
  </section>;
}
