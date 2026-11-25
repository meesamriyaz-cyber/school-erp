import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import "./GuardianCommunicationPanel.css";

const CHANNELS = [
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
];

function guardianName(guardian) {
  return [guardian?.firstName, guardian?.lastName].filter(Boolean).join(" ") || "Guardian";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function GuardianCommunicationPanel({ studentId, accessToken }) {
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState([]);
  const [channels, setChannels] = useState(["sms", "whatsapp", "email"]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest(
        `/guardian-communications/students/${encodeURIComponent(studentId)}`,
        { accessToken, signal },
      );
      if (!response?.success) throw new Error(response?.message || "Unable to load guardian communication.");
      setContacts(Array.isArray(response.data) ? response.data : []);
      setHistory(Array.isArray(response.history) ? response.history : []);
      setSelected((current) => current.filter((id) => (response.data || []).some(
        (item) => String(item.guardian?._id) === id && item.receivesCommunication,
      )));
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message || "Unable to load guardian communication.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [studentId, accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const toggleGuardian = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const toggleChannel = (channel) => {
    setChannels((current) => current.includes(channel)
      ? current.filter((value) => value !== channel)
      : [...current, channel]);
  };

  const send = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selected.length) return setError("Select at least one opted-in guardian.");
    if (!channels.length) return setError("Select at least one delivery channel.");
    if (!message.trim()) return setError("Enter a message before sending.");
    setSending(true);
    try {
      const response = await apiRequest(
        `/guardian-communications/students/${encodeURIComponent(studentId)}`,
        { method: "POST", accessToken, body: { guardianIds: selected, channels, subject, message } },
      );
      const summary = response?.summary || {};
      setNotice(`Provider accepted: ${summary.accepted || 0} · Failed: ${summary.failed || 0} · Skipped: ${summary.skipped || 0}. Accepted means queued by the provider, not confirmed delivered.`);
      setMessage("");
      await load();
    } catch (requestError) {
      setError(requestError.message || "Unable to send communication.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="guardian-communication-card" aria-labelledby="guardian-communication-title">
      <div className="guardian-communication-heading">
        <div>
          <h3 id="guardian-communication-title">Guardian Communication</h3>
          <p>Send a school update to linked guardians by SMS, WhatsApp or email.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || sending}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading ? <p role="status">Loading linked guardians…</p> : (
        <form onSubmit={send}>
          <fieldset className="guardian-communication-guardians">
            <legend>Recipients</legend>
            {contacts.length === 0 ? <p>No linked guardians found for this student.</p> : contacts.map((item) => {
              const id = String(item.guardian?._id || "");
              const eligible = Boolean(id && item.receivesCommunication);
              return (
                <label className={`guardian-communication-contact${eligible ? "" : " is-disabled"}`} key={item.relationshipId}>
                  <input type="checkbox" checked={selected.includes(id)} disabled={!eligible} onChange={() => toggleGuardian(id)} />
                  <span className="guardian-communication-contact-copy">
                    <strong>{guardianName(item.guardian)}{item.isPrimary ? " · Primary" : ""}</strong>
                    <span>{item.relationship?.replaceAll("_", " ") || "Guardian"} · {item.guardian?.phone || "No phone"} · {item.guardian?.email || "No email"}</span>
                    <span className="guardian-communication-preferences">
                      Channels: {(item.communicationChannels || []).map((channel) => channel.toUpperCase()).join(", ") || "None enabled"}
                    </span>
                    {!eligible && <span className="guardian-communication-warning">Communication disabled for this relationship</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <fieldset className="guardian-communication-channels">
            <legend>Delivery channels</legend>
            <div className="guardian-communication-channel-options">
              {CHANNELS.map((channel) => (
                <label className={channels.includes(channel.value) ? "is-selected" : ""} key={channel.value}>
                  <input type="checkbox" checked={channels.includes(channel.value)} onChange={() => toggleChannel(channel.value)} />
                  {channel.label}
                </label>
              ))}
            </div>
          </fieldset>

          {channels.includes("email") && (
            <label className="guardian-communication-field">
              <span>Email subject (optional)</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder="School update" />
            </label>
          )}
          <label className="guardian-communication-field">
            <span>Message</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={5000} required placeholder="Write your message to the selected guardians…" />
            <small>{message.length}/5000 characters</small>
          </label>
          <div className="guardian-communication-submit-row">
            <span>{selected.length} guardian(s) selected</span>
            <button type="submit" disabled={sending || loading}>{sending ? "Sending…" : "Send communication"}</button>
          </div>
        </form>
      )}

      {error && <p className="guardian-communication-error" role="alert">{error}</p>}
      {notice && <p className="guardian-communication-notice" role="status">{notice}</p>}

      <div className="guardian-communication-history">
        <h4>Recent communication history</h4>
        {history.length === 0 ? <p>No communication has been sent yet.</p> : history.slice(0, 10).map((item) => (
          <article key={item._id}>
            <div className="guardian-communication-history-top">
              <strong>{guardianName(item.guardianId)}</strong>
              <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
            </div>
            <p>{item.message}</p>
            <div className="guardian-communication-outcomes">
              {(item.channels || []).map((outcome, index) => (
                <span key={`${item._id}-${outcome.channel}-${index}`} className={`status-${outcome.status}`}>
                  {outcome.channel.toUpperCase()}: {outcome.status}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
