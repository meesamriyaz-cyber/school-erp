import { useState } from "react";
import { useAuth } from "../context/authContext.js";

const navigation = [
  { label: "Overview", icon: "▦" },
  { label: "Schools", icon: "⌂" },
];

export default function PlatformAdminWorkspace() {
  const { user, logout } = useAuth();
  const [activePage, setActivePage] = useState("Overview");

  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ") || "Platform Administrator";

  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="platform-brand">
          <div className="platform-brand-mark">S</div>
          <div>
            <div className="platform-brand-name">School<span>Suite</span></div>
            <div className="platform-brand-caption">PLATFORM CONTROL</div>
          </div>
        </div>

        <div className="platform-identity">
          <span className="platform-identity-label">ADMINISTRATION</span>
          <strong>Platform workspace</strong>
          <span>All schools · Central management</span>
        </div>

        <nav className="platform-navigation" aria-label="Platform navigation">
          <span className="platform-nav-heading">WORKSPACE</span>
          {navigation.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`platform-nav-link ${activePage === item.label ? "platform-nav-link-active" : ""}`}
              onClick={() => setActivePage(item.label)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.label === "Schools" && <span className="platform-nav-tag">Next</span>}
            </button>
          ))}
        </nav>

        <div className="platform-sidebar-footer">
          <span className="platform-security-dot" />
          <span>Restricted administrator access</span>
        </div>
      </aside>

      <main className="platform-main">
        <header className="platform-topbar">
          <div>
            <span className="platform-breadcrumb">Platform</span>
            <span className="platform-breadcrumb-divider">/</span>
            <strong>{activePage}</strong>
          </div>
          <div className="platform-user-actions">
            <div className="platform-user-avatar">{initials}</div>
            <div className="platform-user-copy">
              <strong>{fullName}</strong>
              <span>Platform Administrator</span>
            </div>
            <button type="button" className="platform-logout" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>

        <div className="platform-content">
          <div className="platform-eyebrow">CENTRAL ADMINISTRATION</div>
          <h1>{activePage === "Overview" ? "Platform overview" : "School directory"}</h1>
          <p className="platform-page-description">
            {activePage === "Overview"
              ? "Manage schools and their access from one secure workspace."
              : "The school directory will be available in the next implementation phase."}
          </p>

          {activePage === "Overview" ? (
            <>
              <section className="platform-welcome-card">
                <div>
                  <span className="platform-card-kicker">SCHOOLS AT A GLANCE</span>
                  <h2>Your platform, centrally managed.</h2>
                  <p>School discovery, onboarding and lifecycle controls will be brought together here.</p>
                  <button type="button" onClick={() => setActivePage("Schools")}>
                    Open school directory <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="platform-card-art" aria-hidden="true">⌂</div>
              </section>

              <section className="platform-summary-grid" aria-label="Platform modules">
                <article className="platform-summary-card">
                  <span className="platform-summary-icon">⌂</span>
                  <span className="platform-summary-label">School directory</span>
                  <strong>Coming next</strong>
                  <p>Search and inspect registered schools.</p>
                </article>
                <article className="platform-summary-card">
                  <span className="platform-summary-icon">＋</span>
                  <span className="platform-summary-label">School onboarding</span>
                  <strong>Coming next</strong>
                  <p>Create a school and its initial administrator.</p>
                </article>
                <article className="platform-summary-card">
                  <span className="platform-summary-icon">✓</span>
                  <span className="platform-summary-label">Lifecycle controls</span>
                  <strong>Coming next</strong>
                  <p>Activate, suspend and reactivate schools.</p>
                </article>
              </section>
            </>
          ) : (
            <section className="platform-empty-state">
              <div className="platform-empty-icon" aria-hidden="true">⌂</div>
              <h2>School directory is next</h2>
              <p>Phase 2 will connect this workspace to the protected school directory API, including search, status filters and pagination.</p>
              <button type="button" onClick={() => setActivePage("Overview")}>Back to overview</button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
