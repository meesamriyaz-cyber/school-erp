import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./PortalAccountLink.css";

export default function PortalAccountLink({ record, recordType, onLinked }) {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const role = recordType === "student" ? "student" : "parent";
  const endpoint = recordType === "student" ? "/students" : "/guardians";
  const recordId = record?._id;

  useEffect(() => {
    if (!recordId || record?.userId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiRequest("/school/users?role=" + role + "&status=active&limit=100&page=1", {
      accessToken, signal: controller.signal,
    }).then((response) => {
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error("Unable to load active portal accounts.");
      }
      if (!controller.signal.aborted) setUsers(response.data);
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message || "Unable to load portal accounts.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [accessToken, recordId, record?.userId, role]);

  const linkAccount = async () => {
    if (!selectedUserId || !recordId) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest(endpoint + "/" + encodeURIComponent(recordId) + "/account", {
        method: "POST",
        accessToken,
        body: { userId: selectedUserId },
      });
      if (!response?.success || !response.data?.userId) {
        throw new Error(response?.message || "Unable to link this account.");
      }
      onLinked?.(response.data);
    } catch (requestError) {
      setError(requestError.message || "Unable to link this account.");
    } finally {
      setSaving(false);
    }
  };

  if (record?.userId) {
    return <div className="portal-account-linked" role="status"> <span>✓ Portal account linked</span> </div>;
  }

  return (
    <div className="portal-account-link">
      <label>
        {recordType === "student" ? "Student login account" : "Parent login account"}
        <select
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          disabled={loading || saving || users.length === 0}
        >
          <option value="">{loading ? "Loading active accounts…" : users.length ? "Select an active account" : "No active accounts available"}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {[user.firstName, user.lastName].filter(Boolean).join(" ") + " · " + user.email}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={linkAccount} disabled={!selectedUserId || saving || loading}>
        {saving ? "Linking…" : "Link account"}
      </button>
      {error && <span className="portal-account-link-error" role="alert">{error}</span>}
      {recordType === "guardian" && record?.email && (
        <small>Only a parent account with the same email address can be linked.</small>
      )}
    </div>
  );
}
