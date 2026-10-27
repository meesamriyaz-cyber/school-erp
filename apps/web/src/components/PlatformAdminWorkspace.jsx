import { useEffect, useState } from "react";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

const navigation = [
  { label: "Overview", icon: "▦" },
  { label: "Schools", icon: "⌂" },
];

const PAGE_SIZE = 20;

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function statusLabel(status) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
}

export default function PlatformAdminWorkspace() {
  const { user, logout, accessToken } = useAuth();
  const [activePage, setActivePage] = useState("Overview");
  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolsError, setSchoolsError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [schoolForm, setSchoolForm] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    timezone: "Asia/Kolkata",
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [createSchoolError, setCreateSchoolError] = useState("");
  const [createSchoolSuccess, setCreateSchoolSuccess] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [schoolDetails, setSchoolDetails] = useState(null);
  const [loadingSchoolDetails, setLoadingSchoolDetails] = useState(false);
  const [schoolDetailsError, setSchoolDetailsError] = useState("");

  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ") || "Platform Administrator";

  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (activePage !== "Schools") return undefined;

    const controller = new AbortController();
    const loadSchools = async () => {
      setLoadingSchools(true);
      setSchoolsError("");

      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      try {
        const response = await apiRequest(
          `/platform/schools?${params.toString()}`,
          { accessToken, signal: controller.signal },
        );
        setSchools(Array.isArray(response?.data) ? response.data : []);
        setPagination((current) => ({
          ...current,
          ...(response?.pagination ?? {}),
        }));
      } catch (error) {
        if (error.name !== "AbortError") {
          setSchoolsError(error.message || "Unable to load the school directory.");
          setSchools([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSchools(false);
      }
    };

    void loadSchools();
    return () => controller.abort();
  }, [activePage, accessToken, pagination.page, search, statusFilter, reloadCount]);


  useEffect(() => {
    if (activePage !== "SchoolDetails" || !selectedSchoolId) return undefined;
    const controller = new AbortController();
    const loadSchoolDetails = async () => {
      setLoadingSchoolDetails(true);
      setSchoolDetailsError("");
      try {
        const response = await apiRequest(
          `/platform/schools/${encodeURIComponent(selectedSchoolId)}`,
          { accessToken, signal: controller.signal },
        );
        setSchoolDetails(response?.data ?? response?.school ?? response ?? null);
      } catch (error) {
        if (error.name !== "AbortError") {
          setSchoolDetailsError(error.message || "Unable to load school details.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSchoolDetails(false);
      }
    };
    void loadSchoolDetails();
    return () => controller.abort();
  }, [activePage, accessToken, selectedSchoolId, reloadCount]);

  const updateSchoolForm = (event) => {
    const { name, value } = event.target;
    setSchoolForm((current) => ({ ...current, [name]: value }));
  };

  const submitCreateSchool = async (event) => {
    event.preventDefault();
    setCreateSchoolError("");
    setCreateSchoolSuccess("");
    const name = schoolForm.name.trim();
    const slug = schoolForm.slug.trim().toLowerCase();
    const adminEmail = schoolForm.adminEmail.trim().toLowerCase();
    if (!name || !slug || !schoolForm.adminFirstName.trim() || !adminEmail || !schoolForm.adminPassword) {
      setCreateSchoolError("Complete all required fields before creating the school.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setCreateSchoolError("School ID must use lowercase letters, numbers, and single hyphens only.");
      return;
    }
    if (schoolForm.adminPassword.length < 8) {
      setCreateSchoolError("The initial administrator password must be at least 8 characters.");
      return;
    }
    setCreatingSchool(true);
    try {
      const response = await apiRequest("/platform/schools", {
        method: "POST",
        accessToken,
        body: {
          school: {
            name,
            slug,
            ...(schoolForm.contactEmail.trim() ? { contactEmail: schoolForm.contactEmail.trim().toLowerCase() } : {}),
            timezone: schoolForm.timezone.trim() || "Asia/Kolkata",
          },
          admin: {
            firstName: schoolForm.adminFirstName.trim(),
            ...(schoolForm.adminLastName.trim() ? { lastName: schoolForm.adminLastName.trim() } : {}),
            email: adminEmail,
            password: schoolForm.adminPassword,
          },
        },
      });
      const created = response?.data?.school ?? response?.school ?? response?.data ?? null;
      setCreateSchoolSuccess(`School "${created?.name || name}" and its initial administrator were created successfully.`);
      setSchoolForm({
        name: "", slug: "", contactEmail: "", timezone: "Asia/Kolkata",
        adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: "",
      });
      setPagination((current) => ({ ...current, page: 1 }));
      setSearch("");
      setSearchInput("");
      setStatusFilter("");
      setReloadCount((count) => count + 1);
    } catch (error) {
      setCreateSchoolError(
        error.status === 409
          ? error.message || "A school with this ID or administrator email already exists."
          : error.message || "Unable to create the school. Please try again.",
      );
    } finally {
      setCreatingSchool(false);
    }
  };

  const openSchoolDetails = (school) => {
    setSelectedSchoolId(school.id || school._id);
    setSchoolDetails(null);
    setActivePage("SchoolDetails");
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setSearch(searchInput.trim());
  };

  const changeStatusFilter = (value) => {
    setPagination((current) => ({ ...current, page: 1 }));
    setStatusFilter(value);
  };

  const totalPages = pagination.totalPages || 0;
  const startItem = pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(pagination.page * PAGE_SIZE, pagination.total);

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
              aria-current={activePage === item.label ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
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
          <h1>{activePage === "Overview" ? "Platform overview" : activePage === "CreateSchool" ? "Create school" : activePage === "SchoolDetails" ? "School details" : "School directory"}</h1>
          <p className="platform-page-description">
            {activePage === "Overview"
              ? "Manage schools and their access from one secure workspace."
              : activePage === "CreateSchool"
                ? "Register a school and create its first administrator in one secure step."
                : activePage === "SchoolDetails"
                  ? "Review school information and its associated administrators."
                  : "Search registered schools, review their status, and move through the directory."}
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
                  <strong>Available</strong>
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
            <section className="platform-directory" aria-label="School directory">
              <div className="platform-directory-toolbar">
                <form className="platform-search-form" onSubmit={submitSearch} role="search">
                  <label className="platform-search-field">
                    <span className="platform-search-icon" aria-hidden="true">⌕</span>
                    <span className="sr-only">Search schools</span>
                    <input
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Search by school name or slug"
                      maxLength={100}
                    />
                  </label>
                  <button type="submit" className="platform-primary-button">Search</button>
                </form>
                <label className="platform-status-filter">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => changeStatusFilter(event.target.value)}
                    aria-label="Filter schools by status"
                  >
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
              </div>

              <div className="platform-directory-meta">
                <strong>{pagination.total} {pagination.total === 1 ? "school" : "schools"}</strong>
                <span>{loadingSchools ? "Refreshing directory…" : search || statusFilter ? "Filtered results" : "All registered schools"}</span>
              </div>

              {schoolsError && (
                <div className="platform-directory-error" role="alert">
                  <p>{schoolsError}</p>
                  <button type="button" onClick={() => setReloadCount((count) => count + 1)}>
                    Retry
                  </button>
                </div>
              )}

              <div className="platform-table-wrap">
                <table className="platform-school-table" aria-label="School directory">
                  <thead>
                    <tr>
                      <th scope="col">School</th>
                      <th scope="col">School ID</th>
                      <th scope="col">Contact email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSchools && schools.length === 0 ? (
                      <tr><td colSpan="5" className="platform-table-message" role="status">Loading schools…</td></tr>
                    ) : schools.length > 0 ? (
                      schools.map((school) => (
                        <tr key={school.id || school._id}>
                          <td>
                            <button type="button" className="platform-school-name-button" onClick={() => openSchoolDetails(school)}>{school.name || "Unnamed school"}</button>
                          </td>
                          <td><code>{school.slug || "—"}</code></td>
                          <td>{school.contactEmail || "—"}</td>
                          <td><span className={`platform-status-pill platform-status-${school.status || "unknown"}`}>{statusLabel(school.status)}</span></td>
                          <td>{formatDate(school.createdAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="platform-table-message">
                          {schoolsError ? "School records could not be loaded." : "No schools match these filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="platform-pagination">
                <span>
                  {pagination.total === 0 ? "No results" : `Showing ${startItem}–${endItem} of ${pagination.total}`}
                </span>
                <div>
                  <button
                    type="button"
                    className="platform-page-button"
                    disabled={loadingSchools || pagination.page <= 1}
                    onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
                  >
                    Previous
                  </button>
                  <span className="platform-page-count">
                    Page {pagination.page}{totalPages > 0 ? ` of ${totalPages}` : ""}
                  </span>
                  <button
                    type="button"
                    className="platform-page-button"
                    disabled={loadingSchools || totalPages === 0 || pagination.page >= totalPages}
                    onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
