import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { AppScreen } from "../../components/AppScreen";
import { getDashboardOverview } from "../../services/dashboardService";
import { StudentsScreen } from "../../components/StudentsScreen";\nimport { StudentAdmissionScreen } from "../../components/StudentAdmissionScreen";
import { AttendanceScreen } from "../../components/AttendanceScreen";
import { colors, radius, spacing } from "../../theme/tokens";

const tabs = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "students", label: "Students", icon: "♙" },
  { key: "attendance", label: "Attendance", icon: "✓" },
  { key: "staff", label: "Staff", icon: "♧" },
  { key: "more", label: "More", icon: "•••" },
];
const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
const formatMoney = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function MetricCard({ icon, label, value, note, tint }) {
  return <View style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor: tint }]}><Text style={styles.metricIconText}>{icon}</Text></View>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricNote}>{note}</Text>
  </View>;
}

function SectionHeader({ title, subtitle, action, onAction }) {
  return <View style={styles.sectionHeader}>
    <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>
    {action ? <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity> : null}
  </View>;
}

function ComingSoon({ title, description, onHome }) {
  return <View style={styles.comingSoon}>
    <View style={styles.comingIcon}><Text style={styles.comingIconText}>SE</Text></View>
    <Text style={styles.comingTitle}>{title}</Text>
    <Text style={styles.comingDescription}>{description}</Text>
    <TouchableOpacity style={styles.secondaryButton} onPress={onHome}><Text style={styles.secondaryButtonText}>Back to dashboard</Text></TouchableOpacity>
  </View>;
}

