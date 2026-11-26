import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const personName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "School user";
const dateTime = (value) => value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export function ParentMessagingScreen() {
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState({});
  const [firstMessages, setFirstMessages] = useState({});
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [conversationResponse, contactResponse] = await Promise.all([
        apiRequest("/messaging/conversations"),
        apiRequest("/messaging/contacts"),
      ]);
      if (!conversationResponse?.success || !contactResponse?.success) {
        throw new Error("Unable to load parent–teacher messages.");
      }
      setConversations(Array.isArray(conversationResponse.data) ? conversationResponse.data : []);
      setContacts(Array.isArray(contactResponse.data) ? contactResponse.data : []);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load parent–teacher messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const openConversation = async (conversation) => {
    setActive(conversation);
    setMessages([]);
    setError("");
    try {
      const response = await apiRequest(`/messaging/conversations/${conversation._id}/messages`);
      if (!response?.success) throw new Error("Unable to load this conversation.");
      setMessages(Array.isArray(response.data) ? response.data : []);
      await apiRequest(`/messaging/conversations/${conversation._id}/read`, { method: "PATCH", body: {} });
      setConversations((current) => current.map((item) => item._id === conversation._id
        ? { ...item, parentUnreadCount: 0 } : item));
    } catch (requestError) {
      setError(requestError?.message || "Unable to open this conversation.");
    }
  };

  const startConversation = async (contact) => {
    const teacherId = contact.teacher?._id;
    const studentId = selectedStudents[teacherId] || contact.students?.[0]?._id;
    const message = firstMessages[teacherId] || "";
    if (!studentId || !message.trim()) {
      setError("Choose a child and write a first message.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest("/messaging/conversations", {
        method: "POST",
        body: { studentId, teacherId, message: message.trim() },
      });
      if (!response?.success) throw new Error("Unable to start this conversation.");
      setFirstMessages((current) => ({ ...current, [teacherId]: "" }));
      setNotice("Your message has been sent.");
      await loadWorkspace();
      await openConversation(response.data);
    } catch (requestError) {
      setError(requestError?.message || "Unable to start this conversation.");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!active || !reply.trim() || active.status !== "open") return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest(`/messaging/conversations/${active._id}/messages`, {
        method: "POST",
        body: { body: reply.trim() },
      });
      if (!response?.success) throw new Error("Unable to send your reply.");
      setMessages((current) => [...current, response.data]);
      setReply("");
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError?.message || "Unable to send your reply.");
    } finally {
      setBusy(false);
    }
  };

  const closeConversation = async () => {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest(`/messaging/conversations/${active._id}/close`, { method: "PATCH", body: {} });
      if (!response?.success) throw new Error("Unable to close this conversation.");
      setActive((current) => current ? { ...current, status: "closed" } : null);
      setNotice("Conversation closed.");
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError?.message || "Unable to close this conversation.");
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.container}>
    <View style={styles.heading}>
      <Text style={styles.title}>Parent–teacher messages</Text>
      <Text style={styles.subtitle}>Contact teachers assigned to your child's current class.</Text>
      <TouchableOpacity onPress={loadWorkspace} style={styles.refresh}><Text style={styles.refreshText}>Refresh messages</Text></TouchableOpacity>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}

    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Contact an assigned teacher</Text>
      {loading ? <ActivityIndicator color={colors.primary}/> : contacts.length ? contacts.map((contact, index) => {
        const teacherId = contact.teacher?._id || String(index);
        const selected = selectedStudents[teacherId] || contact.students?.[0]?._id || "";
        return <View key={teacherId + String(contact.classId || index)} style={styles.contact}>
          <Text style={styles.person}>{personName(contact.teacher)}</Text>
          <Text style={styles.muted}>{contact.subject?.name || "Subject"} · Assigned class</Text>
          <Text style={styles.fieldLabel}>Child</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.studentChoices}>
            {(contact.students || []).map((student) => <TouchableOpacity key={student._id} onPress={() => setSelectedStudents((current) => ({ ...current, [teacherId]: student._id }))} style={[styles.choice, selected === student._id && styles.choiceActive]}>
              <Text style={[styles.choiceText, selected === student._id && styles.choiceTextActive]}>{personName(student)}</Text>
            </TouchableOpacity>)}
          </ScrollView>
          <TextInput value={firstMessages[teacherId] || ""} onChangeText={(value) => setFirstMessages((current) => ({ ...current, [teacherId]: value }))} placeholder="Write your first message…" multiline maxLength={5000} style={styles.input}/>
          <TouchableOpacity disabled={busy || !(firstMessages[teacherId] || "").trim() || !selected} onPress={() => startConversation(contact)} style={[styles.primary, (busy || !(firstMessages[teacherId] || "").trim() || !selected) && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? "Sending…" : "Send message"}</Text>
          </TouchableOpacity>
        </View>;
      }) : <Text style={styles.muted}>No teachers are currently assigned to your linked children's classes.</Text>}
    </View>

    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Conversations</Text>
      {loading ? <ActivityIndicator color={colors.primary}/> : conversations.length ? conversations.map((item) => <TouchableOpacity key={item._id} onPress={() => openConversation(item)} style={[styles.conversation, active?._id === item._id && styles.conversationActive]}>
        <View style={styles.conversationTop}><Text style={styles.person}>{personName(item.teacherUserId)}</Text><Text style={styles.muted}>{item.status}</Text></View>
        <Text style={styles.muted}>Regarding {personName(item.studentId)}</Text>
        <Text numberOfLines={2} style={styles.preview}>{item.lastMessagePreview || "Conversation started"} · {dateTime(item.lastMessageAt)}</Text>
        {Number(item.parentUnreadCount) > 0 ? <Text style={styles.unread}>{item.parentUnreadCount} unread</Text> : null}
      </TouchableOpacity>) : <Text style={styles.muted}>No conversations yet. Contact an assigned teacher to get started.</Text>}
    </View>

    {active ? <View style={styles.panel}>
      <View style={styles.conversationTop}><View style={{flex:1}}><Text style={styles.panelTitle}>{personName(active.teacherUserId)}</Text><Text style={styles.muted}>Regarding {personName(active.studentId)}</Text></View>
        {active.status === "open" ? <TouchableOpacity disabled={busy} onPress={closeConversation}><Text style={styles.closeText}>Close</Text></TouchableOpacity> : null}
      </View>
      {messages.length ? messages.map((item) => <View key={item._id} style={[styles.message, String(item.senderUserId) === String(active.parentUserId?._id || active.parentUserId) && styles.ownMessage]}>
        <Text style={styles.messageBody}>{item.body}</Text>
        <Text style={styles.messageMeta}>{item.senderRole === "parent" ? "You" : "Teacher"} · {dateTime(item.createdAt)}</Text>
      </View>) : <Text style={styles.muted}>No messages in this conversation yet.</Text>}
      {active.status === "open" ? <>
        <TextInput value={reply} onChangeText={setReply} placeholder="Write a reply…" multiline maxLength={5000} style={styles.input}/>
        <TouchableOpacity disabled={busy || !reply.trim()} onPress={sendReply} style={[styles.primary, (busy || !reply.trim()) && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Sending…" : "Send reply"}</Text></TouchableOpacity>
      </> : <Text style={styles.muted}>This conversation is closed.</Text>}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  heading: { gap: 6 },
  title: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  refresh: { alignSelf: "flex-start", paddingVertical: 6 },
  refreshText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, gap: 12 },
  panelTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  contact: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 },
  person: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  studentChoices: { gap: 7, paddingVertical: 3 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 8 },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  choiceTextActive: { color: colors.white },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, color: colors.ink, textAlignVertical: "top" },
  primary: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 12, alignItems: "center" },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  conversation: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11, gap: 5 },
  conversationActive: { backgroundColor: colors.primarySoft, padding: 9, borderRadius: radius.md },
  conversationTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  preview: { color: colors.ink, fontSize: 11, lineHeight: 16 },
  unread: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  message: { alignSelf: "flex-start", maxWidth: "92%", backgroundColor: colors.background, borderRadius: radius.md, padding: 11, gap: 5 },
  ownMessage: { alignSelf: "flex-end", backgroundColor: colors.primarySoft },
  messageBody: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  messageMeta: { color: colors.muted, fontSize: 10 },
  closeText: { color: colors.danger, fontWeight: "800", fontSize: 12 },
  error: { color: colors.danger, backgroundColor: "#FDECEC", padding: 10, borderRadius: radius.md, fontSize: 12 },
  notice: { color: colors.success, backgroundColor: "#E6F5ED", padding: 10, borderRadius: radius.md, fontSize: 12 },
});
