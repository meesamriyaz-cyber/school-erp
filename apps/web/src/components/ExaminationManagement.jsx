import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./ExaminationManagement.css";

const today = () => new Date().toISOString().slice(0, 10);
const emptyExam = () => ({ name: "", academicYearId: "", classId: "", sectionId: "", startDate: today(), endDate: today() });
const errorMessage = (error, fallback) => error?.message || fallback;

export default function ExaminationManagement() {
  const { accessToken } = useAuth();
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedExam, setSelectedExam] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [marks, setMarks] = useState({});
  const [results, setResults] = useState(null);
  const [examForm, setExamForm] = useState(emptyExam);
  const [subjectForm, setSubjectForm] = useState({ subjectId: "", examDate: today(), startTime: "", endTime: "", maxMarks: "100", passMarks: "35", durationMinutes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSetup = useCallback(async (signal) => {
    const [yearResponse, subjectResponse] = await Promise.all([
      apiRequest("/academic-years", { accessToken, signal }),
      apiRequest("/subjects?status=active", { accessToken, signal }),
    ]);
    if (!yearResponse?.success || !subjectResponse?.success) throw new Error("Unable to load academic setup.");
    setYears(yearResponse.data || []);
    setSubjects(subjectResponse.data || []);
    const activeYear = (yearResponse.data || []).find((item) => item.status === "active") || yearResponse.data?.[0];
    if (activeYear) setExamForm((current) => ({ ...current, academicYearId: current.academicYearId || activeYear._id }));
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    loadSetup(controller.signal).catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load setup.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadSetup]);

  useEffect(() => {
    if (!examForm.academicYearId) { setClasses([]); return; }
    const controller = new AbortController();
    apiRequest(`/classes?academicYearId=${encodeURIComponent(examForm.academicYearId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => {
        setClasses(response.data || []);
        setExamForm((current) => ({ ...current, classId: current.classId && response.data?.some((item) => item._id === current.classId) ? current.classId : response.data?.[0]?._id || "", sectionId: "" }));
      }).catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load classes.")); });
    return () => controller.abort();
  }, [accessToken, examForm.academicYearId]);

  useEffect(() => {
    if (!examForm.classId) { setSections([]); return; }
    const controller = new AbortController();
    apiRequest(`/sections?classId=${encodeURIComponent(examForm.classId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => setSections(response.data || []))
      .catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load sections.")); });
    return () => controller.abort();
  }, [accessToken, examForm.classId]);

  const loadExams = useCallback(async (signal) => {
    const response = await apiRequest("/examinations", { accessToken, signal });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load examinations.");
    setExams(response.data);
    if (selectedId && !response.data.some((item) => item._id === selectedId)) setSelectedId("");
  }, [accessToken, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    loadExams(controller.signal).catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load examinations.")); });
    return () => controller.abort();
  }, [loadExams]);

  const loadExam = useCallback(async (id) => {
    if (!id) { setSelectedExam(null); setEnrollments([]); setResults(null); return; }
    const response = await apiRequest(`/examinations/${id}`, { accessToken });
    if (!response?.success) throw new Error("Unable to load examination details.");
    setSelectedExam(response.data);
    const roster = await apiRequest(`/enrollments?academicYearId=${response.data.academicYearId?._id || response.data.academicYearId}&classId=${response.data.classId?._id || response.data.classId}${response.data.sectionId ? `&sectionId=${response.data.sectionId._id || response.data.sectionId}` : ""}&status=active`, { accessToken });
    setEnrollments(roster.data || []);
    const [markResponse, resultResponse] = await Promise.all([
      apiRequest(`/examinations/${id}/marks`, { accessToken }),
      ["completed", "published"].includes(response.data.status)
        ? apiRequest(`/examinations/${id}/results`, { accessToken })
        : Promise.resolve(null),
    ]);
    const savedMarks = {};
    for (const mark of markResponse.data || []) {
      const subjectId = mark.examSubjectId?._id || mark.examSubjectId;
      savedMarks[`${mark.enrollmentId}:${subjectId}`] = {
        score: mark.absent ? "" : String(mark.marksObtained ?? ""),
        absent: Boolean(mark.absent),
      };
    }
    setMarks(savedMarks);
    setResults(resultResponse?.data || null);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    if (selectedId) loadExam(selectedId).catch((err) => { if (!cancelled) setError(errorMessage(err, "Unable to load examination.")); });
    else { setSelectedExam(null); setEnrollments([]); setResults(null); }
    return () => { cancelled = true; };
  }, [selectedId, loadExam]);

  const createExam = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/examinations", { method: "POST", accessToken, body: { ...examForm, sectionId: examForm.sectionId || null } });
      setNotice("Examination created. Configure its subjects to continue.");
      await loadExams();
      setSelectedId(response.data._id);
      setExamForm((current) => ({ ...current, name: "" }));
    } catch (err) { setError(errorMessage(err, "Unable to create examination.")); }
    finally { setSaving(false); }
  };

  const addSubject = async (event) => {
    event.preventDefault(); if (!selectedExam) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/examinations/${selectedExam._id}/subjects`, { method: "POST", accessToken, body: { ...subjectForm, maxMarks: Number(subjectForm.maxMarks), passMarks: Number(subjectForm.passMarks), durationMinutes: subjectForm.durationMinutes ? Number(subjectForm.durationMinutes) : null } });
      await loadExam(selectedExam._id);
      setNotice("Subject added to the examination.");
    } catch (err) { setError(errorMessage(err, "Unable to add subject.")); }
    finally { setSaving(false); }
  };

  const changeStatus = async (status) => {
    if (!selectedExam) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/examinations/${selectedExam._id}/status`, { method: "PATCH", accessToken, body: { status } });
      await loadExams(); await loadExam(selectedExam._id);
      setNotice(`Examination moved to ${status.replaceAll("_", " ")}.`);
    } catch (err) { setError(errorMessage(err, "Unable to update examination status.")); }
    finally { setSaving(false); }
  };

  const saveMarks = async () => {
    if (!selectedExam?.subjects?.length || !enrollments.length) return;
    const records = [];
    for (const enrollment of enrollments) {
      for (const subject of selectedExam.subjects) {
        const key = `${enrollment._id}:${subject._id}`;
        const entry = marks[key];
        if (!entry || (!entry.absent && (entry.score === "" || entry.score === undefined))) {
          setError("Enter marks or mark each student absent for every subject before saving.");
          return;
        }
        records.push({ examSubjectId: subject._id, enrollmentId: enrollment._id, absent: Boolean(entry.absent), marksObtained: entry.absent ? null : Number(entry.score) });
      }
    }
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/examinations/${selectedExam._id}/marks`, { method: "POST", accessToken, body: { marks: records } });
      setNotice("Marks saved successfully.");
      await loadExam(selectedExam._id);
    } catch (err) { setError(errorMessage(err, "Unable to save marks.")); }
    finally { setSaving(false); }
  };

  const publishResults = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/examinations/${selectedExam._id}/publish`, { method: "POST", accessToken });
      await loadExams(); await loadExam(selectedExam._id);
      setNotice("Results published successfully.");
    } catch (err) { setError(errorMessage(err, "Unable to publish results.")); }
    finally { setSaving(false); }
  };

  const nextStatus = useMemo(() => ({ draft: "scheduled", scheduled: "in_progress", in_progress: "completed" }[selectedExam?.status] || null), [selectedExam?.status]);
  const canConfigure = selectedExam && !["completed", "published"].includes(selectedExam.status);
  const canEnterMarks = selectedExam && ["scheduled", "in_progress", "completed"].includes(selectedExam.status);

  return <section className="examinations-page" aria-labelledby="examinations-title">
    <div className="examinations-intro"><div><p className="examinations-eyebrow">ACADEMIC OPERATIONS</p><h2 id="examinations-title">Examinations & results</h2><p>Create examinations, configure subjects, enter marks and publish consolidated results.</p></div><span className="examinations-count">{exams.length} examinations</span></div>
    {notice && <p className="examinations-notice" role="status">{notice}</p>}
    {error && <p className="examinations-error" role="alert">{error}</p>}
    <div className="examinations-layout">
      <div className="examinations-main">
        <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Create examination</h3><p>Choose the academic year and class scope.</p></div></div>
          <form className="examinations-form" onSubmit={createExam}>
            <label>Examination name<input required maxLength={100} value={examForm.name} onChange={(e) => setExamForm((v) => ({ ...v, name: e.target.value }))} placeholder="e.g. Mid Term Examination" /></label>
            <label>Academic year<select required value={examForm.academicYearId} onChange={(e) => setExamForm((v) => ({ ...v, academicYearId: e.target.value }))}><option value="">Select year</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}</select></label>
            <label>Class<select required value={examForm.classId} onChange={(e) => setExamForm((v) => ({ ...v, classId: e.target.value }))}><option value="">Select class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
            <label>Section scope<select value={examForm.sectionId} onChange={(e) => setExamForm((v) => ({ ...v, sectionId: e.target.value }))}><option value="">All sections</option>{sections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
            <label>Start date<input type="date" required value={examForm.startDate} onChange={(e) => setExamForm((v) => ({ ...v, startDate: e.target.value }))} /></label>
            <label>End date<input type="date" required min={examForm.startDate} value={examForm.endDate} onChange={(e) => setExamForm((v) => ({ ...v, endDate: e.target.value }))} /></label>
            <div className="examinations-form-actions"><button className="examination-primary" disabled={saving || loading}>{saving ? "Saving…" : "Create examination"}</button></div>
          </form>
        </article>
        <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Examination register</h3><p>Select an examination to configure subjects and manage results.</p></div></div>
          {loading ? <p className="examinations-empty">Loading examinations…</p> : exams.length ? <div className="examinations-list">{exams.map((exam) => <button type="button" key={exam._id} className={selectedId === exam._id ? "examination-list-item selected" : "examination-list-item"} onClick={() => setSelectedId(exam._id)}><span><strong>{exam.name}</strong><small>{exam.classId?.name || "Class"} · {exam.academicYearId?.name || "Academic year"}{exam.sectionId?.name ? ` · Section ${exam.sectionId.name}` : " · All sections"}</small></span><em className={`exam-status status-${exam.status}`}>{exam.status.replaceAll("_", " ")}</em></button>)}</div> : <p className="examinations-empty">No examinations created yet.</p>}
        </article>
      </div>
      <aside className="examinations-detail">
        {!selectedExam ? <article className="examinations-card examinations-empty-state"><span>▤</span><h3>Select an examination</h3><p>Its subjects, mark entry and result workflow will appear here.</p></article> : <>
          <article className="examinations-card"><div className="examinations-card-heading"><div><h3>{selectedExam.name}</h3><p>{selectedExam.classId?.name} · {selectedExam.academicYearId?.name}</p></div><em className={`exam-status status-${selectedExam.status}`}>{selectedExam.status.replaceAll("_", " ")}</em></div>
            {nextStatus && <button className="examination-primary" disabled={saving || (nextStatus === "scheduled" && !selectedExam.subjects?.length)} onClick={() => void changeStatus(nextStatus)}>Move to {nextStatus.replaceAll("_", " ")}</button>}
            {selectedExam.status === "completed" && <button className="examination-primary" disabled={saving || !results?.length} onClick={() => void publishResults()}>Publish results</button>}
          </article>
          <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Exam subjects</h3><p>{selectedExam.subjects?.length || 0} configured</p></div></div>
            {selectedExam.subjects?.map((item) => <div className="exam-subject-row" key={item._id}><strong>{item.subjectId?.name || "Subject"}</strong><span>{item.maxMarks} marks · Pass {item.passMarks}</span></div>)}
            {canConfigure && <form className="examinations-form compact" onSubmit={addSubject}><label>Subject<select required value={subjectForm.subjectId} onChange={(e) => setSubjectForm((v) => ({ ...v, subjectId: e.target.value }))}><option value="">Select subject</option>{subjects.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label><label>Exam date<input type="date" required min={selectedExam.startDate?.slice(0,10)} max={selectedExam.endDate?.slice(0,10)} value={subjectForm.examDate} onChange={(e) => setSubjectForm((v) => ({ ...v, examDate: e.target.value }))} /></label><label>Start time<input type="time" value={subjectForm.startTime} onChange={(e) => setSubjectForm((v) => ({ ...v, startTime: e.target.value }))} /></label><label>End time<input type="time" value={subjectForm.endTime} onChange={(e) => setSubjectForm((v) => ({ ...v, endTime: e.target.value }))} /></label><label>Maximum marks<input type="number" min="1" required value={subjectForm.maxMarks} onChange={(e) => setSubjectForm((v) => ({ ...v, maxMarks: e.target.value }))} /></label><label>Passing marks<input type="number" min="0" required value={subjectForm.passMarks} onChange={(e) => setSubjectForm((v) => ({ ...v, passMarks: e.target.value }))} /></label><button className="examination-secondary" disabled={saving || !subjectForm.subjectId}>Add subject</button></form>}
          </article>
          {selectedExam.subjects?.length > 0 && <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Marks entry</h3><p>{enrollments.length} active students in this examination scope</p></div></div>
            {canEnterMarks && enrollments.length ? <><div className="marks-table-wrap"><table className="marks-table"><thead><tr><th>Student</th>{selectedExam.subjects.map((subject) => <th key={subject._id}>{subject.subjectId?.name || "Subject"}<small> / {subject.maxMarks}</small></th>)}</tr></thead><tbody>{enrollments.map((enrollment) => <tr key={enrollment._id}><td><strong>{enrollment.studentId?.firstName} {enrollment.studentId?.lastName}</strong><small>{enrollment.studentId?.admissionNumber}</small></td>{selectedExam.subjects.map((subject) => { const key = `${enrollment._id}:${subject._id}`; const entry = marks[key] || { score: "", absent: false }; return <td key={subject._id}><input aria-label={`Marks for ${enrollment.studentId?.firstName} in ${subject.subjectId?.name}`} type="number" min="0" max={subject.maxMarks} disabled={entry.absent} value={entry.score} onChange={(e) => setMarks((v) => ({ ...v, [key]: { ...entry, score: e.target.value } }))} /><label className="mark-absent"><input type="checkbox" checked={entry.absent} onChange={(e) => setMarks((v) => ({ ...v, [key]: { ...entry, absent: e.target.checked, score: "" } }))} /> Absent</label></td>; })}</tr>)}</tbody></table></div><button className="examination-primary" disabled={saving || !enrollments.length} onClick={() => void saveMarks()}>Save marks</button></> : <p className="examinations-empty">{canEnterMarks ? "No active enrollments found in this class scope." : "Marks are locked after publication."}</p>}
          </article>}
          {results && <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Consolidated results</h3><p>{results.length} students · result percentage and status</p></div></div><div className="results-list">{results.map((result) => <div className="result-row" key={result.enrollmentId}><span><strong>{result.student?.firstName} {result.student?.lastName}</strong><small>{result.student?.admissionNumber}</small></span><strong>{result.totalObtained} / {result.totalMaximum} ({result.percentage}%)</strong><em>{result.status}</em></div>)}</div></article>}
        </>}
      </aside>
    </div>
  </section>;
}