export default function AppHomeScreen() {
  const { user, signOut } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("home");

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const data = await getDashboardOverview();
      setReport(data);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load dashboard information.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Administrator";
  const role = (user?.role || "school user").replaceAll("_", " ");
  const yearName = report?.academicYear?.name || "Academic year not set";
  const onHome = () => setActiveTab("home");

  return <AppScreen style={styles.screen} edges={["top", "bottom"]}>
    <View style={styles.topHeader}>
      <View style={styles.brand}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>SE</Text></View>
        <View><Text style={styles.brandName}>SCHOOL ERP</Text><Text style={styles.brandCaption}>SCHOOL WORKSPACE</Text></View>
      </View>
      <TouchableOpacity style={styles.profileButton} onPress={() => setActiveTab("more")} accessibilityLabel="Open profile and settings">
        <Text style={styles.profileInitials}>{fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</Text>
      </TouchableOpacity>
    </View>

    {activeTab === "home" ? <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} tintColor={colors.primary} />}>
      <View style={styles.welcomeBlock}>
        <Text style={styles.kicker}>SCHOOL OVERVIEW</Text>
        <Text style={styles.welcomeTitle}>Good day, {user?.firstName || "Administrator"}.</Text>
        <Text style={styles.welcomeText}>Here’s what’s happening at your school today.</Text>
        <View style={styles.yearPill}><View style={styles.yearDot}/><Text style={styles.yearText}>{yearName}</Text></View>
      </View>

      {loading && !report ? <View style={styles.stateCard}><ActivityIndicator color={colors.primary}/><Text style={styles.stateText}>Loading your school dashboard…</Text></View> : null}
      {error && !report ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={() => loadDashboard()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View> : null}

      {report ? <>
        <SectionHeader title="At a glance" subtitle="Live school indicators" />
        <View style={styles.metricsGrid}>
          <MetricCard icon="♙" label="Active students" value={formatNumber(report.students?.active)} note={`${formatNumber(report.students?.total)} records`} tint="#E8F1FC"/>
          <MetricCard icon="✓" label="Present today" value={formatNumber(report.attendance?.today?.present)} note={report.attendance?.today?.percentage == null ? "Attendance not marked" : `${report.attendance.today.percentage}% attendance`} tint="#E6F5ED"/>
          <MetricCard icon="♧" label="Teaching staff" value={formatNumber(report.staff?.teaching)} note={`${formatNumber(report.staff?.totalActive)} active staff`} tint="#F0EAFE"/>
          <MetricCard icon="₹" label="Fee collection" value={formatMoney(report.fees?.net)} note={`${formatMoney(report.fees?.outstanding)} outstanding`} tint="#FFF3DF"/>
        </View>

        <View style={styles.panel}>
          <SectionHeader title="Attendance today" subtitle={report.attendance?.date || "Daily attendance"} />
          <View style={styles.attendanceSummary}>
            <View style={styles.attendanceMain}><Text style={styles.attendancePercentage}>{report.attendance?.today?.percentage == null ? "—" : `${report.attendance.today.percentage}%`}</Text><Text style={styles.attendanceCaption}>Attendance rate</Text></View>
            <View style={styles.attendanceLegend}>
              <LegendRow color={colors.success} label="Present" value={report.attendance?.today?.present}/>
              <LegendRow color={colors.accent} label="Late" value={report.attendance?.today?.late}/>
              <LegendRow color={colors.danger} label="Absent" value={report.attendance?.today?.absent}/>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <SectionHeader title="Attendance trend" subtitle="Recent monthly records" />
          {report.attendance?.trend?.length ? <View style={styles.chart}>
            {report.attendance.trend.map((item) => {
              const max = Math.max(1, ...report.attendance.trend.map((entry) => entry.marked || 0));
              const height = Math.max(6, (item.marked / max) * 100);
              const month = new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" });
              return <View style={styles.chartColumn} key={item.month}><Text style={styles.chartValue}>{formatNumber(item.marked)}</Text><View style={styles.chartTrack}><View style={[styles.chartBar, { height: `${height}%` }]} /></View><Text style={styles.chartMonth}>{month}</Text></View>;
            })}
          </View> : <Text style={styles.emptyText}>No recent attendance records to display.</Text>}
        </View>

        <View style={styles.panel}>
          <SectionHeader title="Academic performance" subtitle="Latest published examination" />
          {report.examinations?.latestResult ? <><Text style={styles.examName}>{report.examinations.latestResult.name}</Text><View style={styles.performanceRow}>
            <PerformanceMetric value={report.examinations.latestResult.averagePercentage == null ? "—" : `${report.examinations.latestResult.averagePercentage}%`} label="Class average"/>
            <PerformanceMetric value={report.examinations.latestResult.passRate == null ? "—" : `${report.examinations.latestResult.passRate}%`} label="Pass rate"/>
            <PerformanceMetric value={formatNumber(report.examinations.latestResult.students)} label="Students"/>
          </View><Text style={styles.resultFootnote}>{formatNumber(report.examinations.latestResult.passed)} passed · {formatNumber(report.examinations.latestResult.failed)} failed</Text></> : <Text style={styles.emptyText}>No published examination results yet.</Text>}
          <View style={styles.enrollmentSummary}><Text style={styles.enrollmentTitle}>Enrollments</Text><View style={styles.enrollmentRow}><Text>Active</Text><Text style={styles.enrollmentValue}>{formatNumber(report.enrollments?.active)}</Text></View><View style={styles.enrollmentRow}><Text>Completed</Text><Text style={styles.enrollmentValue}>{formatNumber(report.enrollments?.completed)}</Text></View><View style={styles.enrollmentRow}><Text>Total recorded</Text><Text style={styles.enrollmentValue}>{formatNumber(report.enrollments?.total)}</Text></View></View>
        </View>

        <SectionHeader title="Quick access" subtitle="Your school management tools" />
        <View style={styles.quickGrid}>
          {tabs.slice(1, 4).map((tab) => <TouchableOpacity key={tab.key} style={styles.quickCard} onPress={() => setActiveTab(tab.key)}><Text style={styles.quickIcon}>{tab.icon}</Text><Text style={styles.quickLabel}>{tab.label}</Text><Text style={styles.quickArrow}>→</Text></TouchableOpacity>)}
        </View>
        <View style={styles.dashboardFooter}><Text>Updated {report.generatedAt ? new Date(report.generatedAt).toLocaleTimeString() : "recently"}</Text><Text>{formatNumber(report.examinations?.published)} published exams</Text></View>
      </> : null}
    </ScrollView> : activeTab === "students" ? <StudentsScreen onHome={onHome} onAddStudent={() => setActiveTab("admission")}/> : activeTab === "admission" ? <StudentAdmissionScreen onCancel={() => setActiveTab("students")} onComplete={() => setActiveTab("students")}/> : <ScrollView contentContainerStyle={styles.scrollContent}>
      {
       activeTab === "attendance" ? <AttendanceScreen onHome={onHome}/> :
       activeTab === "staff" ? <ComingSoon title="Staff directory" description="Teacher and staff profiles, roles, contact details and staff management are coming next." onHome={onHome}/> :
       <View style={styles.profileCard}><View style={styles.profileLarge}><Text style={styles.profileLargeText}>{fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</Text></View><Text style={styles.profileName}>{fullName}</Text><Text style={styles.profileRole}>{role}</Text><Text style={styles.profileSchool}>School ERP mobile account</Text><TouchableOpacity style={styles.signOutButton} onPress={signOut}><Text style={styles.signOutText}>Sign out</Text><Text style={styles.signOutArrow}>→</Text></TouchableOpacity></View>}
    </ScrollView>}

    <View style={styles.bottomNav}>
      {tabs.map((tab) => <TouchableOpacity key={tab.key} style={styles.navItem} onPress={() => setActiveTab(tab.key)}><Text style={[styles.navIcon, activeTab === tab.key && styles.navIconActive]}>{tab.icon}</Text><Text style={[styles.navLabel, activeTab === tab.key && styles.navLabelActive]}>{tab.label}</Text>{activeTab === tab.key ? <View style={styles.navIndicator}/> : null}</TouchableOpacity>)}
    </View>
  </AppScreen>;
}

function LegendRow({ color, label, value }) { return <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendLabel}>{label}</Text><Text style={styles.legendValue}>{formatNumber(value)}</Text></View>; }
function PerformanceMetric({ value, label }) { return <View style={styles.performanceMetric}><Text style={styles.performanceValue}>{value}</Text><Text style={styles.performanceLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.background },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandMark: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: colors.white, fontWeight: "900", fontSize: 15 },
  brandName: { color: colors.ink, fontWeight: "900", letterSpacing: 1.6, fontSize: 14 },
  brandCaption: { color: colors.muted, letterSpacing: 1.1, fontSize: 9, marginTop: 3, fontWeight: "700" },
  profileButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  profileInitials: { color: colors.primary, fontWeight: "800" },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 24, gap: spacing.lg },
  welcomeBlock: { paddingTop: spacing.md, gap: spacing.sm },
  kicker: { color: colors.accent, fontWeight: "900", letterSpacing: 1.4, fontSize: 11 },
  welcomeTitle: { color: colors.ink, fontSize: 27, fontWeight: "900", letterSpacing: -0.5 },
  welcomeText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  yearPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primarySoft, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, marginTop: 4 },
  yearDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  yearText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, marginBottom: 2 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  sectionAction: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48%", flexGrow: 1, minHeight: 142, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 5 },
  metricIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  metricIconText: { fontSize: 17, fontWeight: "800", color: colors.primary },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  metricNote: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  attendanceSummary: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  attendanceMain: { flex: 1, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 16, alignItems: "center" },
  attendancePercentage: { color: colors.primary, fontSize: 28, fontWeight: "900" },
  attendanceCaption: { color: colors.muted, fontSize: 11, marginTop: 4 },
  attendanceLegend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, color: colors.muted, fontSize: 12 },
  legendValue: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  chart: { height: 160, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 5, paddingTop: 6 },
  chartColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 5 },
  chartValue: { color: colors.muted, fontSize: 9 },
  chartTrack: { flex: 1, width: "65%", maxWidth: 22, backgroundColor: colors.primarySoft, borderRadius: 8, justifyContent: "flex-end", overflow: "hidden" },
  chartBar: { backgroundColor: colors.primary, width: "100%", borderRadius: 8 },
  chartMonth: { color: colors.muted, fontSize: 10 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  examName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  performanceRow: { flexDirection: "row", gap: 8 },
  performanceMetric: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: 10, alignItems: "center" },
  performanceValue: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  performanceLabel: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 4 },
  resultFootnote: { color: colors.muted, fontSize: 11 },
  enrollmentSummary: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: 9 },
  enrollmentTitle: { color: colors.ink, fontWeight: "800", fontSize: 13, marginBottom: 2 },
  enrollmentRow: { flexDirection: "row", justifyContent: "space-between" },
  enrollmentValue: { color: colors.ink, fontWeight: "800" },
  quickGrid: { flexDirection: "row", gap: 8 },
  quickCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, gap: 8 },
  quickIcon: { fontSize: 20, color: colors.primary },
  quickLabel: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  quickArrow: { color: colors.accent, fontWeight: "900" },
  dashboardFooter: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  dashboardFooterText: { color: colors.muted, fontSize: 10 },
  stateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 24, alignItems: "center", gap: 10 },
  stateText: { color: colors.muted, fontSize: 13 },
  errorCard: { backgroundColor: "#FDECEC", borderRadius: radius.md, padding: 16, gap: 10 },
  errorText: { color: colors.danger, fontSize: 13 },
  retryButton: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 8 },
  retryText: { color: colors.primary, fontWeight: "800" },
  comingSoon: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 28, gap: 14, marginTop: 30 },
  comingIcon: { width: 64, height: 64, backgroundColor: colors.primary, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  comingIconText: { color: colors.white, fontWeight: "900", fontSize: 20 },
  comingTitle: { color: colors.ink, fontSize: 22, fontWeight: "900", textAlign: "center" },
  comingDescription: { color: colors.muted, textAlign: "center", fontSize: 14, lineHeight: 22 },
  secondaryButton: { backgroundColor: colors.primarySoft, paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.md },
  secondaryButtonText: { color: colors.primary, fontWeight: "800" },
  profileCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 24, alignItems: "center", gap: 10, marginTop: 20 },
  profileLarge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  profileLargeText: { color: colors.white, fontSize: 24, fontWeight: "900" },
  profileName: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  profileRole: { color: colors.primary, textTransform: "capitalize", fontWeight: "700" },
  profileSchool: { color: colors.muted, fontSize: 12 },
  signOutButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, marginTop: 18 },
  signOutText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  signOutArrow: { color: colors.white, fontSize: 18, fontWeight: "900" },
  bottomNav: { flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, paddingBottom: 4, paddingHorizontal: 6 },
  navItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 5, position: "relative" },
  navIcon: { color: colors.muted, fontSize: 19, fontWeight: "800" },
  navIconActive: { color: colors.primary },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  navLabelActive: { color: colors.primary, fontWeight: "900" },
  navIndicator: { position: "absolute", top: -8, width: 22, height: 3, borderRadius: 2, backgroundColor: colors.primary },
});
