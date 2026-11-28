import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./AttendanceReports.css";

const today = () => new Date().toISOString().slice(0, 10);
const monthLabel = (value) => new Date(value + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const percent = (value) => value === null || value === undefined ? "—" : value.toFixed(1) + "%";

export default function AttendanceReports() {
  const { accessToken } = useAuth();
  const [years, setYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/academic-years", { accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load academic years.");
        setYears(response.data);
        const active = response.data.find((item) => item.status === "active") || response.data[0];
        if (active) {
          setYearId(active._id);
          setFrom(new Date(active.startDate).toISOString().slice(0, 10));
        }
      }).catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!yearId) { setClasses([]); setClassId(""); return undefined; }
      return apiRequest("/classes?academicYearId=" + encodeURIComponent(yearId), { accessToken, signal: controller.signal })
      .then((response) => {
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load classes.");
        setClasses(response.data);
      }).catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    });
    return () => controller.abort();
  }, [accessToken, yearId]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!yearId) { setTerms([]); return undefined; }
      return apiRequest(`/academic-terms?academicYearId=${encodeURIComponent(yearId)}`, { accessToken, signal: controller.signal })
        .then((response) => {
          if (!controller.signal.aborted) setTerms(Array.isArray(response?.data) ? response.data.filter((term) => term.status !== "cancelled") : []);
        })
        .catch((err) => { if (err.name !== "AbortError") setError(err.message || "Unable to load academic terms."); });
    });
    return () => controller.abort();
  }, [accessToken, yearId]);

  const loadReport = async (event) => {
    event.preventDefault();
    if (!yearId || !from || !to || from > to) { setError("Select an academic year and a valid date range."); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ academicYearId: yearId, from, to });
      if (classId) params.set("classId", classId);
      if (termId) params.set("academicTermId", termId);
      const response = await apiRequest("/attendance/reports?" + params.toString(), { accessToken });
      if (!response?.success) throw new Error(response?.message || "Unable to generate attendance report.");
      setReport(response);
    } catch (err) { setReport(null); setError(err.message || "Unable to generate attendance report."); }
    finally { setLoading(false); }
  };

  const summary = report?.summary;
  const students = useMemo(() => report?.students || [], [report]);
  const monthly = useMemo(() => report?.monthly || [], [report]);

  return <section className="attendance-reports">
    <div className="attendance-reports-heading">
      <div><h2>Attendance reports</h2><p>Review student attendance rates and monthly class performance.</p></div>
      <button type="button" onClick={() => window.print()} disabled={!report}>Print report</button>
    </div>
    {error && <p className="attendance-report-error" role="alert">{error}</p>}
    <form className="attendance-report-filters" onSubmit={loadReport}>
      <label>Academic year<select value={yearId} onChange={(event) => { setYearId(event.target.value); setTermId(""); }} required>
        <option value="">Select academic year</option>{years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}
      </select></label>
      <label>Academic term<select value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">All terms</option>{terms.map((term) => <option key={term._id} value={term._id}>{term.name}</option>)}</select></label>
      <label>Class<select value={classId} onChange={(event) => setClassId(event.target.value)}>
        <option value="">All classes</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
      </select></label>
      <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label>
      <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} required min={from || undefined} /></label>
      <button type="submit" disabled={loading}>{loading ? "Generating…" : "Generate report"}</button>
    </form>
    {!report && !loading && <div className="attendance-report-empty">Choose your filters and generate a report to view attendance statistics.</div>}
    {report && <>
      <div className="attendance-report-period">Report period: <strong>{report.range.from}</strong> to <strong>{report.range.to}</strong></div>
      <div className="attendance-report-metrics">
        <article><strong>{summary.students}</strong><span>Enrolled students</span></article>
        <article><strong>{summary.marked}</strong><span>Attendance entries</span></article>
        <article><strong>{summary.attended}</strong><span>Present + late</span></article>
        <article><strong>{percent(summary.percentage)}</strong><span>Attendance rate</span></article>
        <article><strong>{summary.absent}</strong><span>Absent</span></article>
        <article><strong>{summary.excused}</strong><span>Excused</span></article>
      </div>
      <section className="attendance-report-section">
        <div className="attendance-report-section-title"><h3>Class-wise monthly summary</h3><span>{monthly.length} class-month records</span></div>
        <div className="attendance-report-table-wrap"><table><thead><tr><th>Class</th><th>Month</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>Attendance rate</th></tr></thead>
          <tbody>{monthly.length ? monthly.map((item) => <tr key={item.classId + item.month}><td>{item.className}</td><td>{monthLabel(item.month)}</td><td>{item.present}</td><td>{item.late}</td><td>{item.absent}</td><td>{item.excused}</td><td><strong>{percent(item.percentage)}</strong></td></tr>) : <tr><td colSpan="7">No attendance records found for this period.</td></tr>}</tbody>
        </table></div>
      </section>
      <section className="attendance-report-section">
        <div className="attendance-report-section-title"><h3>Student attendance percentages</h3><span>{students.length} students</span></div>
        <div className="attendance-report-table-wrap"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Class</th><th>Section</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>Attendance rate</th></tr></thead>
          <tbody>{students.length ? students.map((item) => <tr key={item.enrollmentId || item.studentId}><td>{item.admissionNumber}</td><td>{item.name}</td><td>{item.className}</td><td>{item.sectionName}</td><td>{item.present}</td><td>{item.late}</td><td>{item.absent}</td><td>{item.excused}</td><td><strong className={item.percentage !== null && item.percentage < 75 ? "attendance-rate-low" : ""}>{percent(item.percentage)}</strong></td></tr>) : <tr><td colSpan="9">No active students found for this academic year.</td></tr>}</tbody>
        </table></div>
      </section>
      <p className="attendance-report-footnote">Attendance rate = (Present + Late) ÷ (Present + Late + Absent). Excused entries are excluded; unmarked days are not counted.</p>
    </>}
  </section>;
}
