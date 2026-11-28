import { useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./PortalAccountLink.css";

export default function PortalAccountLink({ record, recordType, onLinked }) {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const role = recordType === "student" ? "student" : "parent";
  const endpoint = recordType === "student" ? "/students" : "/guardians";
  const recordId = record?._id;

  const openLinker = async () => {
    setExpanded(true);
    setError("");
    if (users.length) return;
    setLoading(true);
    try {
      const response = await apiRequest("/school/users?role=" + role + "&status=active&limit=100&page=1", { accessToken });
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error("Unable to load active portal accounts.");
      }
      const eligible = recordType === "guardian" && record?.email
        ? response.data.filter((user) => user.email?.toLowerCase() === record.email.toLowerCase())
        : response.data;
      setUsers(eligible);
      if (!eligible.length) setError(recordType === "guardian" && record?.email
        ? "No active parent account matches this guardian’s email address."
        : "No active accounts with the required role are available.");
    } catch (requestError) {
      setError(requestError.message || "Unable to load portal accounts.");
    } finally {
      setLoading(false);
    }
  };

  const linkAccount = async () => {
    if (!selectedUserId || !recordId) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest(endpoint + "/" + encodeURIComponent(recordId) + "/account", {
        method: "POST", accessToken, body: { userId: selectedUserId },
      });
      if (!response?.success || !response.data?.userId) {
        throw new Error(response?.message || "Unable to link this account.");
      }
      onLinked?.(response.data);
      setExpanded(false);
    } catch (requestError) {
      setError(requestError.message || "Unable to link this account.");
    } finally {
      setSaving(false);
    }
  };

  if (record?.userId) {
    return <div className="portal-account-linked" role="status"><span>✓ Portal account linked</span></div>;
  }

  return (
    <div className="portal-account-link">
      {!expanded ? (
        <button type="button" onClick={openLinker}>Link portal account</button>
      ) : (
        <>
          <label>
            {recordType === "student" ? "Student login account" : "Parent login account"}
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={loading || saving || users.length === 0}>
              <option value="">{loading ? "Loading active accounts…" : users.length ? "Select an active account" : "No eligible accounts"}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") + " · " + user.email}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={linkAccount} disabled={!selectedUserId || saving || loading}>{saving ? "Linking…" : "Confirm link"}</button>
          <button type="button" className="portal-account-cancel" onClick={() => { setExpanded(false); setError(""); }} disabled={saving}>Cancel</button>
        </>
      )}
      {error && <span className="portal-account-link-error" role="alert">{error}</span>}
      {recordType === "guardian" && record?.email && <small>Only a parent account with the same email address is eligible.</small>}
    </div>
  );
}
