
import { useEffect, useState } from "react";
import { apiRequest } from "./lib/api.js";
import "./App.css";
import "./components/Phase7Management.css";
import { AuthProvider } from "./context/AuthContext.jsx";
import { useAuth } from "./context/authContext.js";
import LoginPage from "./components/LoginPage.jsx";
import StudentDirectory from "./components/StudentDirectory.jsx";
import AcademicYearManagement from "./components/AcademicYearManagement.jsx";
import AcademicTermsManagement from "./components/AcademicTermsManagement.jsx";
import ClassCurriculumManagement from "./components/ClassCurriculumManagement.jsx";
import ClassesManagement from "./components/ClassesManagement.jsx";
import SectionsManagement from "./components/SectionsManagement.jsx";
import EnrollmentsManagement from "./components/EnrollmentsManagement.jsx";
import PlatformAdminWorkspace from "./components/PlatformAdminWorkspace.jsx";
import SchoolUserDirectory from "./components/SchoolUserDirectory.jsx";
import GuardianDirectory from "./components/GuardianDirectory.jsx";
import AttendanceManagement from "./components/AttendanceManagement.jsx";
import AttendanceReports from "./components/AttendanceReports.jsx";
import SubjectManagement from "./components/SubjectManagement.jsx";
import TeacherAssignments from "./components/TeacherAssignments.jsx";
import TimetableManagement from "./components/TimetableManagement.jsx";
import ExaminationManagement from "./components/ExaminationManagement.jsx";
import GradingScaleManagement from "./components/GradingScaleManagement.jsx";
import StudentResultsPortal from "./components/StudentResultsPortal.jsx";
import HomeworkManagement from "./components/HomeworkManagement.jsx";
import FeeManagement from "./components/FeeManagement.jsx";
import StaffManagement from "./components/StaffManagement.jsx";
import TeacherTimetablePortal from "./components/TeacherTimetablePortal.jsx";
import AnnouncementManagement from "./components/AnnouncementManagement.jsx";
import MessagingWorkspace from "./components/MessagingWorkspace.jsx";
import CertificatesReports from "./components/CertificatesReports.jsx";
import SchoolDashboard from "./components/SchoolDashboard.jsx";
const navigation = [
  { label: "Overview", icon: "▦", section: "MAIN" },
  { label: "Students", icon: "♙", section: "MAIN" },
  { label: "Guardians", icon: "♧", section: "MAIN" },
  { label: "Teachers & Staff", icon: "♙", section: "MAIN" },
  { label: "Announcements", icon: "▤", section: "MAIN" },
  { label: "Messaging Oversight", icon: "✉", section: "MAIN" },
  { label: "Academic Years", icon: "▣", section: "ACADEMICS" },
  { label: "Academic Terms", icon: "▤", section: "ACADEMICS" },
  { label: "Classes & Sections", icon: "▤", section: "ACADEMICS" },
  { label: "Sections", icon: "▧", section: "ACADEMICS" },
  { label: "Enrollments", icon: "♙", section: "ACADEMICS" },
  { label: "Attendance", icon: "✓", section: "ACADEMICS" },
  { label: "Attendance Reports", icon: "▥", section: "ACADEMICS" },
  { label: "Certificates & Reports", icon: "▤", section: "ACADEMICS" },
  { label: "Subjects", icon: "▤", section: "ACADEMICS" },
  { label: "Class Curriculum", icon: "▦", section: "ACADEMICS" },
  { label: "Teacher Assignments", icon: "♙", section: "ACADEMICS" },
  { label: "Timetable", icon: "▦", section: "ACADEMICS" },
  { label: "Examinations", icon: "▤", section: "ACADEMICS" },
  { label: "Grading Scales", icon: "▧", section: "ACADEMICS" },
  { label: "Homework & Classwork", icon: "✎", section: "ACADEMICS" },
  { label: "Fees & Payments", icon: "₹", section: "FINANCE" },
  { label: "Reports", icon: "▥", section: "FINANCE" },
  { label: "User Management", icon: "♙", section: "SYSTEM" },
  { label: "Settings", icon: "⚙", section: "SYSTEM" },
];


