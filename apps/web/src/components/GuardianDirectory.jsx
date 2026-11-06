import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./GuardianDirectory.css";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function fullName(guardian) {
  return [guardian.firstName, guardian.lastName].filter(Boolean).join(" ") || "Unnamed guardian";
}

function GuardianStatus({ status }) {
  return (
    <span className={`guardian-directory-status guardian-directory-status-${status || "unknown"}`}>
      {status || "Unknown"}
    </span>
  );
}

export default function GuardianDirectory() {
  const { accessToken } = useAuth();
  const [guardians, setGuardians] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGuardians() {
      setLoading(true);
      setError("");
      try {
        const response = await apiRequest("/guardians", {
          accessToken,
          signal: controller.signal,
        });
        if (!response?.success || !Array.isArray(response.data)) {
          throw new Error("The server returned an unexpected guardian directory response.");
        }
        if (!controller.signal.aborted) setGuardians(response.data);
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !controller.signal.aborted) {
          setGuardians([]);
          setError(requestError.message || "Unable to load guardians.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadGuardians();
    return () => controller.abort();
  }, [accessToken, refreshKey]);

  const filteredGuardians = useMemo(() => {
    const query = searchInput.trim().toLocaleLowerCase();
    return guardians.filter((guardian) => {
      if (statusFilter && guardian.status !== statusFilter) return false;
      if (!query) return true;
      return [
        guardian.firstName,
        guardian.lastName,
        guardian.phone,
        guardian.email,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    });
  }, [guardians, searchInput, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredGuardians.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleGuardians = filteredGuardians.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const updateSearch = (value) => {
    setSearchInput(value);
    setPage(1);
  };

  const updateStatus = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <section className="guardian-directory" aria-labelledby="guardian-directory-heading">
      <div className="guardian-directory-toolbar">
        <div>
          <h2 id="guardian-directory-heading">Guardian directory</h2>
          <p>View guardian contact records registered with your school.</p>
        </div>
        <div className="guardian-directory-total" aria-live="polite">
          <strong>{filteredGuardians.length}</strong>
          <span>{filteredGuardians.length === 1 ? "guardian" : "guardians"} found</span>
        </div>
      </div>

      <div className="guardian-directory-filters">
        <label className="guardian-directory-search">
          <span className="sr-only">Search guardians</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search name, phone or email…"
          />
        </label>
        <label className="guardian-directory-status-filter">
          <span className="sr-only">Filter guardians by status</span>
          <select value={statusFilter} onChange={(event) => updateStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="guardian-directory-refresh"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="guardian-directory-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Retry</button>
        </div>
      )}

      <div className="guardian-directory-table-wrap">
        <table className="guardian-directory-table">
          <thead>
            <tr>
              <th scope="col">Guardian</th>
              <th scope="col">Phone</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="guardian-directory-message">Loading guardians…</td></tr>
            ) : error ? (
              <tr><td colSpan={4} className="guardian-directory-message">Guardian records could not be loaded.</td></tr>
            ) : visibleGuardians.length === 0 ? (
              <tr><td colSpan={4} className="guardian-directory-message">No guardians found. Try changing your search or filters.</td></tr>
            ) : visibleGuardians.map((guardian) => (
              <tr key={guardian._id}>
                <td><strong>{fullName(guardian)}</strong></td>
                <td>{guardian.phone || "—"}</td>
                <td>{guardian.email || "—"}</td>
                <td><GuardianStatus status={guardian.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="guardian-directory-mobile-list" aria-live="polite">
        {loading ? <p>Loading guardians…</p>
          : error ? <p>Guardian records could not be loaded.</p>
            : visibleGuardians.length === 0 ? <p>No guardians found. Try changing your search or filters.</p>
              : visibleGuardians.map((guardian) => (
                <article className="guardian-directory-mobile-card" key={guardian._id}>
                  <div className="guardian-directory-mobile-heading">
                    <strong>{fullName(guardian)}</strong>
                    <GuardianStatus status={guardian.status} />
                  </div>
                  <span>Phone: {guardian.phone || "—"}</span>
                  <span>Email: {guardian.email || "—"}</span>
                </article>
              ))}
      </div>

      <div className="guardian-directory-pagination">
        <span>
          {filteredGuardians.length === 0
            ? "No records"
            : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredGuardians.length)} of ${filteredGuardians.length}`}
        </span>
        <div>
          <button type="button" disabled={currentPage <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}
