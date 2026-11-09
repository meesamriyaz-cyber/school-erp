import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./TeacherTimetablePortal.css";
import TeacherAttendancePortal from "./TeacherAttendancePortal.jsx";
import HomeworkManagement from "./HomeworkManagement.jsx";
import TeacherExaminations from "./TeacherExaminations.jsx";
import TeacherRosterPortal from "./TeacherRosterPortal.jsx";
import TeacherReportsPortal from "./TeacherReportsPortal.jsx";
import AnnouncementManagement from "./AnnouncementManagement.jsx";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const timeValue = (value) => {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
};

export default function TeacherTimetablePortal() {
  const { accessToken, user, logout } = useAuth();
  const [entries, setEntries] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [scheduleView, setScheduleView] = useState("week");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiRequest("/timetable", { accessToken, signal: controller.signal });
        if (!response?.success || !Array.isArray(response.data)) throw new Error("Unable to load your timetable.");
        if (!controller.signal.aborted) setEntries(response.data);
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message || "Unable to load your timetable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    apiRequest("/teacher-assignments?status=active", { accessToken, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted && response?.success) setAssignments(response.data || []); })
      .catch((err) => { if (err.name !== "AbortError" && !controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [accessToken]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.dayOfWeek - b.dayOfWeek || timeValue(a.startTime) - timeValue(b.startTime) || a.periodNumber - b.periodNumber),
    [entries],
  );
  const entriesByDay = useMemo(
    () => DAYS.map((day) => ({ ...day, periods: sortedEntries.filter((entry) => entry.dayOfWeek === day.value) })),
    [sortedEntries],
  );
  const classCount = new Set(entries.map((entry) => entry.classId?._id || entry.classId?.name).filter(Boolean)).size;
  const subjectCount = new Set(entries.map((entry) => entry.assignmentId?.subjectId?._id || entry.assignmentId?.subjectId?.name).filter(Boolean)).size;
  const today = new Date().getDay();
  const todayValue = today === 0 ? null : today;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Teacher";

  return (
    <main className="teacher-timetable-page">
      <header className="teacher-timetable-header">
        <div><span>TEACHER WORKSPACE</span><h1>Teacher workspace</h1><p>Your daily teaching responsibilities in one place.</p></div>
        <button type="button" onClick={() => void logout()}>Sign out</button>
      </header>
      <p className="teacher-timetable-welcome">Welcome, {name}</p>
      <nav className="teacher-workspace-tabs" aria-label="Teacher workspace">
        <button type="button" className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")}>Overview</button>
        <button type="button" className={activeView === "timetable" ? "active" : ""} onClick={() => setActiveView("timetable")}>My timetable</button>
        <button type="button" className={activeView === "attendance" ? "active" : ""} onClick={() => setActiveView("attendance")}>Mark attendance</button>
        <button type="button" className={activeView === "homework" ? "active" : ""} onClick={() => setActiveView("homework")}>Homework & classwork</button>
        <button type="button" className={activeView === "classes" ? "active" : ""} onClick={() => setActiveView("classes")}>My classes</button>
        <button type="button" className={activeView === "students" ? "active" : ""} onClick={() => setActiveView("students")}>My students</button>
        <button type="button" className={activeView === "reports" ? "active" : ""} onClick={() => setActiveView("reports")}>Reports</button>
        <button type="button" className={activeView === "exams" ? "active" : ""} onClick={() => setActiveView("exams")}>Examination marks</button>\n        <button type="button" className={activeView === "announcements" ? "active" : ""} onClick={() => setActiveView("announcements")}>Announcements</button>
      </nav>
      {activeView === "overview" ? <section className="teacher-overview">
        <div className="teacher-overview-cards">
          <article><strong>{entries.length}</strong><span>Weekly periods</span></article>
          <article><strong>{classCount}</strong><span>Classes on timetable</span></article>
          <article><strong>{subjectCount}</strong><span>Subjects on timetable</span></article>
          <article><strong>{assignments.length}</strong><span>Active assignments</span></article>
        </div>
        <div className="teacher-overview-schedule"><h2>{todayValue ? `Today's schedule · ${DAYS.find((day) => day.value === todayValue)?.label}` : "Weekend schedule"}</h2><p>Your periods for today, based on the active timetable.</p>
          {loading ? <p>Loading today's schedule…</p> : todayValue && sortedEntries.some((entry) => entry.dayOfWeek === todayValue) ?
            sortedEntries.filter((entry) => entry.dayOfWeek === todayValue).map((entry) => <article key={entry._id}><strong>{entry.startTime} – {entry.endTime}</strong><span>{entry.assignmentId?.subjectId?.name || "Subject"} · {entry.classId?.name || "Class"}{entry.sectionId?.name ? ` · ${entry.sectionId.name}` : ""}</span><small>Period {entry.periodNumber}{entry.room ? ` · ${entry.room}` : ""}</small></article>) :
            <p>No timetable periods are scheduled for today.</p>}
        </div>
        <div className="teacher-overview-actions">
          <button type="button" onClick={() => setActiveView("students")}>View my students</button>
          <button type="button" onClick={() => setActiveView("attendance")}>Mark attendance</button>
          <button type="button" onClick={() => setActiveView("homework")}>Manage homework</button>
          <button type="button" onClick={() => setActiveView("exams")}>Enter examination marks</button>
        </div>
      </section> : activeView === "students" ? <TeacherRosterPortal accessToken={accessToken} assignments={assignments} /> : activeView === "reports" ? <TeacherReportsPortal accessToken={accessToken} assignments={assignments} /> : activeView === "timetable" ? <>
        {error && <p className="teacher-timetable-error" role="alert">{error}</p>}
        {!loading && !error && entries.length > 0 && (
          <section className="teacher-timetable-summary" aria-label="Timetable summary">
            <article><strong>{entries.length}</strong><span>Weekly periods</span></article>
            <article><strong>{classCount}</strong><span>Classes assigned</span></article>
            <article><strong>{subjectCount}</strong><span>Subjects assigned</span></article>
          </section>
        )}
        {!loading && !error && entries.length > 0 && (
          <div className="teacher-timetable-view-toggle" role="group" aria-label="Timetable layout">
            <button type="button" className={scheduleView === "week" ? "active" : ""} aria-pressed={scheduleView === "week"} onClick={() => setScheduleView("week")}>Weekly view</button>
            <button type="button" className={scheduleView === "list" ? "active" : ""} aria-pressed={scheduleView === "list"} onClick={() => setScheduleView("list")}>List view</button>
            <button type="button" className="teacher-timetable-print-button" onClick={() => window.print()}>Print timetable</button>
          </div>
        )}
        <div className="teacher-timetable-print-area">
        <div className="teacher-timetable-print-heading"><h2>Teacher Timetable</h2><p>{name}</p></div>
        {loading ? <p className="teacher-timetable-empty">Loading your timetable…</p> : entries.length === 0 ? (
          <p className="teacher-timetable-empty">No active timetable periods are assigned to you yet. Please contact your school administrator.</p>
        ) : scheduleView === "list" ? (
          <div className="teacher-timetable-list" role="region" aria-label="Timetable periods">
            {sortedEntries.map((entry) => {
              const day = DAYS.find((item) => item.value === entry.dayOfWeek);
              return <article className="teacher-timetable-period" key={entry._id}>
                <div className="teacher-timetable-period-day">{day?.label || "Day"}</div>
                <div className="teacher-timetable-period-time"><strong>{entry.startTime} – {entry.endTime}</strong><span>Period {entry.periodNumber}</span></div>
                <div className="teacher-timetable-period-main"><h3>{entry.assignmentId?.subjectId?.name || "Subject"}</h3><p>{entry.classId?.name || "Class"}{entry.sectionId?.name ? ` · Section ${entry.sectionId.name}` : ""}</p></div>
                <div className="teacher-timetable-room">{entry.room || "Room not assigned"}</div>
              </article>;
            })}
          </div>
        ) : (
          <div className="teacher-timetable-days">
            {entriesByDay.map((day) => (
              <section className={`teacher-timetable-day${todayValue === day.value ? " is-today" : ""}`} key={day.value}>
                <h2>{day.label}{todayValue === day.value && <span className="teacher-timetable-today">Today</span>}</h2>
                {day.periods.length ? <div className="teacher-timetable-periods">
                  {day.periods.map((entry) => <article className="teacher-timetable-period" key={entry._id}>
                    <div className="teacher-timetable-period-time"><strong>{entry.startTime} – {entry.endTime}</strong><span>Period {entry.periodNumber}</span></div>
                    <div className="teacher-timetable-period-main"><h3>{entry.assignmentId?.subjectId?.name || "Subject"}</h3><p>{entry.classId?.name || "Class"}{entry.sectionId?.name ? ` · Section ${entry.sectionId.name}` : ""}</p></div>
                    <div className="teacher-timetable-room">{entry.room || "Room not assigned"}</div>
                  </article>)}
                </div> : <p className="teacher-timetable-no-periods">No periods assigned</p>}
              </section>
            ))}
          </div>
        )}
        </div>
      </> : activeView === "attendance" ? <TeacherAttendancePortal /> : activeView === "homework" ? <HomeworkManagement /> : activeView === "exams" ? <TeacherExaminations /> : activeView === "announcements" ? <AnnouncementManagement /> : activeView === "classes" ? <section className="teacher-classes"><h2>My assigned classes and subjects</h2><p>Assignments are managed by your school administrator.</p>{assignments.length ? <div className="teacher-classes-grid">{assignments.map((item) => <article key={item._id}><h3>{item.classId?.name || "Class"}{item.sectionId?.name ? ` · ${item.sectionId.name}` : " · All sections"}</h3><p><strong>{item.subjectId?.name || "Subject"}</strong></p><small>{item.academicYearId?.name || "Academic year"}</small></article>)}</div> : <p>No active teaching assignments found.</p>}</section> : <>
        {error && <p className="teacher-timetable-error" role="alert">{error}</p>}
        {!loading && !error && entries.length > 0 && (
          <section className="teacher-timetable-summary" aria-label="Timetable summary">
            <article><strong>{entries.length}</strong><span>Weekly periods</span></article>
            <article><strong>{classCount}</strong><span>Classes assigned</span></article>
            <article><strong>{subjectCount}</strong><span>Subjects assigned</span></article>
          </section>
        )}
        {!loading && !error && entries.length > 0 && (
          <div className="teacher-timetable-view-toggle" role="group" aria-label="Timetable layout">
            <button type="button" className={scheduleView === "week" ? "active" : ""} aria-pressed={scheduleView === "week"} onClick={() => setScheduleView("week")}>Weekly view</button>
            <button type="button" className={scheduleView === "list" ? "active" : ""} aria-pressed={scheduleView === "list"} onClick={() => setScheduleView("list")}>List view</button>
            <button type="button" className="teacher-timetable-print-button" onClick={() => window.print()}>Print timetable</button>
          </div>
        )}
        <div className="teacher-timetable-print-area">
        <div className="teacher-timetable-print-heading"><h2>Teacher Timetable</h2><p>{name}</p></div>
        {loading ? <p className="teacher-timetable-empty">Loading your timetable…</p> : entries.length === 0 ? (
          <p className="teacher-timetable-empty">No active timetable periods are assigned to you yet. Please contact your school administrator.</p>
        ) : scheduleView === "list" ? (
          <div className="teacher-timetable-list" role="region" aria-label="Timetable periods">
            {sortedEntries.map((entry) => {
              const day = DAYS.find((item) => item.value === entry.dayOfWeek);
              return <article className="teacher-timetable-period" key={entry._id}>
                <div className="teacher-timetable-period-day">{day?.label || "Day"}</div>
                <div className="teacher-timetable-period-time"><strong>{entry.startTime} – {entry.endTime}</strong><span>Period {entry.periodNumber}</span></div>
                <div className="teacher-timetable-period-main"><h3>{entry.assignmentId?.subjectId?.name || "Subject"}</h3><p>{entry.classId?.name || "Class"}{entry.sectionId?.name ? ` · Section ${entry.sectionId.name}` : ""}</p></div>
                <div className="teacher-timetable-room">{entry.room || "Room not assigned"}</div>
              </article>;
            })}
          </div>
        ) : (
          <div className="teacher-timetable-days">
            {entriesByDay.map((day) => (
              <section className={`teacher-timetable-day${todayValue === day.value ? " is-today" : ""}`} key={day.value}>
                <h2>{day.label}{todayValue === day.value && <span className="teacher-timetable-today">Today</span>}</h2>
                {day.periods.length ? <div className="teacher-timetable-periods">
                  {day.periods.map((entry) => <article className="teacher-timetable-period" key={entry._id}>
                    <div className="teacher-timetable-period-time"><strong>{entry.startTime} – {entry.endTime}</strong><span>Period {entry.periodNumber}</span></div>
                    <div className="teacher-timetable-period-main"><h3>{entry.assignmentId?.subjectId?.name || "Subject"}</h3><p>{entry.classId?.name || "Class"}{entry.sectionId?.name ? ` · Section ${entry.sectionId.name}` : ""}</p></div>
                    <div className="teacher-timetable-room">{entry.room || "Room not assigned"}</div>
                  </article>)}
                </div> : <p className="teacher-timetable-no-periods">No periods assigned</p>}
              </section>
            ))}
          </div>
        )}
        </div>
      </>}
    </main>
  );
}
