import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { chunkRecords } from "../lib/examinationMarks.js";
import { useAuth } from "../context/authContext.js";

const id = (value) => String(value?._id || value || "");
const display = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(" ");

export default function TeacherExaminations() {
  const { accessToken } = useAuth();
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [roster, setRoster] = useState(null);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/examinations", { accessToken, signal: controller.signal })
      .then((result) => {
        if (!result?.success) throw new Error("Unable to load examinations");
        const list = result.data || [];
        if (!controller.signal.aborted) { setExams(list); setExamId(list[0]?._id || ""); }
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!examId) { setRoster(null); return undefined; }
      setLoading(true); setRoster(null); setMarks({}); setError(""); setNotice("");
      return Promise.all([
      apiRequest(`/examinations/${examId}/teacher-roster`, { accessToken, signal: controller.signal }),
      apiRequest(`/examinations/${examId}/marks`, { accessToken, signal: controller.signal }),
    ]).then(([rosterResponse, marksResponse]) => {
      if (!rosterResponse?.success || !marksResponse?.success) throw new Error("Unable to load examination marks");
      if (controller.signal.aborted) return;
      setRoster(rosterResponse.data);
      const saved = {};
      (marksResponse.data || []).forEach((item) => {
        saved[`${id(item.enrollmentId)}:${id(item.examSubjectId)}`] = {
          score: item.absent ? "" : String(item.marksObtained ?? ""),
          absent: Boolean(item.absent),
        };
      });
      setMarks(saved);
      }).catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [accessToken, examId]);

  const selected = exams.find((exam) => exam._id === examId);
  const editable = ["scheduled", "in_progress", "completed"].includes(selected?.status);
  const allowed = (enrollment, subject) => roster?.assignments?.some((assignment) =>
    assignment.subjectId === id(subject.subjectId) &&
    (!assignment.sectionId || assignment.sectionId === id(enrollment.sectionId)));
  const setEntry = (key, change) => setMarks((current) => ({
    ...current, [key]: { score: "", absent: false, ...current[key], ...change },
  }));
  const save = async () => {
    const records = [];
    for (const enrollment of roster?.enrollments || []) {
      for (const subject of roster?.subjects || []) {
        if (!allowed(enrollment, subject)) continue;
        const entry = marks[`${enrollment._id}:${subject._id}`];
        if (!entry || (!entry.absent && entry.score === "")) continue;
        if (!entry.absent && (!Number.isFinite(Number(entry.score)) || Number(entry.score) < 0 || Number(entry.score) > subject.maxMarks)) {
          setError(`Marks must be between 0 and ${subject.maxMarks} for ${subject.subjectId?.name}.`); return;
        }
        records.push({ enrollmentId: enrollment._id, examSubjectId: subject._id,
          absent: Boolean(entry.absent), marksObtained: entry.absent ? null : Number(entry.score) });
      }
    }
    if (!records.length) { setError("Enter at least one mark or mark a student absent."); return; }
    setSaving(true); setError(""); setNotice("");
    let savedCount = 0;
    try {
      const batches = chunkRecords(records);
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const response = await apiRequest(`/examinations/${examId}/marks`, {
          accessToken, method: "POST", body: { marks: batch },
        });
        if (!response?.success) throw new Error("The server did not confirm this marks batch.");
        savedCount += Number.isFinite(response.count) ? response.count : batch.length;
      }
      setNotice(`Saved all ${savedCount} mark records in ${batches.length} batch${batches.length === 1 ? "" : "es"}.`);
    } catch (err) {
      const message = err.message || "Unable to save marks";
      setError(savedCount
        ? `Saved ${savedCount} of ${records.length} records. Remaining batches were stopped; review the saved marks and retry. ${message}`
        : message);
    } finally { setSaving(false); }
  };

  return <section className="teacher-exams">
    <h2>Examination marks</h2>
    <p>Enter marks only for your assigned subjects and students. Result publication remains with school administration.</p>
    {error && <p role="alert" className="teacher-timetable-error">{error}</p>}
    {notice && <p role="status" className="teacher-workspace-notice">{notice}</p>}
    <label>Examination <select value={examId} onChange={(event) => setExamId(event.target.value)}>
      <option value="">Select examination</option>
      {exams.map((exam) => <option key={exam._id} value={exam._id}>{exam.name} — {exam.status}</option>)}
    </select></label>
    {loading ? <p>Loading examinations…</p> : !selected ? <p>No assigned examinations available.</p> :
      !roster ? <p>Examination roster unavailable.</p> : <>
        {!editable && <p>This examination is {selected.status}; marks cannot be edited.</p>}
        <div className="teacher-exams-table"><table><thead><tr><th>Student</th>
          {roster.subjects.map((subject) => <th key={subject._id}>{subject.subjectId?.name} (/{subject.maxMarks})</th>)}
        </tr></thead><tbody>{roster.enrollments.map((enrollment) => <tr key={enrollment._id}>
          <td>{display(enrollment.studentId)} <small>{enrollment.studentId?.admissionNumber}</small></td>
          {roster.subjects.map((subject) => {
            const key = `${enrollment._id}:${subject._id}`;
            const permitted = allowed(enrollment, subject);
            const entry = marks[key] || { score: "", absent: false };
            return <td key={subject._id}>{permitted ? <div className="teacher-exams-mark">
              <input aria-label={`Marks for ${display(enrollment.studentId)} in ${subject.subjectId?.name}`}
                type="number" min="0" max={subject.maxMarks} step="0.5"
                disabled={!editable || entry.absent} value={entry.score}
                onChange={(event) => setEntry(key, { score: event.target.value })} />
              <label><input type="checkbox" checked={entry.absent} disabled={!editable}
                onChange={(event) => setEntry(key, { absent: event.target.checked, score: "" })} />Absent</label>
            </div> : "—"}</td>;
          })}
        </tr>)}</tbody></table></div>
        {editable && <button type="button" disabled={saving || !roster.enrollments.length} onClick={() => void save()}>
          {saving ? "Saving…" : "Save marks"}
        </button>}
      </>}
  </section>;
}
