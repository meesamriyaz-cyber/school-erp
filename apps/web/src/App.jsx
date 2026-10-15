
import { useState } from "react";
import "./App.css";
import { AuthProvider } from "./context/AuthContext.jsx";
import { useAuth } from "./context/authContext.js";
import LoginPage from "./components/LoginPage.jsx";
import StudentDirectory from "./components/StudentDirectory.jsx";
const navigation = [
  { label: "Overview", icon: "▦", section: "MAIN" },
  { label: "Students", icon: "♙", section: "MAIN" },
  { label: "Guardians", icon: "♧", section: "MAIN" },
  { label: "Teachers & Staff", icon: "♙", section: "MAIN" },
  { label: "Classes & Sections", icon: "▤", section: "ACADEMICS" },
  { label: "Attendance", icon: "✓", section: "ACADEMICS" },
  { label: "Timetable", icon: "▦", section: "ACADEMICS" },
  { label: "Examinations", icon: "▤", section: "ACADEMICS" },
  { label: "Fees & Payments", icon: "₹", section: "FINANCE" },
  { label: "Reports", icon: "▥", section: "FINANCE" },
  { label: "Settings", icon: "⚙", section: "SYSTEM" },
];

const stats = [
  { label: "Total students", value: "—", note: "Live data will appear here", icon: "♙" },
  { label: "Present today", value: "—", note: "Attendance module pending", icon: "✓" },
  { label: "Teaching staff", value: "—", note: "Staff module pending", icon: "♧" },
  { label: "Fee collection", value: "—", note: "Finance module pending", icon: "₹" },
];

function DashboardApp() {
   const { status, user, schoolContext, logout } = useAuth();
   const [activePage, setActivePage] = useState("Overview");
   const [sidebarOpen, setSidebarOpen] = useState(false);
     if (status === "loading") {
    return (
      <main className="auth-loading">
        <div className="auth-brand-mark">S</div>
        <p>Restoring your school session…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return <LoginPage />;
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
              Academic year <strong>2026–27</strong>
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
              <strong>2026–27</strong>
            </div>
          </div>

          {activePage === "Overview" ? (
            <>
              <section className="welcome-banner">
                <div className="banner-copy">
                  <span className="banner-kicker">YOUR SCHOOL, ONE WORKSPACE</span>
                  <h2>Everything in one place.</h2>
                  <p>
                    Build a connected school experience, from student records
                    to academics and administration.
                  </p>
                  <button className="banner-button" onClick={() => selectPage("Students")}>
                    Explore students <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="art-circle art-circle-one" />
                  <div className="art-circle art-circle-two" />
                  <div className="art-card art-card-back">✓</div>
                  <div className="art-card art-card-front">
                    <div className="art-card-top"><span /> <span /> <span /></div>
                    <div className="art-avatar">S</div>
                    <div className="art-line art-line-long" />
                    <div className="art-line art-line-short" />
                    <div className="art-check">✓</div>
                  </div>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>School at a glance</h2>
                  <p>Key indicators from your school workspace</p>
                </div>
                <span className="demo-label">Awaiting live data</span>
              </div>

              <section className="stats-grid">
                {stats.map((stat, index) => (
                  <article className="stat-card" key={stat.label}>
                    <div className={`stat-icon stat-icon-${index}`}>
                      {stat.icon}
                    </div>
                    <div className="stat-label">{stat.label}</div>
                    <div className="stat-value">{stat.value}</div>
                    <div className="stat-note">{stat.note}</div>
                  </article>
                ))}
              </section>

              <section className="lower-grid">
                <article className="content-card module-card">
                  <div className="card-heading">
                    <div>
                      <h2>Workspace modules</h2>
                      <p>Build your school's digital workflow</p>
                    </div>
                    <span className="card-heading-icon">▦</span>
                  </div>
                  <button className="module-row" onClick={() => selectPage("Students")}>
                    <span className="module-symbol module-symbol-blue">♙</span>
                    <span className="module-copy">
                      <strong>Student management</strong>
                      <span>Admissions, student records and guardians</span>
                    </span>
                    <span className="module-status status-ready">API ready</span>
                    <span className="module-arrow">→</span>
                  </button>
                  <div className="module-row module-row-muted">
                    <span className="module-symbol module-symbol-violet">✓</span>
                    <span className="module-copy">
                      <strong>Attendance management</strong>
                      <span>Daily attendance and summaries</span>
                    </span>
                    <span className="module-status">Planned</span>
                  </div>
                  <div className="module-row module-row-muted">
                    <span className="module-symbol module-symbol-amber">₹</span>
                    <span className="module-copy">
                      <strong>Fees & payments</strong>
                      <span>Fee structures, invoices and receipts</span>
                    </span>
                    <span className="module-status">Planned</span>
                  </div>
                </article>

                <article className="content-card activity-card">
                  <div className="card-heading">
                    <div>
                      <h2>Getting started</h2>
                      <p>Your implementation progress</p>
                    </div>
                    <span className="progress-count">01 / 04</span>
                  </div>
                  <div className="progress-track"><div className="progress-fill" /></div>
                  <div className="progress-caption">Core foundation completed</div>
                  <div className="checklist-item">
                    <span className="checklist-check">✓</span>
                    <span>
                      <strong>School and account foundation</strong>
                      <small>Authentication and tenant isolation</small>
                    </span>
                  </div>
                  <div className="checklist-item">
                    <span className="checklist-pending">2</span>
                    <span>
                      <strong>Student management interface</strong>
                      <small>Currently being built</small>
                    </span>
                  </div>
                  <div className="checklist-item">
                    <span className="checklist-pending">3</span>
                    <span>
                      <strong>Academic operations</strong>
                      <small>Upcoming development phase</small>
                    </span>
                  </div>
                  <div className="checklist-item">
                    <span className="checklist-pending">4</span>
                    <span>
                      <strong>Mobile experience</strong>
                      <small>Shared API for web and mobile</small>
                    </span>
                  </div>
                </article>
              </section>
            </>
          ) : activePage === "Students" ? (
  <StudentDirectory />
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
