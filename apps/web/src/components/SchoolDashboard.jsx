import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import "./SchoolDashboard.css";

const number = (value) => Number(value || 0).toLocaleString("en-IN");
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function StatCard({ label, value, note, icon, tone }) {
  return <article className="school-dashboard-stat">
    <span className={`school-dashboard-stat-icon ${tone}`} aria-hidden="true">{icon}</span>
    <span className="school-dashboard-stat-label">{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

export default function SchoolDashboard({ accessToken, academicYearId, onNavigate }) {
  const [result, setResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestKey = `${accessToken || "anonymous"}:${academicYearId || "active"}:${retryCount}`;
  const loading = result?.key !== requestKey;
  const report = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error || "" : "";

  useEffect(() => {
    if (!accessToken) return undefined;
    const controller = new AbortController();
    const query = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : "";
    apiRequest(`/reports/dashboard${query}`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: response?.data || null, error: "" });
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError.name !== "AbortError") {
          setResult({ key: requestKey, data: null, error: requestError.message || "Unable to load school analytics." });
        }
      })
    return () => controller.abort();
  }, [accessToken, academicYearId, retryCount, requestKey]);

  const trendMax = useMemo(() => Math.max(1, ...(report?.attendance?.trend || []).map((item) => item.marked || 0)), [report]);
  const trend = report?.attendance?.trend || [];
  const latestResult = report?.examinations?.latestResult;

  if (loading && !report) return <section className="school-dashboard-state" aria-live="polite">Loading institutional analytics…</section>;
  if (error && !report) return <section className="school-dashboard-state school-dashboard-error" role="alert">
    <p>{error}</p><button type="button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>
  </section>;

  return <section className="school-dashboard" aria-label="Institutional analytics">
    {error && <p className="school-dashboard-inline-error" role="alert">{error}</p>}
    <div className="school-dashboard-heading">
      <div><span className="school-dashboard-eyebrow">INSTITUTIONAL OVERVIEW</span><h2>School at a glance</h2>
        <p>{report?.academicYear?.name ? `Live indicators for academic year ${report.academicYear.name}` : "Live indicators across your school workspace"}</p>
      </div>
      <span className="school-dashboard-live"><i /> Live data</span>
    </div>

    <div className="school-dashboard-stats">
      <StatCard label="Active students" value={number(report?.students?.active)} note={`${number(report?.students?.total)} student records`} icon="♙" tone="blue" />
      <StatCard label="Present today" value={number(report?.attendance?.today?.present)} note={report?.attendance?.today?.percentage == null ? "No attendance marked today" : `${number(report?.attendance?.today?.late)} late · ${report.attendance.today.percentage}% attendance` } icon="✓" tone="green" />
      <StatCard label="Teaching staff" value={number(report?.staff?.teaching)} note={`${number(report?.staff?.totalActive)} active staff members`} icon="♧" tone="violet" />
      <StatCard label="Net fee collection" value={money(report?.fees?.net)} note={`${money(report?.fees?.outstanding)} outstanding`} icon="₹" tone="amber" />
    </div>

    <div className="school-dashboard-panels">
      <article className="school-dashboard-panel">
        <header><div><h3>Attendance trend</h3><p>Monthly marked attendance records</p></div><button type="button" onClick={() => onNavigate?.("Attendance Reports")}>View reports →</button></header>
        {trend.length ? <div className="school-dashboard-chart" role="img" aria-label="Monthly attendance record trend">
          {trend.map((item) => <div className="school-dashboard-bar-group" key={item.month}>
            <div className="school-dashboard-bar-track"><span style={{ height: `${Math.max(4, (item.marked / trendMax) * 100)}%` }} title={`${item.marked} records`} /></div>
            <strong>{number(item.marked)}</strong><small>{new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" })}</small>
          </div>)}
        </div> : <p className="school-dashboard-empty">No attendance records are available for the recent months.</p>}
        <div className="school-dashboard-attendance-legend">
          <span><i className="legend-present" /> Present {number(report?.attendance?.today?.present)}</span>
          <span><i className="legend-late" /> Late {number(report?.attendance?.today?.late)}</span>
          <span><i className="legend-absent" /> Absent {number(report?.attendance?.today?.absent)}</span>
        </div>
      </article>

      <article className="school-dashboard-panel">
        <header><div><h3>Academic performance</h3><p>Most recently published examination</p></div><button type="button" onClick={() => onNavigate?.("Examinations")}>Examinations →</button></header>
        {latestResult ? <>
          <div className="school-dashboard-result-name">{latestResult.name}</div>
          <div className="school-dashboard-result-metrics">
            <div><strong>{latestResult.averagePercentage == null ? "—" : `${latestResult.averagePercentage}%`}</strong><span>Class average</span></div>
            <div><strong>{latestResult.passRate == null ? "—" : `${latestResult.passRate}%`}</strong><span>Pass rate</span></div>
            <div><strong>{number(latestResult.students)}</strong><span>Students</span></div>
          </div>
          <p className="school-dashboard-result-footnote">{number(latestResult.passed)} passed · {number(latestResult.failed)} failed</p>
        </> : <p className="school-dashboard-empty">No published examination results are available for this academic year.</p>}
        <div className="school-dashboard-enrollment">
          <span>Active enrollments</span><strong>{number(report?.enrollments?.active)}</strong>
          <span>Completed</span><strong>{number(report?.enrollments?.completed)}</strong>
          <span>Total recorded</span><strong>{number(report?.enrollments?.total)}</strong>
        </div>
      </article>
    </div>

    <div className="school-dashboard-footer">
      <span>Updated {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : "—"}</span>
      <span>{number(report?.examinations?.published)} published examinations</span>
    </div>
  </section>;
}
