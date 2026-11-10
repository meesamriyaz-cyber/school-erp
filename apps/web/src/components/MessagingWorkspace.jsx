import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./MessagingWorkspace.css";

const displayName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "School user";
const dateTime = (value) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function MessagingWorkspace({ mode }) {
  const { accessToken } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [oversight, setOversight] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [studentSelections, setStudentSelections] = useState({});
  const [firstMessages, setFirstMessages] = useState({});
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (mode === "admin") {
        const response = await apiRequest("/messaging/oversight", { accessToken });
        if (!response?.success) throw new Error("Unable to load messaging oversight.");
        setOversight(response.data || []);
      } else {
        const [conversationResponse, contactResponse] = await Promise.all([
          apiRequest("/messaging/conversations", { accessToken }),
          apiRequest("/messaging/contacts", { accessToken }),
        ]);
        if (!conversationResponse?.success || !contactResponse?.success) throw new Error("Unable to load messaging workspace.");
        setConversations(conversationResponse.data || []);
        setContacts(contactResponse.data || []);
      }
    } catch (err) { setError(err.message || "Unable to load messaging workspace."); }
    finally { setLoading(false); }
  }, [accessToken, mode]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const openConversation = async (conversation) => {
    setActive(conversation); setMessages([]); setError("");
    try {
      const response = await apiRequest(`/messaging/conversations/${conversation._id}/messages`, { accessToken });
      if (!response?.success) throw new Error("Unable to load conversation messages.");
      setMessages(response.data || []);
      await apiRequest(`/messaging/conversations/${conversation._id}/read`, { method: "PATCH", accessToken, body: {} });
      setConversations((current) => current.map((item) => item._id === conversation._id
        ? { ...item, [mode === "parent" ? "parentUnreadCount" : "teacherUnreadCount"]: 0 } : item));
    } catch (err) { setError(err.message || "Unable to open this conversation."); }
  };

  const startConversation = async (contact) => {
    const studentId = studentSelections[contact.teacher._id] || contact.students?.[0]?._id;
    const message = firstMessages[contact.teacher._id] || "";
    if (!studentId || !message.trim()) { setError("Select a child and write the first message."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/messaging/conversations", {
        method: "POST", accessToken,
        body: { studentId, teacherId: contact.teacher._id, message },
      });
      if (!response?.success) throw new Error("Unable to start this conversation.");
      setNotice("Your message has been sent.");
      setFirstMessages((current) => ({ ...current, [contact.teacher._id]: "" }));
      await loadWorkspace();
      await openConversation(response.data);
    } catch (err) { setError(err.message || "Unable to start this conversation."); }
    finally { setBusy(false); }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!active || !reply.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await apiRequest(`/messaging/conversations/${active._id}/messages`, {
        method: "POST", accessToken, body: { body: reply },
      });
      if (!response?.success) throw new Error("Unable to send this message.");
      setMessages((current) => [...current, response.data]);
      setReply("");
      await loadWorkspace();
    } catch (err) { setError(err.message || "Unable to send this message."); }
    finally { setBusy(false); }
  };

  const closeConversation = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await apiRequest(`/messaging/conversations/${active._id}/close`, { method: "PATCH", accessToken, body: {} });
      setActive(null); setMessages([]); setNotice("Conversation closed.");
      await loadWorkspace();
    } catch (err) { setError(err.message || "Unable to close this conversation."); }
    finally { setBusy(false); }
  };

  const activeStudentName = useMemo(() => displayName(active?.studentId), [active]);

  if (mode === "admin") return <section className="messaging-workspace">
    <header className="messaging-heading"><div><span>SCHOOL OVERSIGHT</span><h2>Parent–teacher communication</h2><p>Conversation metadata only. Message contents are not available to administrators.</p></div><button type="button" onClick={() => void loadWorkspace()}>Refresh</button></header>
    {error && <p className="messaging-error" role="alert">{error}</p>}
    {loading ? <p className="messaging-empty">Loading conversation metadata…</p> : oversight.length === 0 ? <p className="messaging-empty">No conversations have been started.</p> : <div className="messaging-oversight-table"><table><thead><tr><th>Student</th><th>Parent</th><th>Teacher</th><th>Status</th><th>Last activity</th><th>Unread</th></tr></thead><tbody>{oversight.map((item) => <tr key={item._id}><td>{displayName(item.studentId)}</td><td>{displayName(item.parentUserId)}</td><td>{displayName(item.teacherUserId)}</td><td>{item.status}</td><td>{dateTime(item.lastMessageAt || item.updatedAt)}</td><td>{(item.parentUnreadCount || 0) + (item.teacherUnreadCount || 0)}</td></tr>)}</tbody></table></div>}
  </section>;

  return <section className="messaging-workspace">
    <header className="messaging-heading"><div><span>{mode === "parent" ? "FAMILY PORTAL" : "TEACHER WORKSPACE"}</span><h2>Parent–teacher messages</h2><p>{mode === "parent" ? "Contact teachers assigned to your child's current class." : "Respond to messages from parents of students in your active teaching assignments."}</p></div><button type="button" onClick={() => void loadWorkspace()}>Refresh</button></header>
    {error && <p className="messaging-error" role="alert">{error}</p>}
    {notice && <p className="messaging-notice" role="status">{notice}</p>}
    {mode === "parent" && contacts.length > 0 && <div className="messaging-contacts"><h3>Contact an assigned teacher</h3><div className="messaging-contact-grid">{contacts.map((contact, index) => <article className="messaging-contact-card" key={contact.teacher._id + String(contact.classId) + index}>
      <strong>{displayName(contact.teacher)}</strong><span>{contact.subject?.name || "Subject"} · Class assignment</span>
      <label>Child<select value={studentSelections[contact.teacher._id] || contact.students?.[0]?._id || ""} onChange={(event) => setStudentSelections((current) => ({ ...current, [contact.teacher._id]: event.target.value }))}>{contact.students?.map((student) => <option key={student._id} value={student._id}>{displayName(student)}</option>)}</select></label>
      <label>First message<textarea rows="3" maxLength="5000" value={firstMessages[contact.teacher._id] || ""} onChange={(event) => setFirstMessages((current) => ({ ...current, [contact.teacher._id]: event.target.value }))} placeholder="Write a message to the teacher…" /></label>
      <button type="button" disabled={busy || !(firstMessages[contact.teacher._id] || "").trim()} onClick={() => void startConversation(contact)}>Send message</button>
    </article>)}</div></div>}
    <div className="messaging-layout">
      <aside className="messaging-list"><h3>Conversations</h3>{loading ? <p>Loading…</p> : conversations.length === 0 ? <p>No open conversations yet.</p> : conversations.map((item) => {
        const unread = mode === "parent" ? item.parentUnreadCount : item.teacherUnreadCount;
        const other = mode === "parent" ? item.teacherUserId : item.parentUserId;
        return <button type="button" className={"messaging-conversation" + (active?._id === item._id ? " selected" : "")} key={item._id} onClick={() => void openConversation(item)}>
          <strong>{displayName(other)}</strong><span>{displayName(item.studentId)}</span><small>{item.lastMessagePreview || "Conversation started"} · {dateTime(item.lastMessageAt)}</small>{unread > 0 && <em>{unread} unread</em>}
        </button>;
      })}</aside>
      <div className="messaging-thread">{!active ? <div className="messaging-empty"><h3>Select a conversation</h3><p>Choose a conversation to read and reply.</p></div> : <>
        <header><div><h3>{displayName(mode === "parent" ? active.teacherUserId : active.parentUserId)}</h3><p>Regarding {activeStudentName}</p></div><button type="button" disabled={busy || active.status === "closed"} onClick={() => void closeConversation()}>Close conversation</button></header>
        <div className="messaging-message-list">{messages.map((item) => <article key={item._id} className={"messaging-message" + (String(item.senderUserId) === String(active.parentUserId?._id || active.parentUserId) && mode === "parent" || String(item.senderUserId) === String(active.teacherUserId?._id || active.teacherUserId) && mode === "teacher" ? " own" : "")}>
          <p>{item.body}</p><small>{item.senderRole === "parent" ? "Parent" : "Teacher"} · {dateTime(item.createdAt)}{item.readAt ? " · Read" : ""}</small>
        </article>)}</div>
        {active.status === "open" ? <form className="messaging-reply" onSubmit={sendReply}><textarea rows="3" maxLength="5000" required value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write your reply…" /><button type="submit" disabled={busy || !reply.trim()}>{busy ? "Sending…" : "Send reply"}</button></form> : <p className="messaging-closed">This conversation is closed.</p>}
      </>}</div>
    </div>
  </section>;
}
