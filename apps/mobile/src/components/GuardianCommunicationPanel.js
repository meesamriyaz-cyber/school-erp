import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const options = [
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];

export function GuardianCommunicationPanel({ studentId }) {
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest(`/guardian-communications/students/${studentId}`);
      setContacts(Array.isArray(result?.data) ? result.data : []);
      setHistory(Array.isArray(result?.history) ? result.history : []);
    } catch (requestError) { setError(requestError?.message || "Unable to load guardian communication details."); }
    finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (value, values, setter) => setter(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);

  const send = async () => {
    setError("");
    setNotice("");
    if (!selected.length) { setError("Select at least one guardian."); return; }
    if (!channels.length) { setError("Select at least one delivery channel."); return; }
    if (!message.trim()) { setError("Enter a message before sending."); return; }
    setSending(true);
    try {
      const result = await apiRequest(`/guardian-communications/students/${studentId}`, {
        method: "POST",
        body: { guardianIds: selected, channels, subject, message },
      });
      const summary = result?.summary || {};
      setNotice(`Provider accepted: ${summary.accepted || 0} · Failed: ${summary.failed || 0} · Skipped: ${summary.skipped || 0}`);
      setMessage("");
      await load();
    } catch (requestError) { setError(requestError?.message || "Unable to send guardian communication."); }
    finally { setSending(false); }
  };

  return <View style={styles.card}>
    <Text style={styles.heading}>Guardian communication</Text>
    <Text style={styles.subheading}>Send a school update by SMS, WhatsApp or email. Only active guardians who receive communications can be selected.</Text>
    {loading ? <ActivityIndicator color={colors.primary}/> : <>
      {contacts.length ? contacts.map((item) => {
        const id = String(item.guardian?._id || "");
        const checked = selected.includes(id);
        return <TouchableOpacity key={item.relationshipId} style={styles.contact} disabled={!item.receivesCommunication || !id} onPress={() => toggle(id, selected, setSelected)}>
          <View style={[styles.check, checked && styles.checkActive]}><Text style={styles.checkText}>{checked ? "✓" : ""}</Text></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.name}>{[item.guardian?.firstName, item.guardian?.lastName].filter(Boolean).join(" ") || "Guardian"}{item.isPrimary ? " · Primary" : ""}</Text>
            <Text style={styles.meta}>{item.relationship?.replaceAll("_", " ")} · {item.guardian?.phone || "No phone"} · {item.guardian?.email || "No email"}</Text>
            {!item.receivesCommunication ? <Text style={styles.warning}>Communication disabled for this relationship</Text> : null}
          </View>
        </TouchableOpacity>;
      }) : <Text style={styles.meta}>No linked guardians found.</Text>}
      <Text style={styles.label}>Delivery channels</Text>
      <View style={styles.channelRow}>{options.map((item) => <TouchableOpacity key={item.key} style={[styles.channel, channels.includes(item.key) && styles.channelActive]} onPress={() => toggle(item.key, channels, setChannels)}><Text style={[styles.channelText, channels.includes(item.key) && styles.channelTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
      {channels.includes("email") ? <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Email subject (optional)" placeholderTextColor={colors.muted}/> : null}
      <TextInput style={[styles.input, styles.message]} value={message} onChangeText={setMessage} multiline textAlignVertical="top" placeholder="Write your message to the selected guardians…" placeholderTextColor={colors.muted}/>
      <TouchableOpacity style={[styles.sendButton, sending && { opacity: 0.6 }]} disabled={sending} onPress={send}>{sending ? <ActivityIndicator color={colors.white}/> : <Text style={styles.sendText}>Send communication</Text>}</TouchableOpacity>
    </>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <View style={styles.historyHeader}><Text style={styles.label}>Recent communication history</Text><TouchableOpacity onPress={load}><Text style={styles.refresh}>Refresh</Text></TouchableOpacity></View>
    {history.slice(0, 8).map((item) => <View key={item._id} style={styles.historyItem}>
      <Text style={styles.name}>{[item.guardianId?.firstName, item.guardianId?.lastName].filter(Boolean).join(" ") || "Guardian"} · {new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.meta} numberOfLines={2}>{item.message}</Text>
      <Text style={styles.meta}>{item.channels.map((entry) => `${entry.channel}: ${entry.providerStatus || entry.status}${entry.providerErrorCode ? ` (${entry.providerErrorCode})` : ""}`).join(" · ")}</Text>
    </View>)}
    {!loading && !history.length ? <Text style={styles.meta}>No communication has been sent yet.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: 12 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  subheading: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  contact: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  check: { width: 22, height: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { color: colors.white, fontWeight: "900" },
  name: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  warning: { color: colors.danger, fontSize: 10 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  channelRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  channel: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  channelActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  channelText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  channelTextActive: { color: colors.primary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, color: colors.ink, fontSize: 13 },
  message: { minHeight: 100 },
  sendButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 14, alignItems: "center" },
  sendText: { color: colors.white, fontWeight: "900" },
  error: { color: colors.danger, fontSize: 12 },
  notice: { color: colors.success, fontSize: 12, fontWeight: "700" },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  refresh: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  historyItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 4 },
});
