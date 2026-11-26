import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AppScreen } from "./AppScreen";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const PAGE_SIZE = 20;

export function PlatformAdminScreen({ user, onSignOut }) {
  const [section, setSection] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [commercialRecords, setCommercialRecords] = useState([]);
  const [commercialError, setCommercialError] = useState("");
  const [schools, setSchools] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDirectory = useCallback(async (refresh = false) => {
    if (section === "overview") return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      const endpoint = section === "schools" ? "/platform/schools" : "/platform/users";
      const response = await apiRequest(endpoint + "?" + params.toString());
      const records = Array.isArray(response?.data) ? response.data : [];
      if (section === "schools") setSchools(records); else setUsers(records);
      setPagination(response?.pagination || { total: records.length, pages: 1 });
    } catch (requestError) {
      setError(requestError?.message || "Unable to load the platform directory.");
      if (section === "schools") setSchools([]); else setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, section]);

  useEffect(() => { if (section !== "overview") void loadDirectory(); }, [loadDirectory, section]);

  useEffect(() => {
    if (section !== "overview") return undefined;
    let mounted = true;
    setOverviewLoading(true); setOverviewError("");
    apiRequest("/platform/business-overview")
      .then((response) => { if (mounted) setOverview(response?.data ?? null); })
      .catch((error) => { if (mounted) setOverviewError(error?.message || "Unable to load business overview."); })
      .finally(() => { if (mounted) setOverviewLoading(false); });
    return () => { mounted = false; };
  }, [section]);

  useEffect(() => {
    if (["overview", "schools", "users"].includes(section)) return undefined;
    let mounted = true;
    setLoading(true); setCommercialError("");
    const endpoint = section === "plans" ? "/platform/subscription-plans"
      : section === "billing" ? "/platform/invoices"
      : "/platform/commercial-events?limit=50";
    apiRequest(endpoint)
      .then((response) => { if (mounted) setCommercialRecords(Array.isArray(response?.data) ? response.data : []); })
      .catch((requestError) => { if (mounted) setCommercialError(requestError?.message || "Unable to load commercial records."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [section]);

  const switchSection = (next) => {
    setSection(next);
    setPage(1);
    setSearch("");
    setError("");
  };

  const nameOf = (item) => section === "schools"
    ? item.name || item.schoolName || "Unnamed school"
    : [item.firstName, item.lastName].filter(Boolean).join(" ") || item.name || "Unnamed user";
  const subtitleOf = (item) => section === "schools"
    ? item.slug || item.code || item.email || "School account"
    : item.email || item.role?.replaceAll("_", " ") || "User account";
  const statusOf = (item) => String(item.status || (item.isActive === false ? "suspended" : "active")).replaceAll("_", " ");

  return <AppScreen style={styles.screen} edges={["top", "bottom"]}>
    <View style={styles.header}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>SE</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.brandName}>SCHOOLSUITE</Text>
        <Text style={styles.brandCaption}>PLATFORM CONTROL</Text>
      </View>
      <TouchableOpacity onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>CENTRAL ADMINISTRATION</Text>
      <Text style={styles.title}>Platform workspace</Text>
      <Text style={styles.description}>Manage school organisations and user accounts across the platform.</Text>
      <View style={styles.welcome}>
        <Text style={styles.welcomeLabel}>SIGNED IN AS</Text>
        <Text style={styles.welcomeName}>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Platform administrator"}</Text>
        <Text style={styles.welcomeCopy}>Restricted cross-school administration</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {[["overview", "Overview"], ["schools", "Schools"], ["users", "Users"], ["plans", "Plans"], ["billing", "Billing"], ["audit", "Audit"]].map(([key, label]) =>
          <TouchableOpacity key={key} onPress={() => switchSection(key)} style={[styles.tab, section === key && styles.tabActive]}>
            <Text style={[styles.tabText, section === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      {section === "overview" ? <View style={styles.metricsWrap}>
        {overviewLoading ? <ActivityIndicator color={colors.primary}/> : null}
        {overviewError ? <View style={styles.error}><Text style={styles.errorText}>{overviewError}</Text></View> : null}\n        {!overviewLoading && !overviewError && !overview ? <Text style={styles.metricHint}>No business overview data is available yet.</Text> : null}
        {overview ? <>
          <View style={styles.metricCard}><Text style={styles.metricLabel}>CLIENT SCHOOLS</Text><Text style={styles.metricValue}>{overview.schools?.total ?? 0}</Text><Text style={styles.metricHint}>{overview.schools?.active ?? 0} active</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricLabel}>ACTIVE SUBSCRIPTIONS</Text><Text style={styles.metricValue}>{Object.values(overview.subscriptions || {}).reduce((sum, item) => sum + (item.activeSubscriptions || 0), 0)}</Text><Text style={styles.metricHint}>Across all billing terms</Text></View>
          {(overview.invoiced || []).map((item) => <View key={"inv-" + item._id} style={styles.metricCard}><Text style={styles.metricLabel}>INVOICED · {item._id}</Text><Text style={styles.metricValue}>{new Intl.NumberFormat("en-IN", { style: "currency", currency: item._id, maximumFractionDigits: 0 }).format(item.invoiced || 0)}</Text><Text style={styles.metricHint}>Overdue: {new Intl.NumberFormat("en-IN", { style: "currency", currency: item._id, maximumFractionDigits: 0 }).format(item.overdue || 0)}</Text></View>)}
          {(overview.collected || []).map((item) => <View key={"cash-" + item._id} style={styles.metricCard}><Text style={styles.metricLabel}>CASH COLLECTED · {item._id}</Text><Text style={styles.metricValue}>{new Intl.NumberFormat("en-IN", { style: "currency", currency: item._id, maximumFractionDigits: 0 }).format(item.collected || 0)}</Text><Text style={styles.metricHint}>Recorded platform payments</Text></View>)}
          {Object.entries(overview.subscriptions || {}).map(([currency, item]) => <View key={"runrate-" + currency} style={styles.metricCard}><Text style={styles.metricLabel}>{currency} RECURRING RUN RATE</Text><Text style={styles.metricValue}>{new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(item.mrr || 0)} / mo</Text><Text style={styles.metricHint}>Lifetime sales: {new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(item.lifetimeSales || 0)}</Text></View>)}
        </> : null}
        <Text style={styles.metricFootnote}>Platform revenue only. Student fee collections remain separate within each school.</Text>
      </View> : null}

      {["plans", "billing", "audit"].includes(section) ? <>
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{section === "plans" ? "Subscription plans" : section === "billing" ? "Platform billing" : "Commercial audit"}</Text>
            <Text style={styles.sectionSubtitle}>{section === "plans" ? "Monthly, annual and lifetime offers" : section === "billing" ? "Platform invoices and recorded payments" : "Plan, subscription and payment history"}</Text>
          </View>
          <TouchableOpacity onPress={() => switchSection(section)} style={styles.refresh}><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity>
        </View>
        {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary}/><Text style={styles.stateText}>Loading…</Text></View> : null}
        {commercialError ? <View style={styles.error}><Text style={styles.errorText}>{commercialError}</Text><TouchableOpacity onPress={() => switchSection(section)}><Text style={styles.retry}>Try again</Text></TouchableOpacity></View> : null}
        {!loading && !commercialError && commercialRecords.length === 0 ? <View style={styles.state}><Text style={styles.stateText}>{section === "plans" ? "No subscription plans created yet." : section === "billing" ? "No platform invoices yet." : "No commercial events recorded yet."}</Text></View> : null}
        {commercialRecords.map((item, index) => <View key={String(item.id || item._id || index)} style={styles.record}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.recordName}>{section === "plans" ? item.name : section === "billing" ? item.invoiceNumber : String(item.action || "Event").replaceAll("_", " ")}</Text>
            <Text style={styles.recordSubtitle}>{section === "plans" ? (item.billingInterval === "one_time" ? "Lifetime · single payment" : item.billingInterval + " · " + item.currency + " " + item.amount) : section === "billing" ? (item.tenantId?.name || "School") + " · " + item.status : (item.tenantId?.name || "Platform") + " · " + new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.statusPill}><Text style={styles.statusText}>{section === "plans" ? (item.isArchived ? "archived" : item.isActive ? "active" : "inactive") : section === "billing" ? item.status : "logged"}</Text></View>
        </View>)}
        <Text style={styles.metricFootnote}>Commercial controls and payment recording are available in the web platform workspace.</Text>
      </> : null}
      {section !== "overview" ? <>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{section === "schools" ? "School directory" : "User directory"}</Text>
          <Text style={styles.sectionSubtitle}>{pagination.total || 0} records across the platform</Text>
        </View>
        <TouchableOpacity onPress={() => loadDirectory(true)} style={styles.refresh}><Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh"}</Text></TouchableOpacity>
      </View>
      <TextInput
        value={search}
        onChangeText={(value) => { setSearch(value); setPage(1); }}
        placeholder={section === "schools" ? "Search schools…" : "Search users…"}
        placeholderTextColor={colors.muted}
        style={styles.search}
        returnKeyType="search"
        accessibilityLabel={section === "schools" ? "Search schools" : "Search users"}
      />
      {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary}/><Text style={styles.stateText}>Loading directory…</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => loadDirectory()}><Text style={styles.retry}>Try again</Text></TouchableOpacity></View> : null}
      {!loading && !error ? (section === "schools" ? schools : users).length ? (section === "schools" ? schools : users).map((item, index) =>
        <View key={String(item.id || item._id || index)} style={styles.record}>
          <View style={styles.recordIcon}><Text style={styles.recordIconText}>{section === "schools" ? "⌂" : "♙"}</Text></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.recordName}>{nameOf(item)}</Text>
            <Text style={styles.recordSubtitle}>{subtitleOf(item)}</Text>
          </View>
          <View style={styles.statusPill}><Text style={styles.statusText}>{statusOf(item)}</Text></View>
        </View>
      ) : <View style={styles.state}><Text style={styles.stateText}>No {section} found.</Text></View> : null}
      {!loading && pagination.pages > 1 ? <View style={styles.pagination}>
        <TouchableOpacity disabled={page <= 1} onPress={() => setPage((value) => value - 1)} style={[styles.pageButton, page <= 1 && styles.disabled]}><Text style={styles.pageText}>Previous</Text></TouchableOpacity>
        <Text style={styles.pageCount}>Page {page} of {pagination.pages}</Text>
        <TouchableOpacity disabled={page >= pagination.pages} onPress={() => setPage((value) => value + 1)} style={[styles.pageButton, page >= pagination.pages && styles.disabled]}><Text style={styles.pageText}>Next</Text></TouchableOpacity>
      </View> : null}
      </> : null}
      <Text style={styles.footer}>SchoolSuite · Platform administration</Text>
    </ScrollView>
  </AppScreen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: spacing.lg, paddingVertical: 13, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: colors.white, fontSize: 15, fontWeight: "900" },
  brandName: { color: colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 1.1 },
  brandCaption: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 3 },
  signOut: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 8 },
  signOutText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  content: { padding: spacing.lg, paddingBottom: 36, gap: spacing.md },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 5 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  welcome: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 20, gap: 6, marginVertical: 5 },
  welcomeLabel: { color: "#DCE5FF", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  welcomeName: { color: colors.white, fontSize: 20, fontWeight: "900" },
  welcomeCopy: { color: "#E3E9FF", fontSize: 11 },
  metricsWrap: { gap: 9 },
  metricCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 15, gap: 5 },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  metricValue: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  metricHint: { color: colors.muted, fontSize: 10 },
  metricFootnote: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  tabs: { flexDirection: "row", gap: 7, backgroundColor: colors.surface, padding: 5, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tab: { minWidth: 76, alignItems: "center", paddingHorizontal: 12, paddingVertical: 11, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: colors.primary },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  refresh: { padding: 9 },
  refreshText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 11, color: colors.ink, fontSize: 13 },
  record: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13 },
  recordIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  recordIconText: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  recordName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  recordSubtitle: { color: colors.muted, fontSize: 10 },
  statusPill: { backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill },
  statusText: { color: colors.primary, fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  state: { alignItems: "center", padding: 25, gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stateText: { color: colors.muted, fontSize: 12 },
  error: { padding: 14, borderRadius: radius.md, backgroundColor: "#FFF0EF", gap: 8 },
  errorText: { color: colors.danger, fontSize: 12 },
  retry: { color: colors.primary, fontWeight: "900", fontSize: 12 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  pageButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  pageText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  pageCount: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  disabled: { opacity: 0.35 },
  footer: { textAlign: "center", color: colors.muted, fontSize: 10, marginTop: 14 },
});
