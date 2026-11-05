import { useCallback, useEffect, useState } from "react";
import SchoolUserDetails from "./SchoolUserDetails.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";
import "./SchoolUserDirectory.css";

const PAGE_SIZE = 10;

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "principal", label: "Principal" },
  { value: "teacher", label: "Teacher" },
  { value: "accountant", label: "Accountant" },
  { value: "librarian", label: "Librarian" },
  { value: "transport_manager", label: "Transport manager" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

function formatRole(role) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label
    || (role ? role.replaceAll("_", " ") : "Unknown");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function UserStatus({ status }) {
  return (
    <span className={`school-user-status school-user-status-${status || "unknown"}`}>
      {status || "Unknown"}
    </span>
  );
}

export default function SchoolUserDirectory() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadUsers = useCallback(async (signal) => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);

      const response = await apiRequest(
        `/school/users?${params.toString()}`,
        { accessToken, signal },
      );

      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error("The server returned an unexpected response.");
      }

      setUsers(response.data);
      setTotal(response.pagination?.total ?? response.data.length);
    } catch (requestError) {
      if (requestError.name === "AbortError") return;
      setUsers([]);
      setTotal(0);
      setError(requestError.message || "Unable to load school users.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [accessToken, page, roleFilter, search, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void loadUsers(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadUsers, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const updateFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  if (selectedUserId) {
    return <SchoolUserDetails userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  return (
    <section className="school-user-directory" aria-labelledby="school-user-heading">
      <div className="school-user-toolbar">
        <div>
          <h2 id="school-user-heading">School user directory</h2>
          <p>View the accounts belonging to your school.</p>
        </div>
        <div className="school-user-total" aria-live="polite">
          <strong>{total}</strong>
          <span>users found</span>
        </div>
      </div>

      <div className="school-user-filters">
        <label className="school-user-search">
          <span className="sr-only">Search school users</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
          />
        </label>
        <label className="school-user-filter">
          <span className="sr-only">Filter users by role</span>
          <select value={roleFilter} onChange={updateFilter(setRoleFilter)}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="school-user-filter">
          <span className="sr-only">Filter users by status</span>
          <select value={statusFilter} onChange={updateFilter(setStatusFilter)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="school-user-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="school-user-table-wrap">
        <table className="school-user-table">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Last login</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="school-user-message">Loading school users…</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="school-user-message">School users could not be loaded.</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="school-user-message">No users found. Try changing your search or filters.</td></tr>
            ) : users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong className="school-user-name">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user"}
                  </strong>
                  <span className="school-user-email">{user.email || "—"}</span>
                </td>
                <td className="school-user-role">{formatRole(user.role)}</td>
                <td><UserStatus status={user.status} /></td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td>{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="school-user-mobile-list" aria-live="polite">
        {loading ? <p>Loading school users…</p>
          : error ? <p>School users could not be loaded.</p>
            : users.length === 0 ? <p>No users found. Try changing your search or filters.</p>
              : users.map((user) => (
                <article className="school-user-mobile-card" key={user.id}>
                  <div className="school-user-mobile-heading">
                    <div>
                      <button type="button" className="school-user-name school-user-name-link" aria-label={`View details for ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user"}`} onClick={() => setSelectedUserId(user.id)}>{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user"}</button>
                      <span>{user.email || "—"}</span>
                    </div>
                    <UserStatus status={user.status} />
                  </div>
                  <div className="school-user-mobile-meta">
                    <span>Role: {formatRole(user.role)}</span>
                    <span>Last login: {formatDate(user.lastLoginAt)}</span>
                  </div>
                </article>
              ))}
      </div>

      <div className="school-user-pagination">
        <span>{total === 0 ? "No records" : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span>
        <div>
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}