function DashboardApp() {
   const { status, user, schoolContext, logout, accessToken } = useAuth();
   const [activeAcademicYear, setActiveAcademicYear] = useState(null);
   const [activePage, setActivePage] = useState("Overview");
   const [sidebarOpen, setSidebarOpen] = useState(false);

   useEffect(() => {
        if (
      status !== "authenticated" ||
      !accessToken ||
      !["school_admin", "principal"].includes(user?.role)
    ) {
      return undefined;
    }

     const controller = new AbortController();
     apiRequest("/academic-years?status=active", {
       accessToken,
       signal: controller.signal,
     }).then((response) => {
       if (!controller.signal.aborted) {
         setActiveAcademicYear(Array.isArray(response?.data) ? response.data[0] || null : null);
       }
     }).catch((error) => {
       if (error.name !== "AbortError" && !controller.signal.aborted) {
         setActiveAcademicYear(null);
       }
     });

     return () => controller.abort();
   }, [accessToken, status, user?.role]);
     if (status === "loading") {
    return (
      <main className="auth-loading">
        <div className="auth-brand-mark">S</div>
        <p>Restoring your session…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return <LoginPage />;
  }

  if (user?.role === "student" || user?.role === "parent") {
    return <StudentResultsPortal />;
  }

  if (user?.role === "teacher") {
    return <TeacherTimetablePortal />;
  }

  if (user?.role === "platform_admin") {
    return <PlatformAdminWorkspace />;
  }
  if (!["school_admin", "principal"].includes(user?.role)) {
  return (
    <main className="auth-loading">
      <div className="auth-brand-mark">S</div>
      <h1>Workspace unavailable</h1>
      <p>
        Your account does not currently have access to the
        school administration workspace.
      </p>
      <button
        className="logout-button"
        type="button"
        onClick={() => {
          void logout();
        }}
      >
        Sign out
      </button>
    </main>
  );
}

  const schoolName = schoolContext?.school?.name || "School workspace";
  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ") || "School Administrator";

  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const selectPage = (page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="erp-shell">
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">School<span>Suite</span></div>
            <div className="brand-caption">SCHOOL MANAGEMENT</div>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="school-switcher">
          <div className="school-avatar">S</div>
          <div className="school-info">
            <strong>{schoolName}</strong>
            <span>School workspace</span>
          </div>
          <span className="switcher-chevron">⌄</span>
        </div>

        <nav className="navigation" aria-label="Main navigation">
          {["MAIN", "ACADEMICS", "FINANCE", "SYSTEM"].map((section) => (
            <div className="nav-section" key={section}>
              <div className="nav-heading">{section}</div>
              {navigation
                .filter((item) => item.section === section)
                .map((item) => (
                  <button
                    key={item.label}
                    className={`nav-link ${activePage === item.label ? "nav-link-active" : ""}`}
                    onClick={() => selectPage(item.label)}
                  >
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.label === "Students" && (
                      <span className="nav-badge">01</span>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="support-icon">?</div>
          <div>
            <strong>Need assistance?</strong>
            <span>Help & support</span>
          </div>
          <span className="footer-arrow">↗</span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{activePage}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="academic-year">
              <span className="year-dot" />
              Academic year <strong>{activeAcademicYear?.name || "Not set"}</strong>
            </div>
            <button className="icon-button notification-button" aria-label="Notifications">
              ♧<span className="notification-dot" />
            </button>
            <div className="profile">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-info">
              <strong>{fullName}</strong>
              <span>{user?.role?.replaceAll("_", " ") || "School user"}</span>
            </div>
              <span className="switcher-chevron">⌄</span>
            </div>
            <button
              className="logout-button"
              type="button"
              onClick={() => {
                void logout();
              }}
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">SCHOOL WORKSPACE</div>
              <h1>{activePage === "Overview" ? "Good day, Administrator" : activePage}</h1>
              <p className="page-subtitle">
                {activePage === "Overview"
                  ? "Here’s an overview of your school management workspace."
                  : `Manage ${activePage.toLowerCase()} in your school workspace.`}
              </p>
            </div>
            <div className="date-chip">
              <span aria-hidden="true">▦</span>
              <span>Academic session</span>
              <strong>{activeAcademicYear?.name || "Not set"}</strong>
            </div>
          </div>

          {activePage === "Overview" ? (
            <SchoolDashboard accessToken={accessToken} academicYearId={activeAcademicYear?._id} onNavigate={selectPage} />
          ) : activePage === "Students" ? (
  <StudentDirectory />
) : activePage === "Guardians" ? (
  <GuardianDirectory />
) : activePage === "Teachers & Staff" ? (
  <StaffManagement />
 ) : activePage === "Academic Years" ? (
  <AcademicYearManagement />
) : activePage === "Academic Terms" ? (
  <AcademicTermsManagement />
) : activePage === "Class Curriculum" ? (
  <ClassCurriculumManagement />
) : activePage === "Classes & Sections" ? (
  <ClassesManagement />
) : activePage === "Sections" ? (
  <SectionsManagement />
) : activePage === "Enrollments" ? (
  <EnrollmentsManagement />
) : activePage === "Attendance" ? (
  <AttendanceManagement />
) : activePage === "Attendance Reports" ? (
  <AttendanceReports />
) : activePage === "Certificates & Reports" || activePage === "Reports" ? (
  <CertificatesReports />
) : activePage === "Subjects" ? (
  <SubjectManagement />
) : activePage === "Teacher Assignments" ? (
  <TeacherAssignments />
) : activePage === "Timetable" ? (
  <TimetableManagement />
 ) : activePage === "Examinations" ? (
  <ExaminationManagement />
) : activePage === "Grading Scales" ? (
  <GradingScaleManagement />
) : activePage === "Homework & Classwork" ? (
  <HomeworkManagement />
) : activePage === "Announcements" ? (
  <AnnouncementManagement />
) : activePage === "Messaging Oversight" ? (
  <MessagingWorkspace mode="admin" />
) : activePage === "Fees & Payments" ? (
  <FeeManagement />
) : activePage === "User Management" ? (
  <SchoolUserDirectory />
) : (
  <section className="content-card placeholder-page">
    <div className="placeholder-icon">▦</div>
    <h2>{activePage}</h2>
    <p>
      This section is part of the School ERP workspace. We’ll implement
      each module in its planned development phase.
    </p>
    <button
      className="primary-button"
      onClick={() => selectPage("Overview")}
    >
      Back to overview
    </button>
  </section>
          )}

          <footer className="page-footer">
            <span>SchoolSuite <span className="footer-separator">·</span> School management workspace</span>
            <span>Secure, modular and built to grow.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DashboardApp />
    </AuthProvider>
  );
}
