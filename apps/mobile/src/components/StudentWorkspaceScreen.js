import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const sections = [
  { key: "overview", label: "Overview" },
  { key: "profile", label: "My profile" },
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
  const [documentsRefreshing, setDocumentsRefreshing] = useState(false);
  const [resultsRefreshing, setResultsRefreshing] = useState(false);
  const [sectionRefreshing, setSectionRefreshing] = useState("");
  const [noticesRefreshing, setNoticesRefreshing] = useState(false);
  const [failedPhotos, setFailedPhotos] = useState({});
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

  const refreshSection = async (key) => {
    const requests = key === "learning"
      ? [["homework", "/portal/homework"], ["submissions", "/portal/homework-submissions"]]
      : key === "attendance" ? [["attendance", "/portal/attendance"]]
      : key === "fees" ? [["fees", "/portal/fees"]]
      : key === "results" ? [["results", "/portal/results"]]
      : key === "timetable" ? [["timetable", "/portal/timetable"]]
      : key === "documents" ? [["documents", "/portal/documents"]]
      : key === "notices" ? [["notices", "/portal/announcements"], ["notifications", "/portal/notifications"]]
      : key === "profile" ? [["profile", "/portal/profile"]] : [];
    if (!requests.length) return;
    setSectionRefreshing(key);
    if (key === "results") setResultsRefreshing(true);
    if (key === "documents") setDocumentsRefreshing(true);
    if (key === "notices") setNoticesRefreshing(true);
    const responses = await Promise.allSettled(requests.map(([, endpoint]) => apiRequest(endpoint)));
    const failed = [];
    setData((previous) => {
      const next = { ...previous };
      responses.forEach((response, index) => {
        const [name] = requests[index];
        if (response.status === "fulfilled") next[name] = response.value;
        else failed.push(name);
      });
      return next;
    });
    setPartialErrors((previous) => [...previous.filter((name) => !requests.some(([requestName]) => requestName === name)), ...failed]);
    if (failed.length) Alert.alert(failed.length === requests.length ? "Section could not be refreshed" : "Some information could not be refreshed", "Unavailable: " + failed.join(", ") + ". Previously loaded information has been kept.");
    setSectionRefreshing("");
    setResultsRefreshing(false);
    setDocumentsRefreshing(false);
    setNoticesRefreshing(false);
  };

  useEffect(() => { load(); }, [load]);

  const profile = data.profile?.data?.[0] || null;
  const student = profile?.student || null;
  const enrollment = profile?.currentEnrollment || null;
  const attendanceSummary = data.attendance?.summary || {};
  const feeSummary = data.fees?.summary || {};
  // The portal API returns each assignment as { homework, student, enrollmentId }.
  // Normalize here so the rest of the mobile workspace uses the actual homework record.
  const homework = list(data.homework).map((entry) => entry?.homework
    ? { ...entry.homework, student: entry.student || null, enrollmentId: entry.enrollmentId || null }
    : entry);
  const submissions = list(data.submissions);
  const fees = list(data.fees);
  const results = list(data.results);
  const timetableGroups = data.timetable?.data || [];
  const timetable = timetableGroups.flatMap((item) => item.entries || []);
  const weekdayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const timetableByDay = timetable.reduce((groups, entry) => {
    const day = Number(entry.dayOfWeek);
    const key = day >= 1 && day <= 6 ? day : 0;
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
    return groups;
  }, {});
  Object.values(timetableByDay).forEach((entries) => entries.sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || ""))));
  const documents = list(data.documents);
  const notices = list(data.notices);
  const notifications = list(data.notifications);

  const submissionByHomework = useMemo(() => new Map(submissions.map((item) => [String(item.homeworkId?._id || item.homeworkId), item])), [submissions]);
  const pendingHomework = homework.filter((item) => !submissionByHomework.has(String(item._id)));

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
      {sections.map((item) => <TouchableOpacity key={item.key} onPress={() => { setSection(item.key); refreshSection(item.key); }} accessibilityRole="tab" accessibilityState={{ selected: section === item.key }} hitSlop={6} style={[styles.tab, section === item.key && styles.tabActive]}><Text style={[styles.tabText, section === item.key && styles.tabTextActive]}>{item.label}</Text></TouchableOpacity>)}
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
        <View style={styles.metric}><Text style={styles.metricValue}>{pendingHomework.length}</Text><Text style={styles.metricLabel}>Pending work</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{results.length}</Text><Text style={styles.metricLabel}>Results</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{money(feeSummary.balance)}</Text><Text style={styles.metricLabel}>Fee balance</Text></View>
      </View>
      <Panel title="Recent examination results" subtitle="Your published report cards">
        {results.length ? results.slice(0, 3).map((item, index) => <DataRow key={String(item.examination?._id || item._id || index)} title={item.examination?.name || item.name || "Examination"} subtitle={[item.result?.grade || item.grade, item.result?.status || item.status].filter(Boolean).join(" · ")} trailing={item.result?.percentage != null ? item.result.percentage + "%" : item.percentage != null ? item.percentage + "%" : ""} onPress={() => setSection("results")}/>) : <Text style={styles.empty}>Published results will appear here when available.</Text>}
      </Panel>
      <Panel title="Homework to complete" subtitle={pendingHomework.length + " assignments awaiting submission"}>
        {pendingHomework.length ? pendingHomework.slice(0, 3).map((item) => <DataRow key={String(item._id)} title={titleOf(item, "Homework")} subtitle={[item.subjectId?.name, item.dueDate ? "Due " + dateOf(item.dueDate) : ""].filter(Boolean).join(" · ")} trailing="Open" onPress={() => setSection("learning")}/>) : <Text style={styles.empty}>You are all caught up on assigned homework.</Text>}
      </Panel>
      <Panel title="Latest notices" subtitle="Updates from your school">{renderRows(notices.slice(0, 4), "No current school notices.", (item) => ({ title: titleOf(item, "School notice"), subtitle: item.body || item.category || "" }))}</Panel>
      <Panel title="Recent notifications">{renderRows(notifications.slice(0, 4), "You have no new notifications.", (item) => ({ title: item.title || "School update", subtitle: item.body || dateOf(item.createdAt) }))}</Panel>
    </> : null}

    {!loading && !error && section === "profile" ? <Panel title="Student profile" subtitle="Your school identity and current academic placement">
      <View style={styles.familyPhotos}>
        {[{ key: "student", label: "Student", name: [student?.firstName, student?.lastName].filter(Boolean).join(" "), photoUrl: student?.photoUrl }, ...["father", "mother"].map((relationship) => {
          const parent = (profile?.parents || []).find((item) => item.relationship === relationship);
          return { key: relationship, label: relationship === "father" ? "Father" : "Mother", name: parent?.name || "Details not added", photoUrl: parent?.photoUrl, phone: parent?.phone, email: parent?.email, emailVerified: parent?.emailVerified };
        })].map((person) => <View key={person.key} style={styles.familyPerson}>
          <View style={styles.avatarCircle}>{person.photoUrl && !failedPhotos[person.key] ? <Image source={{ uri: person.photoUrl }} style={styles.avatarImage} onError={() => setFailedPhotos((previous) => ({ ...previous, [person.key]: true }))}/> : <Text style={styles.avatarInitial}>{person.key === "student" ? "S" : person.key === "father" ? "F" : "M"}</Text>}</View>
          <Text style={styles.familyLabel}>{person.label}</Text>
          <Text style={styles.familyName} numberOfLines={2}>{person.name || "Not available"}</Text>
        </View>)}
      </View>
      {["father", "mother"].map((relationship) => {
        const parent = (profile?.parents || []).find((item) => item.relationship === relationship);
        const label = relationship === "father" ? "Father" : "Mother";
        return <View key={relationship} style={styles.parentContact}>
          <DataRow title={label} subtitle={parent?.name || "Details not added by school"}/>
          <DataRow title={label + " phone"} subtitle={parent?.phone || "Not provided"}/>
          <DataRow title={label + " email"} subtitle={parent?.email ? parent.email + (parent.emailVerified ? " · Email verified" : " · Email not verified") : "Not provided"}/>
        </View>;
      })}
      <DataRow title="Full name" subtitle={[student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Not available"}/>
      <DataRow title="Admission number" subtitle={student?.admissionNumber || "Not available"}/>
      <DataRow title="Date of birth" subtitle={dateOf(student?.dateOfBirth) || "Not available"}/>
      <DataRow title="Gender" subtitle={(student?.gender || "Not specified").replaceAll("_", " ")}/>
      <DataRow title="Admission date" subtitle={dateOf(student?.admissionDate) || "Not available"}/>
      <DataRow title="Current class" subtitle={[enrollment?.classId?.name, enrollment?.sectionId?.name].filter(Boolean).join(" · ") || "No active class placement"}/>
      <DataRow title="Academic year" subtitle={enrollment?.academicYearId?.name || "Not available"}/>
      <DataRow title="Address" subtitle={[student?.address?.line1, student?.address?.line2, student?.address?.city, student?.address?.district, student?.address?.state, student?.address?.postalCode].filter(Boolean).join(", ") || "Not available"}/>
      <Text style={styles.profileReadOnly}>Profile information is managed by your school. Contact the school office if any details need correction.</Text>
    </Panel> : null}

    {!loading && !error && section === "learning" ? <>
      <Panel title="Homework & assignments" subtitle={sectionRefreshing === "learning" ? "Refreshing assignments and submissions…" : "Work assigned to your class"}>
        {homework.length ? homework.map((item) => {
          const submission = submissionByHomework.get(String(item._id));
          const reviewed = submission?.status === "reviewed";
          const submissionLabel = reviewed ? "Reviewed" : submission ? "Submitted" : "Submit";
          const submissionSubtitle = [item.subjectId?.name, item.dueDate ? "Due " + dateOf(item.dueDate) : "", submission?.submittedAt ? "Submitted " + dateOf(submission.submittedAt) : ""].filter(Boolean).join(" · ");
          return <DataRow key={String(item._id)} title={titleOf(item, "Homework")} subtitle={submissionSubtitle} trailing={submissionLabel} onPress={() => {
            if (reviewed) {
              const feedback = [submission.feedback, submission.marksObtained != null ? "Marks: " + submission.marksObtained + (submission.maxMarks != null ? " / " + submission.maxMarks : "") : ""].filter(Boolean).join("\n");
              Alert.alert("Homework reviewed", feedback || "Your teacher has reviewed this submission.");
              return;
            }
            setSelectedHomework(item); setAnswer(submission?.answer || "");
          }}/>;
        }) : <Text style={styles.empty}>No homework has been assigned yet.</Text>}
      </Panel>
      <Panel title="My submissions">{renderRows(submissions, "No submissions yet.", (item) => ({ title: item.homeworkId?.title || "Assignment submission", subtitle: [item.status, item.submittedAt ? dateOf(item.submittedAt) : ""].filter(Boolean).join(" · "), trailing: item.marksObtained != null ? String(item.marksObtained) + "/" + item.maxMarks : "" }))}</Panel>
    </> : null}

    {!loading && !error && section === "attendance" ? <Panel title="Attendance record" subtitle={sectionRefreshing === "attendance" ? "Refreshing attendance…" : `${attendanceSummary.percentage == null ? "No percentage available" : attendanceSummary.percentage + "% attendance"} · ${attendanceSummary.marked || 0} marked records`}>
      <View style={styles.metrics}>{["present", "absent", "late", "excused"].map((key) => <View style={styles.metric} key={key}><Text style={styles.metricValue}>{attendanceSummary[key] || 0}</Text><Text style={styles.metricLabel}>{key}</Text></View>)}</View>
      {renderRows(list(data.attendance).slice(0, 30), "No attendance records found.", (item) => ({ title: dateOf(item.date) || "Attendance", subtitle: item.remarks || "", trailing: item.status || "" }))}
    </Panel> : null}

    {!loading && !error && section === "fees" ? <Panel title="Fees & payments" subtitle={sectionRefreshing === "fees" ? "Refreshing fee statement…" : `${feeSummary.invoiceCount || 0} invoices · Balance ${money(feeSummary.balance)}`}>
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

    {!loading && !error && section === "results" ? <Panel title="Examination results" subtitle={resultsRefreshing ? "Refreshing published report cards…" : "Published report cards and subject-wise performance"}>
      {results.length ? results.map((item, index) => {
        const examination = item.examination || {};
        const result = item.result || item;
        const subjects = Array.isArray(result.subjects) ? result.subjects : [];
        const studentName = [item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ");
        const resultStatus = result.status || item.status || "";
        return <View key={String(examination._id || item._id || index)} style={styles.reportCard}>
          <View style={styles.reportHeading}>
            <View style={styles.reportHeadingCopy}>
              <Text style={styles.reportKicker}>OFFICIAL EXAMINATION RESULT</Text>
              <Text style={styles.reportTitle}>{examination.name || item.name || "Examination"}</Text>
              <Text style={styles.reportMeta}>{[dateOf(examination.startDate), dateOf(examination.endDate)].filter(Boolean).join(" – ") || "Examination dates not available"}</Text>
              {examination.gradingScale ? <Text style={styles.reportMeta}>Grading scale: {examination.gradingScale}</Text> : null}
            </View>
            {resultStatus ? <View style={styles.resultBadge}><Text style={styles.resultBadgeText}>{String(resultStatus).replaceAll("_", " ").toUpperCase()}</Text></View> : null}
          </View>
          <View style={styles.reportStudent}>
            <View style={styles.reportInfo}><Text style={styles.reportLabel}>Student</Text><Text style={styles.reportValue}>{studentName || "Your report card"}</Text></View>
            <View style={styles.reportInfo}><Text style={styles.reportLabel}>Admission No.</Text><Text style={styles.reportValue}>{item.student?.admissionNumber || "—"}</Text></View>
            <View style={styles.reportInfo}><Text style={styles.reportLabel}>Academic year</Text><Text style={styles.reportValue}>{examination.academicYear?.name || "—"}</Text></View>
            {examination.academicTerm?.name ? <View style={styles.reportInfo}><Text style={styles.reportLabel}>Term</Text><Text style={styles.reportValue}>{examination.academicTerm.name}</Text></View> : null}
            <View style={styles.reportInfo}><Text style={styles.reportLabel}>Class / Section</Text><Text style={styles.reportValue}>{[examination.class?.name, examination.section?.name].filter(Boolean).join(" · ") || "—"}</Text></View>
          </View>
          <Text style={styles.subjectsTitle}>Subject-wise marks</Text>
          {subjects.length ? subjects.map((subject, subjectIndex) => <View key={String(subject.examSubjectId || subject._id || subjectIndex)} style={styles.subjectResult}>
            <View style={styles.subjectTop}>
              <Text style={styles.subjectName}>{subject.subject?.name || "Subject"}</Text>
              <Text style={styles.subjectMarks}>{subject.absent ? "Absent" : subject.marksObtained ?? "—"} / {subject.maxMarks ?? "—"}</Text>
            </View>
            <View style={styles.subjectDetails}>
              <Text style={styles.subjectDetail}>Pass: {subject.passMarks ?? "—"}</Text>
              <Text style={styles.subjectDetail}>Grade: {subject.grade || "—"}</Text>
              <Text style={styles.subjectDetail}>Status: {subject.status || "—"}</Text>
            </View>
            {subject.remarks ? <Text style={styles.subjectRemarks}>{subject.remarks}</Text> : null}
          </View>) : <Text style={styles.empty}>Subject-wise marks are not available for this result.</Text>}
          <View style={styles.reportSummary}>
            <View style={styles.reportTotal}><Text style={styles.reportLabel}>Total marks</Text><Text style={styles.reportTotalValue}>{result.totalObtained ?? "—"} / {result.totalMaximum ?? "—"}</Text></View>
            <View style={styles.reportTotal}><Text style={styles.reportLabel}>Percentage</Text><Text style={styles.reportTotalValue}>{result.percentage == null ? "—" : result.percentage + "%"}</Text></View>
            <View style={styles.reportTotal}><Text style={styles.reportLabel}>Overall grade</Text><Text style={styles.reportTotalValue}>{result.grade || "—"}</Text></View>
            <View style={styles.reportTotal}><Text style={styles.reportLabel}>Overall result</Text><Text style={styles.reportTotalValue}>{resultStatus ? String(resultStatus).replaceAll("_", " ").toUpperCase() : "—"}</Text></View>
          </View>
          <Text style={styles.reportFooter}>This report reflects the result published by your school.</Text>
        </View>;
      }) : <Text style={styles.empty}>No published results are available yet.</Text>}
    </Panel> : null}

    {!loading && !error && section === "timetable" ? <Panel title="My weekly timetable" subtitle="Your class periods, organised by weekday">
      {timetable.length ? Object.keys(timetableByDay).sort((a, b) => Number(a) - Number(b)).map((dayKey) => <View key={dayKey} style={styles.timetableDay}>
        <Text style={styles.timetableDayTitle}>{weekdayNames[Number(dayKey)] || "Other"}</Text>
        {timetableByDay[dayKey].map((item) => <View key={String(item._id)} style={styles.timetablePeriod}>
          <View style={styles.timetableTime}><Text style={styles.timetableTimeText}>{item.startTime || "—"}</Text><Text style={styles.timetableTimeEnd}>{item.endTime || ""}</Text></View>
          <View style={styles.timetablePeriodMain}><Text style={styles.rowTitle}>{item.assignmentId?.subjectId?.name || "Subject"}</Text><Text style={styles.rowSubtitle}>{[item.assignmentId?.teacherId?.firstName, item.assignmentId?.teacherId?.lastName].filter(Boolean).join(" ") || "Teacher not listed"}{item.room ? " · " + item.room : ""}</Text></View>
          <Text style={styles.timetablePeriodNumber}>{item.periodNumber ? "P" + item.periodNumber : ""}</Text>
        </View>)}
      </View>) : <Text style={styles.empty}>No timetable entries found.</Text>}
    </Panel> : null}

    {!loading && !error && section === "documents" ? <Panel title="My documents" subtitle={documentsRefreshing ? "Refreshing school-shared files…" : "Files shared by your school"}>
      {renderRows(documents, "No documents have been shared with you.", (item) => ({
        title: item.name || "Document",
        subtitle: [item.category?.replaceAll("_", " "), dateOf(item.createdAt), item.bytes ? (item.bytes / 1024).toFixed(0) + " KB" : ""].filter(Boolean).join(" · "),
        trailing: item.fileUrl ? "Open" : "Unavailable",
        onPress: item.fileUrl ? async () => {
          try {
            const supported = await Linking.canOpenURL(item.fileUrl);
            if (!supported) throw new Error("This document link cannot be opened on this device.");
            await Linking.openURL(item.fileUrl);
          } catch (openError) {
            Alert.alert("Unable to open document", openError?.message || "Please contact your school for a working document link.");
          }
        } : () => Alert.alert("Document unavailable", "This file does not currently have an accessible link. Please contact your school.")
      }))}
    </Panel> : null}

    {!loading && !error && section === "notices" ? <>
      <Panel title="School notices" subtitle={noticesRefreshing ? "Refreshing school updates…" : "Published announcements"}>{renderRows(notices, "No current notices.", (item) => ({ title: titleOf(item, "School notice"), subtitle: item.body || item.category || "" }))}</Panel>
      <Panel title="Notifications" subtitle={`${notifications.filter((item) => !item.readAt).length} unread${noticesRefreshing ? " · Refreshing…" : ""}`}>
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
        <Text style={styles.panelSubtitle}>{selectedHomework?.dueDate ? "Due " + dateOf(selectedHomework.dueDate) : "Written answer"} · Written submissions only</Text>
        {selectedHomework?.instructions ? <Text style={styles.rowSubtitle}>{selectedHomework.instructions}</Text> : null}
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
  familyPhotos: { flexDirection: "row", justifyContent: "space-around", gap: 8, paddingVertical: 12 },
  familyPerson: { flex: 1, alignItems: "center", gap: 5 },
  avatarCircle: { width: 68, height: 68, borderRadius: 34, overflow: "hidden", backgroundColor: "#EEF1F7", borderWidth: 1, borderColor: "#DDE3EE", alignItems: "center", justifyContent: "center" },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitial: { color: "#74809A", fontSize: 23, fontWeight: "800" },
  familyLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  familyName: { color: colors.ink, fontSize: 11, fontWeight: "700", textAlign: "center" },
  parentContact: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 },
  profileReadOnly: { color: "#778196", backgroundColor: "#F5F7FB", borderRadius: 10, padding: 12, fontSize: 11, lineHeight: 16 },
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
  timetableDay: { gap: 7, marginTop: 5 },
  timetableDayTitle: { color: "#4263EB", fontSize: 12, fontWeight: "900", letterSpacing: 0.5, marginTop: 6 },
  timetablePeriod: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 11, backgroundColor: "#F7F8FC", borderWidth: 1, borderColor: "#E9EDF5" },
  timetableTime: { width: 58, gap: 3 },
  timetableTimeText: { color: "#28364D", fontSize: 11, fontWeight: "900" },
  timetableTimeEnd: { color: "#8994A8", fontSize: 10 },
  timetablePeriodMain: { flex: 1, gap: 4 },
  timetablePeriodNumber: { color: "#4263EB", fontSize: 10, fontWeight: "900" },
  reportCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 12 },
  reportHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8, justifyContent: "space-between" },
  reportHeadingCopy: { flex: 1, gap: 4 },
  reportKicker: { color: "#4263EB", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  reportTitle: { color: "#28364D", fontSize: 16, fontWeight: "900" },
  reportMeta: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  resultBadge: { backgroundColor: "#EDF1FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  resultBadgeText: { color: "#3E5DDE", fontSize: 9, fontWeight: "900" },
  reportStudent: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 11, borderRadius: 10, backgroundColor: "#F7F8FC" },
  reportInfo: { minWidth: "44%", flexGrow: 1, gap: 3 },
  reportLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  reportValue: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  subjectsTitle: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  subjectResult: { padding: 10, borderRadius: 10, backgroundColor: "#FAFBFE", borderWidth: 1, borderColor: "#E9EDF5", gap: 6 },
  subjectTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  subjectName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  subjectMarks: { color: "#4263EB", fontSize: 11, fontWeight: "900" },
  subjectDetails: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  subjectDetail: { color: colors.muted, fontSize: 10 },
  subjectRemarks: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  reportSummary: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  reportTotal: { flex: 1, minWidth: "42%", padding: 9, borderRadius: 9, backgroundColor: "#F7F8FC", gap: 4 },
  reportTotalValue: { color: "#28364D", fontSize: 13, fontWeight: "900" },
  reportFooter: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  error: { backgroundColor: "#FDECEC", borderRadius: radius.md, padding: 15, gap: 10 },
  errorText: { color: colors.danger, fontSize: 13 },
  retry: { alignSelf: "flex-start", backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: colors.primary, fontWeight: "800" },
});
