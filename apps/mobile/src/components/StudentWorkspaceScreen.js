import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
      if (failures.includes("profile")) setError("Unable to load your student profile. Please try again.");
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
    <View style={styles.heading}>
      <Text style={styles.kicker}>STUDENT WORKSPACE</Text>
      <Text style={styles.headingTitle}>Hello, {user?.firstName || student?.firstName || "Student"}</Text>
      <Text style={styles.headingSubtitle}>Your learning, school records and updates in one place.</Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {sections.map((item) => <TouchableOpacity key={item.key} onPress={() => setSection(item.key)} style={[styles.tab, section === item.key && styles.tabActive]}><Text style={[styles.tabText, section === item.key && styles.tabTextActive]}>{item.label}</Text></TouchableOpacity>)}
    </ScrollView>

    {loading && !student && !error ? <View style={styles.state}><ActivityIndicator color={colors.primary}/><Text style={styles.empty}>Loading your school information…</Text></View> : null}
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => load()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View> : null}

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
        {renderRows(homework, "No homework has been assigned yet.", (item) => {
          const submission = submissionByHomework.get(String(item._id));
          return { title: titleOf(item, "Homework"), subtitle: [item.subjectId?.name, item.dueDate ? "Due " + dateOf(item.dueDate) : ""].filter(Boolean).join(" · "), trailing: submission?.status || "Pending" };
        })}
      </Panel>
      <Panel title="My submissions">{renderRows(submissions, "No submissions yet.", (item) => ({ title: item.homeworkId?.title || "Assignment submission", subtitle: [item.status, item.submittedAt ? dateOf(item.submittedAt) : ""].filter(Boolean).join(" · "), trailing: item.marksObtained != null ? String(item.marksObtained) + "/" + item.maxMarks : "" }))}</Panel>
    </> : null}

    {!loading && !error && section === "attendance" ? <Panel title="Attendance record" subtitle={`${attendanceSummary.percentage == null ? "No percentage available" : attendanceSummary.percentage + "% attendance"} · ${attendanceSummary.marked || 0} marked records`}>
      <View style={styles.metrics}>{["present", "absent", "late", "excused"].map((key) => <View style={styles.metric} key={key}><Text style={styles.metricValue}>{attendanceSummary[key] || 0}</Text><Text style={styles.metricLabel}>{key}</Text></View>)}</View>
      {renderRows(list(data.attendance).slice(0, 30), "No attendance records found.", (item) => ({ title: dateOf(item.date) || "Attendance", subtitle: item.remarks || "", trailing: item.status || "" }))}
    </Panel> : null}

    {!loading && !error && section === "fees" ? <Panel title="Fees & payments" subtitle={`${feeSummary.invoiceCount || 0} invoices · Balance ${money(feeSummary.balance)}`}>
      {renderRows(fees, "No fee invoices found.", (item) => ({ title: item.invoiceNumber || item.feeStructureId?.name || "Fee invoice", subtitle: [item.academicYearId?.name, item.dueDate ? "Due " + dateOf(item.dueDate) : ""].filter(Boolean).join(" · "), trailing: money(item.balance ?? Math.max(0, (item.totalAmount || 0) - (item.paidAmount || 0))) }))}
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
      <Panel title="Notifications">{renderRows(notifications, "No notifications.", (item) => ({ title: item.title || "School update", subtitle: item.body || dateOf(item.createdAt) }))}</Panel>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 28, gap: spacing.md },
  heading: { gap: 6, paddingTop: 4, paddingBottom: 4 },
  kicker: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  headingTitle: { color: colors.ink, fontSize: 26, fontWeight: "900" },
  headingSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  tabs: { gap: 8, paddingVertical: 4 },
  tab: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 9 },
  tabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: colors.primary },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  panelTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  panelSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  rowSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  rowTrailing: { color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flex: 1, minWidth: "22%", backgroundColor: colors.background, borderRadius: radius.md, padding: 11, gap: 4, alignItems: "center" },
  metricValue: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 10, textTransform: "capitalize" },
  state: { padding: 24, alignItems: "center", gap: 10 },
  error: { backgroundColor: "#FDECEC", borderRadius: radius.md, padding: 15, gap: 10 },
  errorText: { color: colors.danger, fontSize: 13 },
  retry: { alignSelf: "flex-start", backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: colors.primary, fontWeight: "800" },
});
