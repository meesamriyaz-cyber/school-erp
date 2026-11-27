import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const categories = [
  ["birth_certificate", "Birth certificate"], ["identity_proof", "Identity proof"],
  ["address_proof", "Address proof"], ["previous_school", "Previous-school record"],
  ["transfer_certificate", "Transfer certificate"], ["medical", "Medical record"],
  ["photograph", "Photograph"], ["other", "Other"],
];
const studentName = (student) => [student.firstName, student.lastName].filter(Boolean).join(" ");
const formatSize = (bytes) => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export function StudentDocumentsScreen({ onHome }) {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [category, setCategory] = useState("birth_certificate");
  const [setAsProfilePhoto, setSetAsProfilePhoto] = useState(true);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getStudents().then((items) => { if (active) setStudents(items); })
      .catch((err) => { if (active) setError(err.message || "Unable to load students."); });
    return () => { active = false; };
  }, []);

  const loadDocuments = useCallback(async (id) => {
    if (!id) { setDocuments([]); return; }
    setLoading(true); setError("");
    try {
      const response = await apiRequest(`/students/${encodeURIComponent(id)}/documents`);
      setDocuments(response.data || []);
    } catch (err) { setError(err.message || "Unable to load documents."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDocuments(studentId); }, [studentId, loadDocuments]);

  async function getStudents() {
    const response = await apiRequest("/students?limit=100");
    return response.data || [];
  }

  const chooseFile = async () => {
    setError(""); setNotice("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      if (asset.size && asset.size > 10 * 1024 * 1024) { setError("File size must not exceed 10 MB."); return; }
      setFile(asset);
    } catch (err) { setError(err.message || "Unable to select file."); }
  };

  const upload = async () => {
    if (!studentId || !file) { setError("Select a student and a file."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const signed = await apiRequest(`/students/${encodeURIComponent(studentId)}/documents/signature`, { method: "POST", body: { category } });
      const sign = signed.data;
      // React Native 0.86 does not reliably accept the legacy { uri, name, type }
      // FormData part shape. Convert the picked local file to a Blob first.
      const fileResponse = await fetch(file.uri);
      if (!fileResponse.ok) throw new Error("Unable to read the selected file.");
      const fileBlob = await fileResponse.blob();
      const form = new FormData();
      form.append("file", fileBlob, file.name || "student-document");
      form.append("api_key", sign.apiKey);
      form.append("timestamp", String(sign.timestamp));
      form.append("folder", sign.folder);
      form.append("allowed_formats", sign.allowedFormats);
      form.append("public_id", sign.publicId);
      form.append("signature", sign.signature);
      const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`, { method: "POST", body: form });
      const uploaded = await cloudResponse.json();
      if (!cloudResponse.ok) throw new Error(uploaded?.error?.message || "Cloudinary upload failed.");
      await apiRequest(`/students/${encodeURIComponent(studentId)}/documents`, { method: "POST", body: {
        name: file.name || "Student document", category, fileUrl: uploaded.secure_url, publicId: uploaded.public_id,
        resourceType: uploaded.resource_type, format: uploaded.format, bytes: uploaded.bytes, notes, setAsProfilePhoto: category === "photograph" && setAsProfilePhoto,
      }});
      setFile(null); setNotes(""); setNotice(category === "photograph" && setAsProfilePhoto ? "Photograph uploaded and set as the student profile photo." : "Document uploaded successfully.");
      await loadDocuments(studentId);
    } catch (err) { setError(err.message || "Document upload failed."); }
    finally { setSaving(false); }
  };

  const remove = (document) => Alert.alert("Delete document record?", "The file will also be deleted from Cloudinary.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => {
      try {
        await apiRequest(`/students/${encodeURIComponent(studentId)}/documents/${encodeURIComponent(document._id)}`, { method: "DELETE" });
        setDocuments((current) => current.filter((item) => item._id !== document._id));
        setNotice("Document and Cloudinary file deleted.");
      } catch (err) { setError(err.message || "Unable to delete document."); }
    }},
  ]);

  return <ScrollView contentContainerStyle={styles.container}>
    <View style={styles.header}><Text style={styles.title}>Student Documents</Text><Text style={styles.subtitle}>Upload and manage student records</Text></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <Text style={styles.label}>Select student</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.studentList}>
      {students.map((student) => <TouchableOpacity key={student._id} style={[styles.studentChip, studentId === student._id && styles.studentChipActive]} onPress={() => setStudentId(student._id)}>
        <Text style={[styles.studentChipText, studentId === student._id && styles.studentChipTextActive]}>{student.admissionNumber} · {studentName(student)}</Text>
      </TouchableOpacity>)}
    </ScrollView>
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Upload document</Text>
      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryList}>{categories.map(([value, label]) => <TouchableOpacity key={value} style={[styles.category, category === value && styles.categoryActive]} onPress={() => setCategory(value)}><Text style={[styles.categoryText, category === value && styles.categoryTextActive]}>{label}</Text></TouchableOpacity>)}</View>
      <TouchableOpacity style={styles.fileButton} onPress={chooseFile}><Text style={styles.fileButtonText}>{file ? file.name : "Choose PDF or image"}</Text></TouchableOpacity>
      {category === "photograph" ? <TouchableOpacity style={styles.profilePhotoOption} onPress={() => setSetAsProfilePhoto((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: setAsProfilePhoto }}><View style={[styles.checkBox, setAsProfilePhoto && styles.checkBoxActive]}>{setAsProfilePhoto ? <Text style={styles.checkMark}>✓</Text> : null}</View><Text style={styles.profilePhotoOptionText}>Use this photograph as the student profile photo</Text></TouchableOpacity> : null}
      {file ? <Text style={styles.fileMeta}>{formatSize(file.size || 0)} · {file.mimeType || "File selected"}</Text> : null}
      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput value={notes} onChangeText={setNotes} placeholder="Add a note about this document" placeholderTextColor={colors.muted} multiline style={styles.input}/>
      <TouchableOpacity disabled={saving || !studentId || !file} onPress={upload} style={[styles.primaryButton, (saving || !studentId || !file) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.white}/> : <Text style={styles.primaryText}>Upload document</Text>}</TouchableOpacity>
      <Text style={styles.hint}>Maximum file size: 10 MB. Uploads use a short-lived signature from your school API.</Text>
    </View>
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Document register ({documents.length})</Text>
      {!studentId ? <Text style={styles.empty}>Choose a student to see their documents.</Text> : loading ? <ActivityIndicator color={colors.primary}/> : documents.length === 0 ? <Text style={styles.empty}>No documents uploaded yet.</Text> : documents.map((document) => <View key={document._id} style={styles.documentRow}>
        <View style={{ flex: 1, gap: 4 }}><Text style={styles.documentName}>{document.name}</Text><Text style={styles.documentMeta}>{categories.find(([value]) => value === document.category)?.[1] || document.category} · {formatSize(document.bytes)}</Text><Text style={styles.documentMeta}>{new Date(document.createdAt).toLocaleDateString()}</Text></View>
        <TouchableOpacity onPress={() => Linking.openURL(document.fileUrl)}><Text style={styles.link}>Open</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => remove(document)}><Text style={styles.delete}>Delete</Text></TouchableOpacity>
      </View>)}
    </View>
    <TouchableOpacity onPress={onHome} style={styles.back}><Text style={styles.link}>Back to dashboard</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 32 },
  header: { gap: 5 }, title: { color: colors.ink, fontSize: 22, fontWeight: "900" }, subtitle: { color: colors.muted, fontSize: 13 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  studentList: { gap: 8, paddingVertical: 4 }, studentChip: { padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  studentChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, studentChipText: { color: colors.ink, fontSize: 11, fontWeight: "700" }, studentChipTextActive: { color: colors.primary },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" }, categoryList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  category: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }, categoryActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  categoryText: { color: colors.muted, fontSize: 11, fontWeight: "700" }, categoryTextActive: { color: colors.primary },
  fileButton: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: "center" }, fileButtonText: { color: colors.primary, fontWeight: "800" },
  profilePhotoOption: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 }, checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, checkBoxActive: { backgroundColor: colors.primary, borderColor: colors.primary }, checkMark: { color: colors.white, fontSize: 13, fontWeight: "900" }, profilePhotoOptionText: { color: colors.ink, fontSize: 12, flex: 1 },
  fileMeta: { color: colors.muted, fontSize: 11 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.ink, padding: 12, minHeight: 72, textAlignVertical: "top" },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 14, alignItems: "center" }, primaryText: { color: colors.white, fontWeight: "900" }, disabled: { opacity: 0.5 },
  hint: { color: colors.muted, fontSize: 10, lineHeight: 15 }, documentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  documentName: { color: colors.ink, fontWeight: "800", fontSize: 13 }, documentMeta: { color: colors.muted, fontSize: 10 }, link: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  delete: { color: colors.danger, fontWeight: "800", fontSize: 12 }, empty: { color: colors.muted, fontSize: 12 }, error: { color: colors.danger, fontSize: 12 }, notice: { color: colors.success, fontSize: 12 }, back: { alignSelf: "center", padding: 12 },
});
