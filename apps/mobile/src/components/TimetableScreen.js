import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getTimetable, getTimetableAcademicYears, getTimetableClasses, getTimetableSections, getBellSchedule } from "../services/timetableService";
import { colors, radius, spacing } from "../theme/tokens";

const DAYS = [{ value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }];
const idOf = value => String(value?._id || value?.id || value || "");
const nameOf = value => value?.name || "—";
const teacherName = value => [value?.firstName, value?.lastName].filter(Boolean).join(" ") || value?.email || "Teacher";
function Chips({ label, value, items, onChange }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{items.map(item => <TouchableOpacity key={item.value} onPress={() => onChange(item.value)} style={[s.chip, value === item.value && s.chipActive]}><Text style={[s.chipText, value === item.value && s.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}</ScrollView></View>;
}
function PeriodCard({ entry, isTeacher }) {
  const assignment = entry.assignmentId || {};
  const subject = assignment.subjectId || {};
  const teacher = assignment.teacherId || {};
  return <View style={s.period}>
    <View style={s.timeBlock}><Text style={s.time}>{entry.startTime}–{entry.endTime}</Text><Text style={s.periodNo}>Period {entry.periodNumber}</Text></View>
    <View style={s.periodMain}><Text style={s.subject}>{nameOf(subject)}</Text><Text style={s.detail}>{isTeacher ? nameOf(entry.classId) : teacherName(teacher)}{entry.sectionId?.name ? " · " + entry.sectionId.name : ""}</Text><Text style={s.room}>{entry.room ? "Room " + entry.room : "Room not assigned"}</Text></View>
  </View>;
}
export function TimetableScreen({ user, onHome }) {
  const isTeacher = user?.role === "teacher";
  const [years, setYears] = useState([]), [classes, setClasses] = useState([]), [sections, setSections] = useState([]);
  const [yearId, setYearId] = useState(""), [classId, setClassId] = useState(""), [sectionId, setSectionId] = useState("");
  const [entries, setEntries] = useState([]), [schedule, setSchedule] = useState({ periods: [], breaks: [] });
  const [view, setView] = useState("week"), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState("");
  const loadEntries = useCallback(async (refresh = false, filters = {}) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const params = isTeacher ? {} : { academicYearId: filters.yearId ?? yearId, classId: filters.classId ?? classId, sectionId: filters.sectionId ?? sectionId };
      const response = await getTimetable(params);
      if (!response?.success || !Array.isArray(response.data)) throw new Error(response?.message || "Unable to load timetable.");
      setEntries(response.data);
    } catch (e) { setEntries([]); setError(e.message || "Unable to load timetable."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [isTeacher, yearId, classId, sectionId]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!isTeacher) {
          const data = await getTimetableAcademicYears();
          if (!alive) return;
          const available = data.filter(item => item.status !== "closed");
          setYears(available);
          const active = available.find(item => item.status === "active") || available[0];
          if (active) {
            const classData = await getTimetableClasses(active._id);
            if (!alive) return;
            setYearId(active._id); setClasses(classData); setClassId(classData[0]?._id || "");
          } else { setLoading(false); }
        }
      } catch (e) { if (alive) { setError(e.message || "Unable to load timetable setup."); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, [isTeacher]);
  useEffect(() => {
    if (isTeacher) { loadEntries(); return; }
    if (yearId && classId) loadEntries();
    else if (!loading) setEntries([]);
  }, [isTeacher, yearId, classId, sectionId]);
  useEffect(() => {
    let alive = true;
    if (!classId || isTeacher) { setSections([]); setSectionId(""); return () => { alive = false; }; }
    getTimetableSections(classId).then(data => { if (alive) setSections(data); }).catch(e => { if (alive) setError(e.message || "Unable to load sections."); });
    return () => { alive = false; };
  }, [classId, isTeacher]);
  useEffect(() => {
    let alive = true;
    if (!yearId) { setSchedule({ periods: [], breaks: [] }); return () => { alive = false; }; }
    getBellSchedule(yearId).then(data => { if (alive) setSchedule({ periods: data.periods || [], breaks: data.breaks || [] }); }).catch(() => { if (alive) setSchedule({ periods: [], breaks: [] }); });
    return () => { alive = false; };
  }, [yearId]);
  const sorted = useMemo(() => [...entries].sort((a,b) => a.dayOfWeek-b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.periodNumber-b.periodNumber), [entries]);
  const grouped = useMemo(() => DAYS.map(day => ({ ...day, entries: sorted.filter(entry => entry.dayOfWeek === day.value) })), [sorted]);
  const changeYear = async value => {
    setYearId(value); setClassId(""); setSectionId(""); setEntries([]);
    try { const data = await getTimetableClasses(value); setClasses(data); setClassId(data[0]?._id || ""); }
    catch (e) { setError(e.message || "Unable to load classes."); }
  };
  if (loading && !refreshing && entries.length === 0 && (isTeacher || yearId || error)) return <View style={s.loading}><ActivityIndicator color={colors.primary}/><Text style={s.muted}>Loading timetable…</Text></View>;
  return <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEntries(true)} tintColor={colors.primary}/>}>
    <View style={s.header}><View style={{flex:1}}><Text style={s.kicker}>ACADEMIC OPERATIONS</Text><Text style={s.title}>{isTeacher ? "My timetable" : "Class timetable"}</Text><Text style={s.muted}>{isTeacher ? "Your assigned teaching periods" : "View the weekly schedule by class and section"}</Text></View><TouchableOpacity style={s.home} onPress={onHome}><Text style={s.homeText}>Home</Text></TouchableOpacity></View>
    {!isTeacher ? <View style={s.panel}>
      <Chips label="Academic year" value={yearId} items={years.map(x=>({value:x._id,label:x.name}))} onChange={changeYear}/>
      <Chips label="Class" value={classId} items={classes.map(x=>({value:x._id,label:x.name}))} onChange={v=>{setClassId(v);setSectionId("");}}/>
      <Chips label="Section" value={sectionId} items={[{value:"",label:"All sections"},...sections.map(x=>({value:x._id,label:x.name}))]} onChange={setSectionId}/>
    </View> : null}
    {error ? <View style={s.message}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={()=>loadEntries()}><Text style={s.link}>Try again</Text></TouchableOpacity></View> : null}
    <View style={s.summary}><View><Text style={s.summaryValue}>{entries.length}</Text><Text style={s.muted}>Weekly periods</Text></View><View><Text style={s.summaryValue}>{new Set(entries.map(e=>idOf(e.assignmentId?.subjectId))).size}</Text><Text style={s.muted}>Subjects</Text></View><View><Text style={s.summaryValue}>{new Set(entries.map(e=>idOf(e.classId))).size}</Text><Text style={s.muted}>Classes</Text></View></View>
    <View style={s.toggle}><TouchableOpacity onPress={()=>setView("week")} style={[s.toggleItem,view==="week"&&s.toggleActive]}><Text style={[s.toggleText,view==="week"&&s.toggleTextActive]}>Weekly view</Text></TouchableOpacity><TouchableOpacity onPress={()=>setView("list")} style={[s.toggleItem,view==="list"&&s.toggleActive]}><Text style={[s.toggleText,view==="list"&&s.toggleTextActive]}>List view</Text></TouchableOpacity></View>
    {loading ? <View style={s.loading}><ActivityIndicator color={colors.primary}/><Text style={s.muted}>Updating timetable…</Text></View> : entries.length === 0 ? <View style={s.panel}><Text style={s.emptyTitle}>No timetable periods found</Text><Text style={s.muted}>{isTeacher ? "No active periods are assigned to your teacher account yet." : "There are no active periods for this selection."}</Text></View> : view === "list" ? <View style={s.panel}>{sorted.map(entry=><View key={entry._id}><Text style={s.dayLabel}>{DAYS.find(d=>d.value===entry.dayOfWeek)?.label || "Day"}</Text><PeriodCard entry={entry} isTeacher={isTeacher}/></View>)}</View> : grouped.map(day=><View key={day.value} style={s.panel}><View style={s.dayHeader}><Text style={s.dayTitle}>{day.label}</Text><Text style={s.count}>{day.entries.length} periods</Text></View>{day.entries.length ? day.entries.map(entry=><PeriodCard key={entry._id} entry={entry} isTeacher={isTeacher}/>) : <Text style={s.muted}>No periods scheduled</Text>}</View>)}
    {!isTeacher && (schedule.periods.length>0 || schedule.breaks.length>0) ? <View style={s.panel}><Text style={s.panelTitle}>Bell schedule</Text>{schedule.periods.map(p=><View key={p.periodNumber} style={s.scheduleRow}><Text style={s.detail}>{p.label || "Period " + p.periodNumber}</Text><Text style={s.detail}>{p.startTime}–{p.endTime}</Text></View>)}{schedule.breaks.map((b,i)=><View key={"break-"+i} style={s.scheduleRow}><Text style={s.breakLabel}>{b.label}</Text><Text style={s.detail}>{b.startTime}–{b.endTime}</Text></View>)}</View> : null}
  </ScrollView>;
}
const s=StyleSheet.create({
 content:{padding:spacing.lg,paddingBottom:32,gap:spacing.md},header:{flexDirection:"row",alignItems:"center",gap:10},kicker:{color:colors.accent,fontSize:11,fontWeight:"900",letterSpacing:1.2},title:{color:colors.ink,fontSize:25,fontWeight:"900",marginTop:3},muted:{color:colors.muted,fontSize:12,lineHeight:18},home:{backgroundColor:colors.primarySoft,padding:11,borderRadius:radius.md},homeText:{color:colors.primary,fontWeight:"800"},
 panel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:15,gap:12},field:{gap:7},label:{color:colors.muted,fontSize:12,fontWeight:"800"},chips:{gap:7},chip:{paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:colors.border,borderRadius:radius.pill},chipActive:{backgroundColor:colors.primary,borderColor:colors.primary},chipText:{fontSize:12,color:colors.muted,fontWeight:"700"},chipTextActive:{color:colors.white},
 summary:{flexDirection:"row",justifyContent:"space-around",backgroundColor:colors.primarySoft,borderRadius:radius.md,padding:14},summaryValue:{fontSize:21,fontWeight:"900",color:colors.primary},toggle:{flexDirection:"row",backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:4},toggleItem:{flex:1,alignItems:"center",padding:10,borderRadius:10},toggleActive:{backgroundColor:colors.primary},toggleText:{color:colors.muted,fontWeight:"800",fontSize:12},toggleTextActive:{color:colors.white},
 dayHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},dayTitle:{fontSize:16,fontWeight:"900",color:colors.ink},count:{fontSize:11,color:colors.muted},dayLabel:{fontSize:12,fontWeight:"900",color:colors.accent,marginTop:6},period:{flexDirection:"row",gap:12,paddingVertical:12,borderTopWidth:1,borderTopColor:colors.border},timeBlock:{width:102,gap:4},time:{fontSize:12,fontWeight:"900",color:colors.primary},periodNo:{fontSize:10,color:colors.muted},periodMain:{flex:1,gap:3},subject:{fontSize:14,fontWeight:"900",color:colors.ink},detail:{fontSize:12,color:colors.muted},room:{fontSize:11,color:colors.muted},loading:{padding:28,alignItems:"center",gap:10},message:{padding:14,backgroundColor:colors.surface,borderRadius:radius.md,gap:8},error:{color:colors.danger,fontSize:12},link:{color:colors.primary,fontWeight:"800"},emptyTitle:{fontSize:15,fontWeight:"900",color:colors.ink},panelTitle:{fontSize:15,fontWeight:"900",color:colors.ink},scheduleRow:{flexDirection:"row",justifyContent:"space-between",paddingVertical:5,borderTopWidth:1,borderTopColor:colors.border},breakLabel:{fontSize:12,color:colors.accent,fontWeight:"800"}
});
