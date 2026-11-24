import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const idOf = (value) => value?._id || value?.id || value;
const nameOf = (value) => value?.name || "—";
const dateOf = (value) => value ? new Date(value).toLocaleDateString() : "—";

export function EnrollmentsScreen({ onHome }) {
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState("");
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [moving, setMoving] = useState(null);
  const [targetClassId, setTargetClassId] = useState("");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [reason, setReason] = useState("");
  const [picker, setPicker] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [yearResponse, enrollmentResponse] = await Promise.all([
        apiRequest("/academic-years"),
        apiRequest(yearId ? `/enrollments?academicYearId=${encodeURIComponent(yearId)}` : "/enrollments"),
      ]);
      const availableYears = Array.isArray(yearResponse?.data) ? yearResponse.data : [];
      setYears(availableYears);
      const activeYear = availableYears.find((item) => item.status === "active") || availableYears[0];
      const effectiveYearId = yearId || activeYear?._id || "";
      if (!yearId && effectiveYearId) setYearId(effectiveYearId);
      if (!yearId && effectiveYearId) {
        const filtered = await apiRequest(`/enrollments?academicYearId=${encodeURIComponent(effectiveYearId)}`);
        setItems(Array.isArray(filtered?.data) ? filtered.data : []);
      } else setItems(Array.isArray(enrollmentResponse?.data) ? enrollmentResponse.data : []);
      const classResponse = effectiveYearId ? await apiRequest(`/classes?academicYearId=${encodeURIComponent(effectiveYearId)}&status=active`) : { data: [] };
      setClasses(Array.isArray(classResponse?.data) ? classResponse.data : []);
    } catch (e) { setError(e.message || "Unable to load enrollments."); }
    finally { setLoading(false); }
  }, [yearId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    if (!targetClassId) { setSections([]); setTargetSectionId(""); return undefined; }
    apiRequest(`/sections?classId=${encodeURIComponent(targetClassId)}&status=active`)
      .then((response) => { if (alive) setSections(Array.isArray(response?.data) ? response.data : []); })
      .catch((e) => { if (alive) setError(e.message || "Unable to load sections."); });
    return () => { alive = false; };
  }, [targetClassId]);

  const startMove = (item) => {
    setMoving(item); setTargetClassId(idOf(item.classId) || ""); setTargetSectionId(idOf(item.sectionId) || ""); setReason(""); setNotice(""); setError("");
  };
  const submitMove = async () => {
    if (!moving || !targetClassId || !reason.trim()) { setError("Select a class and enter a reason for the placement change."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/enrollments/${moving._id}/transfer`, {
        method: "PATCH",
        body: { targetClassId, targetSectionId: targetSectionId || null, reason: reason.trim() },
      });
      if (!response?.success) throw new Error(response?.message || "Unable to move student.");
      setNotice("Placement updated. Previous class and section remain in academic history.");
      setMoving(null);
      await load();
    } catch (e) { setError(e.message || "Unable to move student."); }
    finally { setSaving(false); }
  };

  const pickerItems = picker === "class" ? classes : sections;
  const selectedClass = classes.find((item) => item._id === targetClassId);
  const selectedSection = sections.find((item) => item._id === targetSectionId);
  return <ScrollView contentContainerStyle={s.content}>
    <View style={s.header}><View style={{ flex: 1 }}><Text style={s.kicker}>ACADEMIC PLACEMENT</Text><Text style={s.heading}>Enrollments</Text><Text style={s.muted}>Current class and section assignments</Text></View><TouchableOpacity onPress={onHome}><Text style={s.back}>Home</Text></TouchableOpacity></View>
    <Text style={s.label}>Academic year</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{years.map((item) => <TouchableOpacity key={item._id} onPress={() => { setYearId(item._id); setMoving(null); }} style={[s.chip, yearId === item._id && s.activeChip]}><Text style={[s.chipText, yearId === item._id && s.activeText]}>{item.name}</Text></TouchableOpacity>)}</ScrollView>
    {notice ? <Text style={s.notice}>{notice}</Text> : null}
    {error ? <Text style={s.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.primary}/> : items.length === 0 ? <View style={s.card}><Text style={s.name}>No enrollments found</Text><Text style={s.muted}>Choose another academic year or admit a student with an initial placement.</Text></View> : items.map((item) => <View key={item._id} style={s.card}>
      <Text style={s.name}>{[item.studentId?.firstName, item.studentId?.lastName].filter(Boolean).join(" ") || "Student"}</Text>
      <Text style={s.muted}>Admission no. {item.studentId?.admissionNumber || "—"}</Text>
      <View style={s.detail}><Text style={s.label}>Class</Text><Text style={s.value}>{nameOf(item.classId)}</Text></View>
      <View style={s.detail}><Text style={s.label}>Section</Text><Text style={s.value}>{nameOf(item.sectionId)}</Text></View>
      <View style={s.detail}><Text style={s.label}>Enrolled</Text><Text style={s.value}>{dateOf(item.enrollmentDate)}</Text></View>
      <View style={s.detail}><Text style={s.label}>Status</Text><Text style={s.value}>{item.status}</Text></View>
      {item.status === "active" ? <TouchableOpacity style={s.button} onPress={() => startMove(item)}><Text style={s.buttonText}>Move class / section</Text></TouchableOpacity> : null}
    </View>)}
    <Modal visible={!!moving} transparent animationType="slide" onRequestClose={() => setMoving(null)}>
      <View style={s.backdrop}><View style={s.modal}>
        <Text style={s.modalTitle}>Move student</Text>
        <Text style={s.muted}>{[moving?.studentId?.firstName, moving?.studentId?.lastName].filter(Boolean).join(" ")}</Text>
        <Text style={s.label}>Target class *</Text>
        <TouchableOpacity style={s.select} onPress={() => setPicker("class")}><Text style={s.value}>{selectedClass?.name || "Select class"}</Text><Text style={s.value}>⌄</Text></TouchableOpacity>
        <Text style={s.label}>Target section (optional)</Text>
        <TouchableOpacity style={s.select} disabled={!targetClassId} onPress={() => setPicker("section")}><Text style={s.value}>{selectedSection?.name || "No section"}</Text><Text style={s.value}>⌄</Text></TouchableOpacity>
        <Text style={s.label}>Reason for change *</Text>
        <TextInput style={[s.input, s.multiline]} value={reason} onChangeText={setReason} multiline placeholder="Record the reason for this placement change"/>
        <TouchableOpacity style={s.button} disabled={saving} onPress={submitMove}><Text style={s.buttonText}>{saving ? "Saving…" : "Confirm move"}</Text></TouchableOpacity>
        <TouchableOpacity style={s.cancel} onPress={() => setMoving(null)} disabled={saving}><Text style={s.back}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker("")}><View style={s.backdrop}><View style={s.modal}><Text style={s.modalTitle}>Select {picker}</Text><ScrollView style={{ maxHeight: 320 }}>{(picker === "section" ? [{ _id: "", name: "No section" }, ...pickerItems] : pickerItems).map((item) => <TouchableOpacity key={item._id} style={s.option} onPress={() => { if (picker === "class") { setTargetClassId(item._id); setTargetSectionId(""); } else setTargetSectionId(item._id); setPicker(""); }}><Text style={s.value}>{item.name}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={s.cancel} onPress={() => setPicker("")}><Text style={s.back}>Cancel</Text></TouchableOpacity></View></View></Modal>
  </ScrollView>;
}

const s = StyleSheet.create({
 content:{padding:spacing.lg,paddingBottom:36,gap:spacing.md},header:{flexDirection:"row",alignItems:"center",gap:12},kicker:{fontSize:10,fontWeight:"900",letterSpacing:1.2,color:colors.accent},heading:{fontSize:25,fontWeight:"900",color:colors.ink,marginTop:4},muted:{fontSize:12,color:colors.muted,marginTop:4},back:{color:colors.primary,fontWeight:"800"},label:{fontSize:12,color:colors.muted,fontWeight:"800"},chips:{gap:8},chip:{paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:colors.border,borderRadius:radius.pill},activeChip:{backgroundColor:colors.primary,borderColor:colors.primary},chipText:{color:colors.ink,fontWeight:"700"},activeText:{color:colors.white},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:9},name:{fontSize:16,fontWeight:"900",color:colors.ink},detail:{flexDirection:"row",justifyContent:"space-between",gap:12},value:{color:colors.ink,fontWeight:"700"},button:{backgroundColor:colors.primary,padding:13,borderRadius:radius.md,alignItems:"center",marginTop:5},buttonText:{color:colors.white,fontWeight:"900"},notice:{color:colors.success,fontWeight:"700"},error:{color:colors.danger},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,0.4)",justifyContent:"center",padding:20},modal:{backgroundColor:colors.surface,borderRadius:radius.lg,padding:18,gap:12},modalTitle:{fontSize:19,fontWeight:"900",color:colors.ink},select:{flexDirection:"row",justifyContent:"space-between",borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:12},input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:12,color:colors.ink},multiline:{minHeight:80,textAlignVertical:"top"},cancel:{alignItems:"center",padding:10},option:{paddingVertical:13,borderBottomWidth:1,borderBottomColor:colors.border}
});
