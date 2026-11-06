import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./TeacherTimetablePortal.css";
import TeacherAttendancePortal from "./TeacherAttendancePortal.jsx";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export default function TeacherTimetablePortal() {
  const { accessToken, user, logout } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("timetable");

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
    return () => controller.abort();
  }, [accessToken]);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Teacher";

  return (
    <main className="teacher-timetable-page">
      <header className="teacher-timetable-header">
        <div><span>TEACHER WORKSPACE</span><h1>My weekly timetable</h1><p>Your assigned classes, subjects and periods.</p></div>
        <button type="button" onClick={() => void logout()}>Sign out</button>
      </header>
      <p className="teacher-timetable-welcome">Welcome, {name}</p>
      <nav className="teacher-workspace-tabs" aria-label="Teacher workspace">
        <button type="button" className={activeView === "timetable" ? "active" : ""} onClick={() => setActiveView("timetable")}>My timetable</button>
        <button type="button" className={activeView === "attendance" ? "active" : ""} onClick={() => setActiveView("attendance")}>Mark attendance</button>
      </nav>
      {activeView === "attendance" ? <TeacherAttendancePortal /> : <>
      {error && <p className="teacher-timetable-error" role="alert">{error}</p>}
      {loading ? <p className="teacher-timetable-empty">Loading your timetable…</p> : entries.length === 0 ? (
        <p className="teacher-timetable-empty">No active timetable periods are assigned to you yet. Please contact your school administrator.</p>
      ) : (
        <div className="teacher-timetable-days">
          {DAYS.map((day) => {
            const periods = entries.filter((entry) => entry.dayOfWeek === day.value);
            if (!periods.length) return null;
            return <section className="teacher-timetable-day" key={day.value}>
              <h2>{day.label}</h2>
              <div className="teacher-timetable-periods">
                {periods.map((entry) => <article className="teacher-timetable-period" key={entry._id}>
                  <div className="teacher-timetable-period-time"><strong>{entry.startTime} – {entry.endTime}</strong><span>Period {entry.periodNumber}</span></div>
                  <div className="teacher-timetable-period-main"><h3>{entry.assignmentId?.subjectId?.name || "Subject"}</h3><p>{entry.classId?.name || "Class"}{entry.sectionId?.name ? ` · Section ${entry.sectionId.name}` : ""}</p></div>
                  <div className="teacher-timetable-room">{entry.room || "Room not assigned"}</div>
                </article>)}
              </div>
            </section>;
          })}
        </div>
      )}
      </>}
    </main>
  );
}