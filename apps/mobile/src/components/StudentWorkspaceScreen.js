import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const sections = [
  { key: "overview", label: "Overview" },
  { key: "learning", label: "Learning" },
  { key: "attendance", label: "Attendance" },
  { key: "fees", label: "Fees" },
  { key: "results", label: "Results" },
  { key: "timetable", label: "Timetable" },
  { key: "documents", label: "Documents" },
  { key: "notices", label: "Notices" },
];

const list = (response) => Array.isArray(response?.data) ? response.data : [];
const titleOf = (item, fallback) => item?.title || item?.name || item?.subject || item?.fileName || fallback;
const dateOf = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function DataRow({ title, subtitle, trailing, onPress }) {
  const body = <View style={styles.row}>
    <View style={styles.rowMain}><Text style={styles.rowTitle}>{title}</Text>{subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}</View>
    {trailing ? <Text style={styles.rowTrailing}>{trailing}</Text> : null}
  </View>;
  return onPress ? <TouchableOpacity onPress={onPress}>{body}</TouchableOpacity> : body;
}

function Panel({ title, subtitle, children }) {
  return <View style={styles.panel}><View><Text style={styles.panelTitle}>{title}</Text>{subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}</View>{children}</View>;
}

export function StudentWorkspaceScreen({ user }) {
  const [section, setSection] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [partialErrors, setPartialErrors] = useState([]);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({ profile: [], homework: [], submissions: [], attendance: [], fees: [], results: [], timetable: [], documents: [], notices: [], notifications: [] });

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const endpoints = [
        ["profile", "/portal/profile"], ["homework", "/portal/homework"],
        ["submissions", "/portal/homework-submissions"], ["attendance", "/portal/attendance"],
        ["fees", "/portal/fees"], ["results", "/portal/results"],
        ["timetable", "/portal/timetable"], ["documents", "/portal/documents"],
        ["notices", "/portal/announcements"], ["notifications", "/portal/notifications"],
      ];
      const responses = await Promise.allSettled(endpoints.map(([, endpoint]) => apiRequest(endpoint)));
      const next = {};
      const failures = [];
      endpoints.forEach(([key], index) => {
        const result = responses[index];
        if (result.status === "fulfilled") next[key] = result.value;
        else { next[key] = null; failures.push(key); }
      });
      setData((previous) => ({ ...previous, ...next }));
      setPartialErrors(failures);

    } catch (requestError) {
      setError(requestError?.message || "Unable to load your student workspace.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const profile = data.profile?.data?.[0] || null;
  const student = profile?.student || null;
  const enrollment = profile?.currentEnrollment || null;
  const attendanceSummary = data.attendance?.summary || {};
  const feeSummary = data.fees?.summary || {};
  const homework = list(data.homework);
  const submissions = list(data.submissions);
  const fees = list(data.fees);
  const results = list(data.results);
  const timetable = data.timetable?.data?.flatMap((item) => item.entries || []) || [];
  const documents = list(data.documents);
  const notices = list(data.notices);
  const notifications = list(data.notifications);

  const submissionByHomework = useMemo(() => new Map(submissions.map((item) => [String(item.homeworkId?._id || item.homeworkId), item])), [submissions]);

  const renderRows = (items, empty, mapper) => items.length
    ? items.map((item, index) => {
        const row = mapper(item, index);
        return <DataRow key={String(item._id || index)} {...row}/>;
      })
    : <Text style={styles.empty}>{empty}</Text>;

  return <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary}/>}>
    <View style={styles.welcomeBanner}>
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerKicker}>YOUR SCHOOL AT A GLANCE</Text>
        <Text style={styles.bannerTitle}>Hello, {user?.firstName || student?.firstName || "Student"}!</Text>
        <Text style={styles.bannerSubtitle}>Your learning journey, school records and updates—all in one place.</Text>
        {enrollment ? <View style={styles.classPill}><Text style={styles.classPillText}>{[enrollment.classId?.name, enrollment.sectionId?.name, enrollment.academicYearId?.name].filter(Boolean).join(" · ")}</Text></View> : null}
      </View>
      <View style={styles.bannerOrb}><Text style={styles.bannerOrbText}>✦</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {sections.map((item) => <TouchableOpacity key={item.key} onPress={() => setSection(item.key)} style={[styles.tab, section === item.key && styles.tabActive]}><Text style={[styles.tabText, section === item.key && styles.tabTextActive]}>{item.label}</Text></TouchableOpacity>)}
    </ScrollView>

    {loading && !student && !error ? <View style={styles.state}><ActivityIndicator color={colors.primary}/><Text style={styles.empty}>Loading your school information…</Text></View> : null}
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => load()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View> : null}
    {partialErrors.length > 0 && !loading ? <View style={styles.partialNotice}><Text style={styles.partialNoticeText}>Some sections could not be loaded: {partialErrors.join(", ")}. Pull down to retry.</Text></View> : null}

    {!loading && !error && section === "overview" ? <>
      <Panel title="My profile" subtitle={student?.admissionNumber || "Student account"}>
        <DataRow title={[student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Student"} subtitle={[enrollment?.classId?.name, enrollment?.sectionId?.name, enrollment?.academicYearId?.name].filter(Boolean).join(" · ") || "Class placement not available"}/>
      </Panel>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{attendanceSummary.percentage == null ? "—" : attendanceSummary.percentage + "%"}</Text><Text style={styles.metricLabel}>Attendance</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{homework.length}</Text><Text style={styles.metricLabel}>Homework</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{money(feeSummary.balance)}</Text><Text style={styles.metricLabel}>Fee balance</Text></View>
      </View>
      <Panel title="Latest notices" subtitle="Updates from your school">{renderRows(notices.slice(0, 4), "No current school notices.", (item) => ({ title: titleOf(item, "School notice"), subtitle: item.body || item.category || "" }))}</Panel>
      <Panel title="Recent notifications">{renderRows(notifications.slice(0, 4), "You have no new notifications.", (item) => ({ title: item.title || "School update", subtitle: item.body || dateOf(item.createdAt) }))}</Panel>
    </> : null}

    {!loading && !error && section === "learning" ? <>
      <Panel title="Homework & assignments" subtitle="Work assigned to your class">
        {homework.length ? homework.map((item) => {
          const submission = submissionByHomework.get(String(item._id));
          return <DataRow key={String(item._id)} title={titleOf(item, "Homework")} subtitle={[item.subjectId?.name, item.dueDate ? "Due " + dateOf(item.dueDate) : ""].filter(Boolean).join(" · ")} trailing={submission?.status || "Submit"} onPress={() => { setSelectedHomework(item); setAnswer(submission?.answer || ""); }}/>;
        }) : <Text style={styles.empty}>No homework has been assigned yet.</Text>}
      </Panel>
      <Panel title="My submissions">{renderRows(submissions, "No submissions yet.", (item) => ({ title: item.homeworkId?.title || "Assignment submission", subtitle: [item.status, item.submittedAt ? dateOf(item.submittedAt) : ""].filter(Boolean).join(" · "), trailing: item.marksObtained != null ? String(item.marksObtained) + "/" + item.maxMarks : "" }))}</Panel>
    </> : null}

    {!loading && !error && section === "attendance" ? <Panel title="Attendance record" subtitle={`${attendanceSummary.percentage == null ? "No percentage available" : attendanceSummary.percentage + "% attendance"} · ${attendanceSummary.marked || 0} marked records`}>
      <View style={styles.metrics}>{["present", "absent", "late", "excused"].map((key) => <View style={styles.metric} key={key}><Text style={styles.metricValue}>{attendanceSummary[key] || 0}</Text><Text style={styles.metricLabel}>{key}</Text></View>)}</View>
      {renderRows(list(data.attendance).slice(0, 30), "No attendance records found.", (item) => ({ title: dateOf(item.date) || "Attendance", subtitle: item.remarks || "", trailing: item.status || "" }))}
    </Panel> : null}

    {!loading && !error && section === "fees" ? <Panel title="Fees & payments" subtitle={`${feeSummary.invoiceCount || 0} invoices · Balance ${money(feeSummary.balance)}`}>
      {fees.length ? fees.map((item) => {
        const expanded = expandedInvoiceId === String(item._id);
        return <View key={String(item._id)}>
          <DataRow title={item.invoiceNumber || item.feeStructureId?.name || "Fee invoice"} subtitle={[item.academicYearId?.name, item.dueDate ? "Due " + dateOf(item.dueDate) : "", item.status].filter(Boolean).join(" · ")} trailing={money(item.balance ?? Math.max(0, (item.totalAmount || 0) - (item.paidAmount || 0)))} onPress={() => setExpandedInvoiceId(expanded ? null : String(item._id))}/>
          {expanded ? <View style={styles.invoiceDetails}>
            <Text style={styles.rowSubtitle}>Total {money(item.totalAmount)} · Paid {money(item.paidAmount)} · Balance {money(item.balance)}</Text>
            {(item.items || []).map((line, index) => <Text key={index} style={styles.rowSubtitle}>{line.name}: {money(line.amount)}</Text>)}
            <Text style={styles.panelSubtitle}>Payment history</Text>
            {(item.payments || []).length ? item.payments.map((payment) => <DataRow key={String(payment._id)} title={payment.receiptNumber || "Payment receipt"} subtitle={[dateOf(payment.paymentDate), payment.method?.replaceAll("_", " "), payment.status, payment.reversalReason].filter(Boolean).join(" · ")} trailing={money(payment.amount)}/>) : <Text style={styles.empty}>No payments recorded for this invoice.</Text>}
          </View> : null}
        </View>;
      }) : <Text style={styles.empty}>No fee invoices found.</Text>}
    </Panel> : null}

    {!loading && !error && section === "results" ? <Panel title="Examination results" subtitle="Published results only">
      {renderRows(results, "No published results are available yet.", (item) => ({ title: item.examination?.name || item.name || "Examination", subtitle: item.grade || item.status || "", trailing: item.percentage != null ? item.percentage + "%" : item.marksObtained != null ? String(item.marksObtained) : "" }))}
    </Panel> : null}

    {!loading && !error && section === "timetable" ? <Panel title="My timetable" subtitle="Scheduled class periods">
      {renderRows(timetable, "No timetable entries found.", (item) => ({ title: item.assignmentId?.subjectId?.name || "Subject", subtitle: [item.dayOfWeek, item.startTime && item.endTime ? item.startTime + "–" + item.endTime : "", item.classId?.name].filter(Boolean).join(" · "), trailing: item.room || "" }))}
    </Panel> : null}

    {!loading && !error && section === "documents" ? <Panel title="My documents" subtitle="Files shared by your school">
      {renderRows(documents, "No documents have been shared with you.", (item) => ({ title: item.name || "Document", subtitle: [item.category?.replaceAll("_", " "), dateOf(item.createdAt)].filter(Boolean).join(" · "), trailing: item.format || "", onPress: item.fileUrl ? () => Linking.openURL(item.fileUrl) : undefined }))}
    </Panel> : null}

    {!loading && !error && section === "notices" ? <>
      <Panel title="School notices">{renderRows(notices, "No current notices.", (item) => ({ title: titleOf(item, "School notice"), subtitle: item.body || item.category || "" }))}</Panel>
      <Panel title="Notifications" subtitle={`${notifications.filter((item) => !item.readAt).length} unread`}>
        {notifications.length ? notifications.map((item) => <DataRow key={String(item._id)} title={item.title || "School update"} subtitle={[item.body, dateOf(item.createdAt)].filter(Boolean).join(" · ")} trailing={item.readAt ? "Read" : "Mark read"} onPress={async () => {
          if (item.readAt) return;
          try {
            await apiRequest(`/portal/notifications/${item._id}/read`, { method: "PATCH" });
            setData((previous) => ({ ...previous, notifications: { ...previous.notifications, data: list(previous.notifications).map((entry) => String(entry._id) === String(item._id) ? { ...entry, readAt: new Date().toISOString() } : entry) } }));
          } catch (requestError) { Alert.alert("Could not update notification", requestError?.message || "Please try again."); }
        }}/>) : <Text style={styles.empty}>No notifications.</Text>}
      </Panel>
    </> : null}
    <Modal visible={Boolean(selectedHomework)} transparent animationType="slide" onRequestClose={() => !submitting && setSelectedHomework(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Text style={styles.panelTitle}>{selectedHomework ? titleOf(selectedHomework, "Homework") : "Submit homework"}</Text>
        <Text style={styles.panelSubtitle}>{selectedHomework?.dueDate ? "Due " + dateOf(selectedHomework.dueDate) : "Written answer"}</Text>
        <TextInput value={answer} onChangeText={setAnswer} multiline textAlignVertical="top" placeholder="Write your answer here…" editable={!submitting} style={styles.answerInput} maxLength={10000}/>
        <Text style={styles.rowSubtitle}>{answer.length}/10,000 characters · Written answers only</Text>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.secondaryAction} disabled={submitting} onPress={() => setSelectedHomework(null)}><Text style={styles.secondaryActionText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={styles.primaryAction} disabled={submitting || !answer.trim()} onPress={async () => {
            setSubmitting(true);
            try {
              await apiRequest(`/homework/${selectedHomework._id}/submissions`, { method: "POST", body: { answer } });
              Alert.alert("Homework submitted", "Your written answer has been saved.");
              setSelectedHomework(null);
              await load(true);
            } catch (requestError) { Alert.alert("Submission failed", requestError?.message || "Please try again."); }
            finally { setSubmitting(false); }
          }}><Text style={styles.primaryActionText}>{submitting ? "Submitting…" : "Submit answer"}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 34, gap: spacing.lg },
  welcomeBanner: { minHeight: 174, backgroundColor: "#4263EB", borderRadius: 20, padding: 20, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#304BC0", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  bannerCopy: { flex: 1, zIndex: 2, gap: 7, paddingRight: 6 },
  bannerKicker: { color: "#DCE5FF", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  bannerTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: -0.6 },
  bannerSubtitle: { color: "#E3E9FF", fontSize: 12, lineHeight: 18, maxWidth: 270 },
  classPill: { alignSelf: "flex-start", marginTop: 5, backgroundColor: "#FFFFFF24", borderWidth: 1, borderColor: "#FFFFFF40", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  classPillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  bannerOrb: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#FFFFFF18", borderWidth: 1, borderColor: "#FFFFFF35", alignItems: "center", justifyContent: "center", marginLeft: -8 },
  bannerOrbText: { color: "#FFFFFF", fontSize: 38, fontWeight: "300" },
  tabs: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  tab: { borderWidth: 1, borderColor: "#E7EBF2", backgroundColor: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  tabActive: { borderColor: "#4263EB", backgroundColor: "#EDF1FF" },
  tabText: { color: "#778196", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#3E5DDE" },
  panel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7EBF2", borderRadius: 15, padding: spacing.lg, gap: spacing.md, shadowColor: "#1D3154", shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  panelTitle: { color: "#28364D", fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  panelSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  rowSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  rowTrailing: { color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flex: 1, minWidth: "22%", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7EBF2", borderRadius: 13, padding: 13, gap: 5, alignItems: "center" },
  metricValue: { color: "#4263EB", fontSize: 19, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 10, textTransform: "capitalize" },
  state: { padding: 24, alignItems: "center", gap: 10 },
  partialNotice: { backgroundColor: "#FFF5E5", borderRadius: radius.md, padding: 11 },
  partialNoticeText: { color: colors.ink, fontSize: 11, lineHeight: 16 },
  modalBackdrop: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  answerInput: { minHeight: 170, maxHeight: 280, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, color: colors.ink, fontSize: 14 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  secondaryAction: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.background },
  secondaryActionText: { color: colors.ink, fontWeight: "800" },
  primaryAction: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryActionText: { color: "#FFFFFF", fontWeight: "800" },
  invoiceDetails: { paddingHorizontal: 12, paddingBottom: 12, gap: 7, backgroundColor: colors.background, borderRadius: radius.md },
  error: { backgroundColor: "#FDECEC", borderRadius: radius.md, padding: 15, gap: 10 },
  errorText: { color: colors.danger, fontSize: 13 },
  retry: { alignSelf: "flex-start", backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: colors.primary, fontWeight: "800" },
});
