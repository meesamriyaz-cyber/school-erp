import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { chunkRecords } from "../lib/examinationMarks.js";
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
  const [changeReason, setChangeReason] = useState("");
  const [results, setResults] = useState(null);
  const [resultSummary, setResultSummary] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
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
    Promise.resolve().then(() => loadSetup(controller.signal)).catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load setup.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadSetup]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!examForm.academicYearId) { setClasses([]); return undefined; }
      return apiRequest(`/classes?academicYearId=${encodeURIComponent(examForm.academicYearId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => {
        setClasses(response.data || []);
        setExamForm((current) => ({ ...current, classId: current.classId && response.data?.some((item) => item._id === current.classId) ? current.classId : response.data?.[0]?._id || "", sectionId: "" }));
      }).catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load classes.")); });
    });
    return () => controller.abort();
  }, [accessToken, examForm.academicYearId]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!examForm.classId) { setSections([]); return undefined; }
      return apiRequest(`/sections?classId=${encodeURIComponent(examForm.classId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => setSections(response.data || []))
      .catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load sections.")); });
    });
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
    Promise.resolve().then(() => loadExams(controller.signal)).catch((err) => { if (err.name !== "AbortError") setError(errorMessage(err, "Unable to load examinations.")); });
    return () => controller.abort();
  }, [loadExams]);

  const loadExam = useCallback(async (id) => {
    if (!id) { setSelectedExam(null); setEnrollments([]); setResults(null); setResultSummary(null); setAuditHistory([]); return; }
    const response = await apiRequest(`/examinations/${id}`, { accessToken });
    if (!response?.success) throw new Error("Unable to load examination details.");
    setSelectedExam(response.data);
    const roster = await apiRequest(`/enrollments?academicYearId=${response.data.academicYearId?._id || response.data.academicYearId}&classId=${response.data.classId?._id || response.data.classId}${response.data.sectionId ? `&sectionId=${response.data.sectionId._id || response.data.sectionId}` : ""}&status=active`, { accessToken });
    setEnrollments(roster.data || []);
    const [markResponse, resultResponse, auditResponse] = await Promise.all([
      apiRequest(`/examinations/${id}/marks`, { accessToken }),
      ["completed", "published"].includes(response.data.status)
        ? apiRequest(`/examinations/${id}/results`, { accessToken })
        : Promise.resolve(null),
      apiRequest(`/examinations/${id}/marks/audit?limit=50`, { accessToken })
        .catch(() => ({ success: false, data: [] })),
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
    setResultSummary(resultResponse?.summary || null);
    setAuditHistory(auditResponse?.success ? auditResponse.data || [] : []);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (selectedId) return loadExam(selectedId).catch((err) => { if (!cancelled) setError(errorMessage(err, "Unable to load examination.")); });
      setSelectedExam(null); setEnrollments([]); setResults(null); setResultSummary(null);
      return undefined;
    });
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
        if (!entry || (!entry.absent && (entry.score === "" || entry.score === undefined))) continue;
        records.push({ examSubjectId: subject._id, enrollmentId: enrollment._id, absent: Boolean(entry.absent), marksObtained: entry.absent ? null : Number(entry.score) });
      }
    }
    if (!records.length) {
      setError("Enter marks or mark a student absent before saving.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    let savedCount = 0;
    let allBatchesSaved = false;
    try {
      const batches = chunkRecords(records);
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        setNotice(`Saving batch ${index + 1} of ${batches.length}…`);
        const response = await apiRequest(`/examinations/${selectedExam._id}/marks`, {
          method: "POST", accessToken, body: { marks: batch, changeReason },
        });
        if (!response?.success) throw new Error("The server did not confirm this marks batch.");
        savedCount += Number.isFinite(response.count) ? response.count : batch.length;
        setNotice(`Saved ${savedCount} of ${records.length} records…`);
      }
      allBatchesSaved = true;
      await loadExam(selectedExam._id);
      setNotice(`Saved all ${savedCount} student-subject mark record${savedCount === 1 ? "" : "s"} in ${batches.length} batch${batches.length === 1 ? "" : "es"}.`);
    } catch (err) {
      const message = errorMessage(err, "Unable to save marks.");
      setError(allBatchesSaved
        ? `All ${savedCount} records were saved, but the examination view could not be refreshed. ${message}`
        : savedCount
          ? `Saved ${savedCount} of ${records.length} records. Remaining batches were stopped; review the saved marks and retry. ${message}`
          : message);
    } finally { setSaving(false); }
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
  const canConfigure = selectedExam?.status === "draft";
  const canEnterMarks = selectedExam && ["scheduled", "in_progress", "completed"].includes(selectedExam.status);
  const marksProgress = useMemo(() => {
    const total = enrollments.length * (selectedExam?.subjects?.length || 0);
    let entered = 0;
    for (const enrollment of enrollments) {
      for (const subject of selectedExam?.subjects || []) {
        const entry = marks[`${enrollment._id}:${subject._id}`];
        if (entry && (entry.absent || (entry.score !== "" && entry.score !== undefined && entry.score !== null))) entered += 1;
      }
    }
    return { entered, total, remaining: Math.max(0, total - entered) };
  }, [enrollments, marks, selectedExam?.subjects]);


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
          {selectedExam.subjects?.length > 0 && <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Marks entry</h3><p>{enrollments.length} active students · {marksProgress.entered} of {marksProgress.total} student-subject records entered · {marksProgress.remaining} remaining</p></div></div>
            {canEnterMarks && enrollments.length ? <><div className="marks-table-wrap"><table className="marks-table"><thead><tr><th>Student</th>{selectedExam.subjects.map((subject) => <th key={subject._id}>{subject.subjectId?.name || "Subject"}<small> / {subject.maxMarks}</small></th>)}</tr></thead><tbody>{enrollments.map((enrollment) => <tr key={enrollment._id}><td><strong>{enrollment.studentId?.firstName} {enrollment.studentId?.lastName}</strong><small>{enrollment.studentId?.admissionNumber}</small></td>{selectedExam.subjects.map((subject) => { const key = `${enrollment._id}:${subject._id}`; const entry = marks[key] || { score: "", absent: false }; return <td key={subject._id}><input aria-label={`Marks for ${enrollment.studentId?.firstName} in ${subject.subjectId?.name}`} type="number" min="0" max={subject.maxMarks} disabled={entry.absent} value={entry.score} onChange={(e) => setMarks((v) => ({ ...v, [key]: { ...entry, score: e.target.value } }))} /><label className="mark-absent"><input type="checkbox" checked={entry.absent} onChange={(e) => setMarks((v) => ({ ...v, [key]: { ...entry, absent: e.target.checked, score: "" } }))} /> Absent</label></td>; })}</tr>)}</tbody></table></div><label className="mark-change-reason">Reason for corrections (required when changing a saved mark)<textarea maxLength={500} rows={2} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="e.g. Corrected after answer-sheet rechecking" /></label><button className="examination-primary" disabled={saving || !enrollments.length} onClick={() => void saveMarks()}>Save entered marks ({marksProgress.entered})</button></> : <p className="examinations-empty">{canEnterMarks ? "No active enrollments found in this class scope." : "Marks are locked after publication."}</p>}
          </article>}
          {results && <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Consolidated results</h3><p>{results.length} students · subject performance and class summary</p></div></div>
            {resultSummary && <div className="result-summary-grid">
              <div><span>Passed</span><strong>{resultSummary.passedCount ?? 0}</strong></div>
              <div><span>Failed</span><strong>{resultSummary.failedCount ?? 0}</strong></div>
              <div><span>Incomplete</span><strong>{resultSummary.incompleteCount ?? 0}</strong></div>
              <div><span>Average · complete only</span><strong>{resultSummary.averagePercentage === null || resultSummary.averagePercentage === undefined ? "—" : `${resultSummary.averagePercentage}%`}</strong></div>
              <div><span>Highest · complete only</span><strong>{resultSummary.highestPercentage === null || resultSummary.highestPercentage === undefined ? "—" : `${resultSummary.highestPercentage}%`}</strong></div>
              <div><span>Lowest · complete only</span><strong>{resultSummary.lowestPercentage === null || resultSummary.lowestPercentage === undefined ? "—" : `${resultSummary.lowestPercentage}%`}</strong></div>
            </div>}
            <div className="results-list">{results.map((result) => <div className="result-row result-row-detail" key={result.enrollmentId}>
              <span><strong>{result.student?.firstName} {result.student?.lastName}</strong><small>{result.student?.admissionNumber}</small></span>
              <strong>{result.totalObtained} / {result.totalMaximum} ({result.percentage}%)</strong><em>{result.status}</em>
              <details className="result-subject-details"><summary>Subject breakdown</summary>
                <div className="result-subject-list">{result.subjects.map((subject) => <div key={subject.examSubjectId}>
                  <span>{subject.subject?.name || "Subject"}</span>
                  <strong>{subject.absent ? "Absent" : subject.marksObtained ?? "Pending"} / {subject.maxMarks}</strong>
                  <em>{subject.status}</em>
                </div>)}</div>
              </details>
            </div>)}</div>
          </article>}
          <article className="examinations-card"><div className="examinations-card-heading"><div><h3>Marks audit history</h3><p>{auditHistory.length} recent mark events · administrators and principals only</p></div></div>{auditHistory.length ? <div className="results-list">{auditHistory.map((entry) => <div className="result-row" key={entry._id}><span><strong>{entry.studentId?.firstName} {entry.studentId?.lastName} · {entry.examSubjectId?.subjectId?.name || "Subject"}</strong><small>{entry.action === "created" ? "Initial entry" : "Correction"} · {entry.changedBy?.firstName} {entry.changedBy?.lastName} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}</small><small>{entry.previous ? `Previous: ${entry.previous.absent ? "Absent" : entry.previous.marksObtained} → ` : ""}Current: {entry.current.absent ? "Absent" : entry.current.marksObtained}</small>{entry.changeReason && <small>Reason: {entry.changeReason}</small>}</span></div>)}</div> : <p className="examinations-empty">No mark changes have been recorded yet.</p>}</article>
        </>}
      </aside>
    </div>
  </section>;
}
