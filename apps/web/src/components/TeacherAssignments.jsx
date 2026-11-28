import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./TeacherAssignments.css";

const emptyForm = { teacherId: "", subjectId: "", academicYearId: "", classId: "", sectionId: "" };
const labelName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Teacher";

export default function TeacherAssignments() {
  const { accessToken } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterYear, setFilterYear] = useState("");


  const loadAssignments = useCallback(async (signal) => {
    const params = new URLSearchParams();
    if (filterYear) params.set("academicYearId", filterYear);
    const response = await apiRequest(`/teacher-assignments?${params.toString()}`, { accessToken, signal });
    if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load teacher assignments.");
    setAssignments(response.data);
  }, [accessToken, filterYear]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError("");
      try {
        const [teacherResponse, subjectResponse, yearResponse, classResponse] = await Promise.all([
          apiRequest("/school/users?role=teacher&status=active&page=1&limit=100", { accessToken, signal: controller.signal }),
          apiRequest("/subjects?status=active", { accessToken, signal: controller.signal }),
          apiRequest("/academic-years", { accessToken, signal: controller.signal }),
          apiRequest("/classes?status=active", { accessToken, signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setTeachers(Array.isArray(teacherResponse?.data) ? teacherResponse.data : []);
        setSubjects(Array.isArray(subjectResponse?.data) ? subjectResponse.data : []);
        setYears(Array.isArray(yearResponse?.data) ? yearResponse.data.filter((year) => year.status !== "closed") : []);
        setClasses(Array.isArray(classResponse?.data) ? classResponse.data : []);
        await loadAssignments(controller.signal);
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load assignment data.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [accessToken, loadAssignments]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!form.classId) { setSections([]); return undefined; }
      return apiRequest(`/sections?classId=${encodeURIComponent(form.classId)}&status=active`, { accessToken, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setSections(Array.isArray(response?.data) ? response.data : []); })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load sections."); });
    });
    return () => controller.abort();
  }, [accessToken, form.classId]);

  const visibleClasses = useMemo(() => classes.filter((item) => !form.academicYearId || String(item.academicYearId) === String(form.academicYearId)), [classes, form.academicYearId]);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...form };
      if (!payload.sectionId) delete payload.sectionId;
      const response = await apiRequest("/teacher-assignments", { method: "POST", accessToken, body: payload });
      if (!response?.success) throw new Error(response?.message || "Unable to create assignment.");
      setNotice("Teacher assignment created successfully.");
      setForm(emptyForm); setShowForm(false);
      await loadAssignments();
    } catch (err) { setError(err.message || "Unable to create assignment."); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (assignment) => {
    setError(""); setNotice("");
    try {
      const response = await apiRequest(`/teacher-assignments/${assignment._id}`, {
        method: "PATCH", accessToken,
        body: { status: assignment.status === "active" ? "inactive" : "active" },
      });
      if (!response?.success) throw new Error(response?.message || "Unable to update assignment.");
      setNotice("Assignment status updated.");
      await loadAssignments();
    } catch (err) { setError(err.message || "Unable to update assignment."); }
  };

  return <section className="teacher-assignments" aria-labelledby="teacher-assignments-title">
    <div className="teacher-assignment-heading"><div><p className="teacher-assignment-eyebrow">ACADEMIC OPERATIONS</p><h2 id="teacher-assignments-title">Teacher–Subject Assignments</h2><p>Assign active teachers to subjects, classes and optional sections for an academic year.</p></div>
      <button type="button" className="teacher-assignment-primary" onClick={() => setShowForm((value) => !value)}>{showForm ? "Cancel" : "+ New assignment"}</button>
    </div>
    {notice && <p className="teacher-assignment-notice" role="status">{notice}</p>}
    {error && <p className="teacher-assignment-error" role="alert">{error}</p>}
    {showForm && <form className="teacher-assignment-form" onSubmit={submit}>
      <h3>New teaching assignment</h3>
      <div className="teacher-assignment-grid">
        <label>Academic year<select required value={form.academicYearId} onChange={(e) => setForm((v) => ({ ...v, academicYearId: e.target.value, classId: "", sectionId: "" }))}><option value="">Select academic year</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name} {year.status === "active" ? "(Active)" : ""}</option>)}</select></label>
        <label>Teacher<select required value={form.teacherId} onChange={(e) => setForm((v) => ({ ...v, teacherId: e.target.value }))}><option value="">Select teacher</option>{teachers.map((teacher) => <option key={teacher.id || teacher._id} value={teacher.id || teacher._id}>{labelName(teacher)}</option>)}</select></label>
        <label>Subject<select required value={form.subjectId} onChange={(e) => setForm((v) => ({ ...v, subjectId: e.target.value }))}><option value="">Select subject</option>{subjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}{subject.code ? ` (${subject.code})` : ""}</option>)}</select></label>
        <label>Class<select required value={form.classId} onChange={(e) => setForm((v) => ({ ...v, classId: e.target.value, sectionId: "" }))}><option value="">Select class</option>{visibleClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>Section (optional)<select value={form.sectionId} onChange={(e) => setForm((v) => ({ ...v, sectionId: e.target.value }))}><option value="">All sections / class-wide</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
      </div>
      <div className="teacher-assignment-form-actions"><button type="submit" className="teacher-assignment-primary" disabled={saving || !form.academicYearId || !form.teacherId || !form.subjectId || !form.classId}>{saving ? "Saving…" : "Create assignment"}</button></div>
    </form>}
    <div className="teacher-assignment-list-toolbar"><h3>Current assignments</h3><label>Academic year<select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}><option value="">All years</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}</select></label></div>
    <div className="teacher-assignment-table-wrap"><table className="teacher-assignment-table"><thead><tr><th>Teacher</th><th>Subject</th><th>Academic year</th><th>Class / Section</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="6">Loading assignments…</td></tr> : assignments.length ? assignments.map((item) => <tr key={item._id}>
        <td><strong>{labelName(item.teacherId)}</strong><small>{item.teacherId?.email || ""}</small></td><td>{item.subjectId?.name || "—"}{item.subjectId?.code ? <small>{item.subjectId.code}</small> : null}</td><td>{item.academicYearId?.name || "—"}</td><td>{item.classId?.name || "—"}{item.sectionId?.name ? <small>Section {item.sectionId.name}</small> : <small>All sections</small>}</td><td><span className={`teacher-assignment-status status-${item.status}`}>{item.status}</span></td><td><button type="button" className="teacher-assignment-action" onClick={() => void toggleStatus(item)}>{item.status === "active" ? "Deactivate" : "Activate"}</button></td>
      </tr>) : <tr><td colSpan="6">No teacher assignments found.</td></tr>}
    </tbody></table></div>
    <p className="teacher-assignment-footnote">Only active teacher accounts, subjects, classes and non-closed academic years can be assigned.</p>
  </section>;
}
