import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const personName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "School user";
const dateTime = (value) => value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export function TeacherMessagingScreen() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest("/messaging/conversations");
      if (!response?.success) throw new Error("Unable to load parent messages.");
      setConversations(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load parent messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

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
        ? { ...item, teacherUnreadCount: 0 } : item));
    } catch (requestError) {
      setError(requestError?.message || "Unable to open this conversation.");
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
      await loadConversations();
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
      await loadConversations();
    } catch (requestError) {
      setError(requestError?.message || "Unable to close this conversation.");
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.container}>
    <View style={styles.heading}>
      <Text style={styles.title}>Parent messages</Text>
      <Text style={styles.subtitle}>Respond to messages from parents of students in your active teaching assignments.</Text>
      <TouchableOpacity onPress={loadConversations} style={styles.refresh}><Text style={styles.refreshText}>Refresh inbox</Text></TouchableOpacity>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Conversations</Text>
      {loading ? <ActivityIndicator color={colors.primary}/> : conversations.length ? conversations.map((item) => <TouchableOpacity key={item._id} onPress={() => openConversation(item)} style={[styles.conversation, active?._id === item._id && styles.conversationActive]}>
        <View style={styles.conversationTop}><Text style={styles.person}>{personName(item.parentUserId)}</Text><Text style={styles.muted}>{item.status}</Text></View>
        <Text style={styles.muted}>Regarding {personName(item.studentId)}</Text>
        <Text numberOfLines={2} style={styles.preview}>{item.lastMessagePreview || "Conversation started"} · {dateTime(item.lastMessageAt)}</Text>
        {Number(item.teacherUnreadCount) > 0 ? <Text style={styles.unread}>{item.teacherUnreadCount} unread</Text> : null}
      </TouchableOpacity>) : <Text style={styles.muted}>No parent conversations yet.</Text>}
    </View>
    {active ? <View style={styles.panel}>
      <View style={styles.conversationTop}><View style={{flex:1}}><Text style={styles.panelTitle}>{personName(active.parentUserId)}</Text><Text style={styles.muted}>Regarding {personName(active.studentId)}</Text></View>
        {active.status === "open" ? <TouchableOpacity disabled={busy} onPress={closeConversation}><Text style={styles.closeText}>Close</Text></TouchableOpacity> : null}
      </View>
      {messages.length ? messages.map((item) => <View key={item._id} style={[styles.message, String(item.senderUserId) === String(active.teacherUserId?._id || active.teacherUserId) && styles.ownMessage]}>
        <Text style={styles.messageBody}>{item.body}</Text>
        <Text style={styles.messageMeta}>{item.senderRole === "teacher" ? "You" : "Parent"} · {dateTime(item.createdAt)}</Text>
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
  person: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  conversation: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11, gap: 5 },
  conversationActive: { backgroundColor: colors.primarySoft, padding: 9, borderRadius: radius.md },
  conversationTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  preview: { color: colors.ink, fontSize: 11, lineHeight: 16 },
  unread: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  message: { alignSelf: "flex-start", maxWidth: "92%", backgroundColor: colors.background, borderRadius: radius.md, padding: 11, gap: 5 },
  ownMessage: { alignSelf: "flex-end", backgroundColor: colors.primarySoft },
  messageBody: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  messageMeta: { color: colors.muted, fontSize: 10 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, color: colors.ink, textAlignVertical: "top" },
  primary: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 12, alignItems: "center" },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  closeText: { color: colors.danger, fontWeight: "800", fontSize: 12 },
  error: { color: colors.danger, backgroundColor: "#FDECEC", padding: 10, borderRadius: radius.md, fontSize: 12 },
  notice: { color: colors.success, backgroundColor: "#E6F5ED", padding: 10, borderRadius: radius.md, fontSize: 12 },
});
