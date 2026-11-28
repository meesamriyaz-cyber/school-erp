import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createStudent } from "../services/studentService";
import { apiRequest } from "../services/apiClient";
import { createEnrollment, getAdmissionAcademicYears, getAdmissionClasses, getAdmissionSections } from "../services/enrollmentService";
import { colors, radius, spacing } from "../theme/tokens";

const relationships = ["mother", "father", "uncle", "aunt", "legal_guardian", "grandparent", "step_parent", "sibling", "other"];
const today = () => new Date().toISOString().slice(0, 10);
const labelOf = (item) => item?.name || item?.title || item?.label || item?.academicYearName || "Unnamed";
const idOf = (item) => item?._id || item?.id;

export function StudentAdmissionScreen({ onCancel, onComplete }) {
  const [form, setForm] = useState({ admissionNumber: "", firstName: "", lastName: "", dateOfBirth: "", admissionDate: today(), guardianName: "", guardianRelationship: "father", guardianPhone: "", guardianEmail: "", address: "", fatherFirstName: "", fatherLastName: "", fatherPhone: "", fatherEmail: "", fatherPhotoUrl: "", motherFirstName: "", motherLastName: "", motherPhone: "", motherEmail: "", motherPhotoUrl: "" });
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [year, setYear] = useState(null);
  const [schoolClass, setSchoolClass] = useState(null);
  const [section, setSection] = useState(null);
  const [picker, setPicker] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdStudentId, setCreatedStudentId] = useState(null);
  const [partialMessage, setPartialMessage] = useState("");
  const [parentVerification, setParentVerification] = useState([]);

  useEffect(() => {
    getAdmissionAcademicYears().then((items) => {
      const activeYears = items.filter((item) => item.status === "active" || item.isActive);
      setYears(activeYears);
      const active = activeYears[0] || null;
      setYear(active);
    }).catch((e) => setError(e.message || "Unable to load academic years.")).finally(() => setLoadingOptions(false));
  }, []);

  useEffect(() => {
    if (!year) { setClasses([]); setSchoolClass(null); return; }
    getAdmissionClasses(idOf(year)).then((items) => { setClasses(items); setSchoolClass(null); setSection(null); }).catch((e) => setError(e.message || "Unable to load classes."));
  }, [year]);

  useEffect(() => {
    if (!schoolClass) { setSections([]); setSection(null); return; }
    getAdmissionSections(idOf(schoolClass)).then((items) => { setSections(items); setSection(null); }).catch((e) => setError(e.message || "Unable to load sections."));
  }, [schoolClass]);

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const choices = picker === "year" ? years : picker === "class" ? classes : picker === "section" ? sections : relationships.map((value) => ({ value, label: value.replaceAll("_", " ") }));
  const selected = picker === "year" ? year : picker === "class" ? schoolClass : picker === "section" ? section : null;
  const selectChoice = (item) => {
    if (picker === "year") setYear(item);
    else if (picker === "class") setSchoolClass(item);
    else if (picker === "section") setSection(item);
    else change("guardianRelationship", item.value);
    setPicker("");
  };

  const submit = async () => {
    setError(""); setPartialMessage("");
    if (!form.admissionNumber.trim() || !form.firstName.trim() || !form.guardianName.trim()) {
      setError("Admission number, first name, and guardian name are required.");
      return;
    }
    if (!year || !schoolClass) { setError("Select an academic year and class."); return; }
    if (form.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) { setError("Date of birth must use YYYY-MM-DD."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.admissionDate)) { setError("Admission date must use YYYY-MM-DD."); return; }
    setSaving(true);
    try {
      let studentId = createdStudentId;
      if (!studentId) {
        const student = await createStudent({
          admissionNumber: form.admissionNumber.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim() || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          admissionDate: form.admissionDate,
          guardianName: form.guardianName.trim(),
          guardianRelationship: form.guardianRelationship,
          guardianPhone: form.guardianPhone.trim() || undefined,
          guardianEmail: form.guardianEmail.trim() || undefined,
          parents: {
            father: form.fatherFirstName.trim() ? { firstName: form.fatherFirstName.trim(), lastName: form.fatherLastName.trim(), phone: form.fatherPhone.trim() || undefined, email: form.fatherEmail.trim() || undefined, photoUrl: form.fatherPhotoUrl.trim() || undefined } : undefined,
            mother: form.motherFirstName.trim() ? { firstName: form.motherFirstName.trim(), lastName: form.motherLastName.trim(), phone: form.motherPhone.trim() || undefined, email: form.motherEmail.trim() || undefined, photoUrl: form.motherPhotoUrl.trim() || undefined } : undefined,
          },
          address: form.address.trim() ? { line1: form.address.trim() } : undefined,
        });
        studentId = idOf(student);
        const parentLinks = student?.parentVerification || [];
        setParentVerification(parentLinks);
        if (!studentId) throw new Error("Student was created, but the API did not return an ID. Please contact support before retrying.");
        setCreatedStudentId(studentId);
        const verificationResults = await Promise.all(parentLinks.filter((parent) => parent.emailVerificationRequired).map(async (parent) => {
          const email = parent.relationship === "father" ? form.fatherEmail.trim() : form.motherEmail.trim();
          try {
            await apiRequest(`/guardians/${parent.guardianId}/email-verification/send`, { method: "POST", body: { email } });
            return { ...parent, sent: true };
          } catch (sendError) { return { ...parent, sent: false, error: sendError?.message || "Could not send verification email" }; }
        }));
        setParentVerification(verificationResults);
        if (verificationResults.some((item) => !item.sent)) setPartialMessage("Student profile created. One or more parent verification emails could not be sent; an administrator can resend them from the guardian record.");
        else if (verificationResults.length) setPartialMessage("Student profile created. Verification codes have been sent to the supplied parent email addresses.");
      }
      try {
        await createEnrollment({
          studentId,
          academicYearId: idOf(year),
          classId: idOf(schoolClass),
          sectionId: section ? idOf(section) : null,
          enrollmentDate: form.admissionDate,
          reAdmissionReason: "",
          notes: "",
        });
      } catch (enrollmentError) {
        setPartialMessage("Student profile created successfully, but enrollment failed. Retry enrollment below; the student will not be created again.");
        setError(enrollmentError.message || "Enrollment failed.");
        return;
      }
      onComplete?.();
    } catch (e) {
      setError(e.message || "Unable to create student.");
    } finally {
      setSaving(false);
    }
  };

  return <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><TouchableOpacity onPress={onCancel}><Text style={styles.back}>‹ Back</Text></TouchableOpacity><Text style={styles.title}>New admission</Text><Text style={styles.subtitle}>Student details and academic enrollment</Text></View>
    {loadingOptions ? <ActivityIndicator color={colors.primary} /> : null}
    <Text style={styles.sectionTitle}>Student details</Text>
    <Field label="Admission number *" value={form.admissionNumber} onChange={(v) => change("admissionNumber", v)} placeholder="e.g. 2026-001" />
    <Field label="First name *" value={form.firstName} onChange={(v) => change("firstName", v)} />
    <Field label="Last name" value={form.lastName} onChange={(v) => change("lastName", v)} />
    <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChange={(v) => change("dateOfBirth", v)} placeholder="2019-04-12" />
    <Field label="Admission date (YYYY-MM-DD) *" value={form.admissionDate} onChange={(v) => change("admissionDate", v)} />
    <Text style={styles.sectionTitle}>Primary guardian (legacy contact)</Text>
    <Field label="Guardian name *" value={form.guardianName} onChange={(v) => change("guardianName", v)} />
    <SelectRow label="Relationship" value={form.guardianRelationship.replaceAll("_", " ")} onPress={() => setPicker("relationship")} />
    <Field label="Phone" value={form.guardianPhone} onChange={(v) => change("guardianPhone", v)} keyboardType="phone-pad" />
    <Field label="Email" value={form.guardianEmail} onChange={(v) => change("guardianEmail", v)} keyboardType="email-address" />
    <Text style={styles.sectionTitle}>Father details (optional)</Text>
    <Field label="Father first name" value={form.fatherFirstName} onChange={(v) => change("fatherFirstName", v)} />
    <Field label="Father last name" value={form.fatherLastName} onChange={(v) => change("fatherLastName", v)} />
    <Field label="Father phone (10 digits)" value={form.fatherPhone} onChange={(v) => change("fatherPhone", v.replace(/[^0-9]/g, "").slice(0, 10))} keyboardType="phone-pad" />
    <Field label="Father email (OTP verification)" value={form.fatherEmail} onChange={(v) => change("fatherEmail", v)} keyboardType="email-address" />
    <Field label="Father photo URL (HTTPS)" value={form.fatherPhotoUrl} onChange={(v) => change("fatherPhotoUrl", v)} />
    <Text style={styles.sectionTitle}>Mother details (optional)</Text>
    <Field label="Mother first name" value={form.motherFirstName} onChange={(v) => change("motherFirstName", v)} />
    <Field label="Mother last name" value={form.motherLastName} onChange={(v) => change("motherLastName", v)} />
    <Field label="Mother phone (10 digits)" value={form.motherPhone} onChange={(v) => change("motherPhone", v.replace(/[^0-9]/g, "").slice(0, 10))} keyboardType="phone-pad" />
    <Field label="Mother email (OTP verification)" value={form.motherEmail} onChange={(v) => change("motherEmail", v)} keyboardType="email-address" />
    <Field label="Mother photo URL (HTTPS)" value={form.motherPhotoUrl} onChange={(v) => change("motherPhotoUrl", v)} />
    <Field label="Address" value={form.address} onChange={(v) => change("address", v)} />
    <Text style={styles.sectionTitle}>Academic placement</Text>
    <SelectRow label="Academic year *" value={year ? labelOf(year) : "Select academic year"} onPress={() => setPicker("year")} />
    <SelectRow label="Class *" value={schoolClass ? labelOf(schoolClass) : "Select class"} onPress={() => setPicker("class")} disabled={!year || !classes.length} />
    <SelectRow label="Section" value={section ? labelOf(section) : "Optional — select section"} onPress={() => setPicker("section")} disabled={!schoolClass || !sections.length} />
    {partialMessage ? <View style={styles.notice}><Text style={styles.noticeText}>{partialMessage}</Text></View> : null}
    {parentVerification.map((item) => <Text key={item.guardianId} style={styles.footnote}>{item.relationship}: {item.sent ? "verification email sent" : item.error || "verification email pending"}</Text>)}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <TouchableOpacity style={[styles.submit, saving && styles.disabled]} disabled={saving} onPress={submit}><Text style={styles.submitText}>{saving ? "Saving…" : createdStudentId ? "Retry enrollment" : "Create admission"}</Text>{saving ? <ActivityIndicator color={colors.white}/> : null}</TouchableOpacity>
    <Text style={styles.footnote}>Student profile and enrollment are saved separately. If enrollment fails, retry without duplicating the student profile.</Text>
    <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker("")}><View style={styles.modalBackdrop}><View style={styles.modal}><Text style={styles.modalTitle}>{picker === "year" ? "Academic year" : picker === "class" ? "Class" : picker === "section" ? "Section" : "Guardian relationship"}</Text><ScrollView style={{ maxHeight: 360 }}>{(picker === "section" ? [{ value: null, label: "No section" }, ...choices] : choices).map((item, index) => <TouchableOpacity key={idOf(item) || item.value || index} style={styles.option} onPress={() => selectChoice(item)}><Text style={styles.optionText}>{item.label || labelOf(item)}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={styles.cancelOption} onPress={() => setPicker("")}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity></View></View></Modal>
  </ScrollView>;
}

function Field({ label, value, onChange, placeholder, keyboardType }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder || label} placeholderTextColor={colors.muted} keyboardType={keyboardType} autoCapitalize={keyboardType === "email-address" ? "none" : "words"} /></View>;
}
function SelectRow({ label, value, onPress, disabled }) {
  return <TouchableOpacity style={[styles.select, disabled && styles.disabled]} onPress={onPress} disabled={disabled}><View><Text style={styles.label}>{label}</Text><Text style={styles.selectValue}>{value}</Text></View><Text style={styles.selectArrow}>⌄</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 36, gap: spacing.md },
  header: { gap: 5, marginBottom: spacing.sm },
  back: { color: colors.primary, fontWeight: "800", marginBottom: 8 },
  title: { color: colors.ink, fontSize: 25, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 13 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", marginTop: spacing.md },
  field: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, color: colors.ink, fontSize: 14 },
  select: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  selectValue: { color: colors.ink, fontWeight: "700", marginTop: 4, textTransform: "capitalize" },
  selectArrow: { color: colors.primary, fontSize: 20 },
  submit: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, backgroundColor: colors.primary, borderRadius: radius.md, padding: 15, marginTop: spacing.md },
  submitText: { color: colors.white, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13 },
  notice: { backgroundColor: "#FFF3DF", borderRadius: radius.md, padding: 12 },
  noticeText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 8 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", marginBottom: 6 },
  option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.ink, fontSize: 14, textTransform: "capitalize" },
  cancelOption: { padding: 12, alignItems: "center" },
  cancelText: { color: colors.primary, fontWeight: "800" },
});
