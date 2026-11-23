import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getStudentById, getStudents } from "../services/studentService";
import { colors, radius, spacing } from "../theme/tokens";

const statuses = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "withdrawn", label: "Withdrawn" },
];

const displayDate = (value) => {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not provided" : date.toLocaleDateString();
};

function StateCard({ title, message, action, onAction }) {
  return <View style={styles.stateCard}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateMessage}>{message}</Text>{action ? <TouchableOpacity style={styles.actionButton} onPress={onAction}><Text style={styles.actionText}>{action}</Text></TouchableOpacity> : null}</View>;
}

export function StudentsScreen({ onHome }) {
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const paginationRef = useRef(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async ({ refresh = false, nextPage = false } = {}) => {
    if (refresh) setRefreshing(true);
    else if (nextPage) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const page = nextPage ? (paginationRef.current?.page || 1) + 1 : 1;
      const result = await getStudents({ page, limit: 20, search, status });
      setStudents((current) => nextPage ? [...current, ...result.students] : result.students);
      paginationRef.current = result.pagination;
      setPagination(result.pagination);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load students.");
      if (!nextPage) setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  const submitSearch = () => setSearch(searchInput.trim());
  const openStudent = async (student) => {
    setSelectedStudent(student);
    setDetailLoading(true);
    setDetailError("");
    try {
      const fullStudent = await getStudentById(student._id);
      if (fullStudent) setSelectedStudent(fullStudent);
    } catch (requestError) {
      setDetailError(requestError?.message || "Unable to load student details.");
    } finally {
      setDetailLoading(false);
    }
  };

  if (selectedStudent) {
    const address = selectedStudent.address || {};
    const addressText = [address.line1, address.line2, address.city, address.district, address.state, address.postalCode, address.country].filter(Boolean).join(", ");
    return <ScrollView contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => { setSelectedStudent(null); setDetailError(""); }} style={styles.backLink}><Text style={styles.backLinkText}>‹  Back to students</Text></TouchableOpacity>
      <View style={styles.detailCard}>
        <View style={styles.avatarLarge}><Text style={styles.avatarText}>{(selectedStudent.firstName || "S").slice(0, 1).toUpperCase()}</Text></View>
        <Text style={styles.detailName}>{[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(" ")}</Text>
        <Text style={styles.detailAdmission}>Admission No. {selectedStudent.admissionNumber || "—"}</Text>
        <View style={[styles.statusPill, selectedStudent.status === "active" ? styles.activePill : styles.inactivePill]}><Text style={styles.statusText}>{selectedStudent.status || "Unknown"}</Text></View>
        {detailLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} /> : null}
        {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoHeading}>Student information</Text>
        <InfoRow label="Date of birth" value={displayDate(selectedStudent.dateOfBirth)} />
        <InfoRow label="Gender" value={selectedStudent.gender?.replaceAll("_", " ") || "Not provided"} />
        <InfoRow label="Admission date" value={displayDate(selectedStudent.admissionDate)} />
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoHeading}>Guardian information</Text>
        <InfoRow label="Guardian" value={selectedStudent.guardianName || "Not provided"} />
        <InfoRow label="Relationship" value={selectedStudent.guardianRelationship?.replaceAll("_", " ") || "Not provided"} />
        <InfoRow label="Phone" value={selectedStudent.guardianPhone || "Not provided"} />
        <InfoRow label="Email" value={selectedStudent.guardianEmail || "Not provided"} />
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoHeading}>Address</Text>
        <Text style={styles.addressText}>{addressText || "No address recorded."}</Text>
      </View>
    </ScrollView>;
  }

  return <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} tintColor={colors.primary} />}>
    <View style={styles.headerRow}><View style={{ flex: 1 }}><Text style={styles.kicker}>SCHOOL DIRECTORY</Text><Text style={styles.heading}>Students</Text><Text style={styles.subheading}>{pagination?.total ?? students.length} records</Text></View><TouchableOpacity onPress={onHome} style={styles.homeButton}><Text style={styles.homeButtonText}>Home</Text></TouchableOpacity></View>
    <View style={styles.searchRow}><TextInput style={styles.searchInput} value={searchInput} onChangeText={setSearchInput} placeholder="Name or admission number" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={submitSearch} autoCapitalize="none"/><TouchableOpacity style={styles.searchButton} onPress={submitSearch}><Text style={styles.searchButtonText}>Search</Text></TouchableOpacity></View>
    <View style={styles.statusRow}>{statuses.map((item) => <TouchableOpacity key={item.key} style={[styles.filterChip, status === item.key && styles.filterChipActive]} onPress={() => setStatus(item.key)}><Text style={[styles.filterText, status === item.key && styles.filterTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
    {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary}/><Text style={styles.stateMessage}>Loading students…</Text></View> : null}
    {!loading && error ? <StateCard title="Couldn't load students" message={error} action="Try again" onAction={() => load()}/> : null}
    {!loading && !error && students.length === 0 ? <StateCard title="No students found" message={search ? "Try another name or admission number." : "There are no students matching this filter."} action={search ? "Clear search" : undefined} onAction={() => { setSearchInput(""); setSearch(""); setStatus("all"); }}/> : null}
    {students.map((student) => <TouchableOpacity key={student._id} style={styles.studentCard} onPress={() => openStudent(student)} activeOpacity={0.75}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{(student.firstName || "S").slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.studentInfo}><Text style={styles.studentName}>{[student.firstName, student.lastName].filter(Boolean).join(" ")}</Text><Text style={styles.studentAdmission}>{student.admissionNumber || "No admission number"}</Text></View>
      <View style={[styles.statusPill, student.status === "active" ? styles.activePill : styles.inactivePill]}><Text style={styles.statusText}>{student.status || "Unknown"}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>)}
    {pagination && pagination.page < pagination.totalPages ? <TouchableOpacity style={styles.loadMore} disabled={loadingMore} onPress={() => load({ nextPage: true })}>{loadingMore ? <ActivityIndicator color={colors.primary}/> : <Text style={styles.loadMoreText}>Load more students</Text>}</TouchableOpacity> : null}
  </ScrollView>;
}

function InfoRow({ label, value }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 30, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  heading: { color: colors.ink, fontSize: 26, fontWeight: "900", marginTop: 3 },
  subheading: { color: colors.muted, fontSize: 12, marginTop: 3 },
  homeButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  homeButtonText: { color: colors.primary, fontWeight: "800" },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.ink, fontSize: 14 },
  searchButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: "center" },
  searchButtonText: { color: colors.white, fontWeight: "800" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: colors.white },
  studentCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarLarge: { width: 68, height: 68, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "900", fontSize: 17 },
  studentInfo: { flex: 1 },
  studentName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  studentAdmission: { color: colors.muted, fontSize: 11, marginTop: 4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  activePill: { backgroundColor: "#E6F5ED" },
  inactivePill: { backgroundColor: "#F1E8E8" },
  statusText: { color: colors.ink, fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  chevron: { color: colors.muted, fontSize: 22, marginLeft: 1 },
  stateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 22, alignItems: "center", gap: 10 },
  stateTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  stateMessage: { color: colors.muted, textAlign: "center", fontSize: 13, lineHeight: 20 },
  actionButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  actionText: { color: colors.primary, fontWeight: "800" },
  loading: { alignItems: "center", padding: 24, gap: 10 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 10 },
  loadMore: { alignItems: "center", backgroundColor: colors.primarySoft, padding: 14, borderRadius: radius.md },
  loadMoreText: { color: colors.primary, fontWeight: "800" },
  backLink: { alignSelf: "flex-start", paddingVertical: 4 },
  backLinkText: { color: colors.primary, fontWeight: "800" },
  detailCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 24, alignItems: "center", gap: 8 },
  detailName: { color: colors.ink, fontSize: 22, fontWeight: "900", textAlign: "center" },
  detailAdmission: { color: colors.muted, fontSize: 13 },
  infoCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, gap: 12 },
  infoHeading: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  infoRow: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
  infoLabel: { color: colors.muted, fontSize: 12, flex: 1 },
  infoValue: { color: colors.ink, fontSize: 12, fontWeight: "700", flex: 1.3, textAlign: "right", textTransform: "capitalize" },
  addressText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
});
