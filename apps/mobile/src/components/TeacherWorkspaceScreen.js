import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const statuses = ["present", "absent", "late", "excused"];
const id = value => String(value?._id || value || "");
const name = value => [value?.firstName, value?.lastName].filter(Boolean).join(" ") || "Student";

function Chips({ items, value, onChange }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{items.map(item => <TouchableOpacity key={item.value} onPress={() => onChange(item.value)} style={[s.chip, value===item.value && s.chipActive]}><Text style={[s.chipText, value===item.value && s.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}</ScrollView>;
}

export function TeacherWorkspaceScreen() {
  const [tab,setTab]=useState("attendance");
  const [assignments,setAssignments]=useState([]);
  const [assignmentId,setAssignmentId]=useState("");
  const [students,setStudents]=useState([]);
  const [marks,setMarks]=useState({});
  const [date,setDate]=useState(today());
  const [homework,setHomework]=useState([]);
  const [exams,setExams]=useState([]);
  const [report,setReport]=useState(null);
  const [homeworkTitle,setHomeworkTitle]=useState("");
  const [homeworkInstructions,setHomeworkInstructions]=useState("");
  const [assignedDate,setAssignedDate]=useState(today());
  const [dueDate,setDueDate]=useState(today());
  const [activeHomework,setActiveHomework]=useState("");
  const [submissions,setSubmissions]=useState(null);
  const [reviewDrafts,setReviewDrafts]=useState({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const selected=assignments.find(x=>x._id===assignmentId)||assignments[0];
  const scopes=useMemo(()=>{const m=new Map();assignments.forEach(a=>m.set([id(a.academicYearId),id(a.classId),id(a.sectionId)||"all"].join(":"),a));return [...m.values()];},[assignments]);
  const loadBase=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const [a,h,e]=await Promise.all([apiRequest("/teacher-assignments?status=active"),apiRequest("/homework"),apiRequest("/examinations")]);
      setAssignments(a.data||[]);setAssignmentId(current=>current||(a.data||[])[0]?._id||"");
      setHomework(h.data||[]);setExams(e.data||[]);
    } catch(err){setError(err.message||"Unable to load teacher workspace.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{loadBase();},[loadBase]);

  const loadStudents=useCallback(async()=>{
    if(!selected)return;
    setLoading(true);setError("");
    try{
      const params=new URLSearchParams({academicYearId:id(selected.academicYearId),classId:id(selected.classId),status:"active"});
      if(selected.sectionId)params.set("sectionId",id(selected.sectionId));
      const r=await apiRequest("/enrollments?"+params.toString());
      setStudents(r.data||[]);
    }catch(err){setError(err.message||"Unable to load assigned students.");setStudents([]);}
    finally{setLoading(false);}
  },[selected]);
  const loadAttendance=useCallback(async()=>{
    if(!selected)return;
    setLoading(true);setError("");setNotice("");
    try{
      const params=new URLSearchParams({date,academicYearId:id(selected.academicYearId),classId:id(selected.classId)});
      if(selected.sectionId)params.set("sectionId",id(selected.sectionId));
      const r=await apiRequest("/attendance?"+params.toString());
      const rows=r.data||[];
      setStudents(rows.map(x=>({studentId:x.student,sectionId:x.section})));
      setMarks(Object.fromEntries(rows.map(x=>[id(x.student),{status:x.attendance?.status||"",remarks:x.attendance?.remarks||""}])));
    }catch(err){setError(err.message||"Unable to load attendance register.");}
    finally{setLoading(false);}
  },[selected,date]);
  useEffect(()=>{if(tab==="students")loadStudents();if(tab==="attendance")loadAttendance();},[tab,loadStudents,loadAttendance]);

  const saveAttendance=async()=>{
    if(!selected||!students.length)return;
    const unmarked=students.filter(x=>!marks[id(x.studentId)]?.status).length;
    if(unmarked){setError(unmarked+" student(s) are still unmarked.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const body={date,academicYearId:id(selected.academicYearId),classId:id(selected.classId),...(selected.sectionId?{sectionId:id(selected.sectionId)}:{}),records:students.map(x=>({studentId:id(x.studentId),status:marks[id(x.studentId)].status,remarks:marks[id(x.studentId)].remarks||""}))};
      const r=await apiRequest("/attendance",{method:"PUT",body});
      setNotice("Attendance saved for "+(r.savedCount??students.length)+" students.");
    }catch(err){setError(err.message||"Unable to save attendance.");}
    finally{setBusy(false);}
  };
  const createHomework=async()=>{
    if(!selected||!homeworkTitle.trim()||!homeworkInstructions.trim()){setError("Choose an assignment and enter a title and instructions.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const body={academicYearId:id(selected.academicYearId),classId:id(selected.classId),sectionId:selected.sectionId?id(selected.sectionId):null,subjectId:id(selected.subjectId),title:homeworkTitle.trim(),instructions:homeworkInstructions.trim(),assignedDate,dueDate,status:"published"};
      const r=await apiRequest("/homework",{method:"POST",body});
      setHomework(items=>[r.data,...items]);setHomeworkTitle("");setHomeworkInstructions("");setNotice("Homework published to the assigned class.");
    }catch(err){setError(err.message||"Unable to create homework.");}
    finally{setBusy(false);}
  };
  const loadSubmissions=async homeworkId=>{
    setActiveHomework(homeworkId);setBusy(true);setError("");
    try{const r=await apiRequest("/homework/"+homeworkId+"/submissions");setSubmissions(r);}
    catch(err){setError(err.message||"Unable to load submissions.");setSubmissions(null);}
    finally{setBusy(false);}
  };
  const reviewSubmission=async(homeworkId,submissionId)=>{
    const draft=reviewDrafts[submissionId]||{};setBusy(true);setError("");setNotice("");
    try{
      await apiRequest("/homework/"+homeworkId+"/submissions/"+submissionId+"/review",{method:"PATCH",body:{marksObtained:draft.marks||"",maxMarks:draft.max||"",feedback:draft.feedback||""}});
      setNotice("Submission reviewed.");await loadSubmissions(homeworkId);
    }catch(err){setError(err.message||"Unable to review submission.");}
    finally{setBusy(false);}
  };
  const runReport=async()=>{
    if(!selected)return;
    setBusy(true);setError("");
    try{
      const year=selected.academicYearId;
      const from=year?.startDate?new Date(year.startDate).toISOString().slice(0,10):date;
      const params=new URLSearchParams({academicYearId:id(year),classId:id(selected.classId),from,to:date});
      const r=await apiRequest("/attendance/reports?"+params.toString());
      setReport(r);
    }catch(err){setError(err.message||"Unable to load class report.");}
    finally{setBusy(false);}
  };
  const tabs=[["attendance","Attendance"],["students","My students"],["homework","Homework"],["exams","Exams"],["reports","Reports"]];
  const assignmentLabel=a=>(a.classId?.name||"Class")+(a.sectionId?.name?" · "+a.sectionId.name:" · All sections")+" — "+(a.subjectId?.name||"Subject");
  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.heading}><Text style={s.kicker}>TEACHING & LEARNING</Text><Text style={s.title}>Teacher workspace</Text><Text style={s.muted}>Your assigned classes, student records and teaching tasks.</Text></View>
    <Chips items={tabs.map(([value,label])=>({value,label}))} value={tab} onChange={v=>{setTab(v);setError("");setNotice("");}}/>
    {error?<View style={s.alert}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={()=>tab==="students"?loadStudents():tab==="attendance"?loadAttendance():loadBase()}><Text style={s.action}>Try again</Text></TouchableOpacity></View>:null}
    {notice?<View style={s.notice}><Text style={s.success}>{notice}</Text></View>:null}
    {tab!=="exams"&&scopes.length>0?<View style={s.panel}><Text style={s.label}>Assigned class and subject</Text><Chips items={scopes.map(a=>({value:a._id,label:assignmentLabel(a)}))} value={selected?._id||""} onChange={setAssignmentId}/></View>:null}
    {loading?<View style={s.loading}><ActivityIndicator color={colors.primary}/><Text style={s.muted}>Loading…</Text></View>:null}
    {tab==="attendance"&&!loading?<View style={s.panel}>
      <Text style={s.panelTitle}>Daily attendance</Text>
      <Text style={s.label}>Date (YYYY-MM-DD)</Text><TextInput value={date} onChangeText={setDate} style={s.input} placeholder="YYYY-MM-DD"/>
      <TouchableOpacity style={s.secondary} onPress={loadAttendance}><Text style={s.secondaryText}>Load register</Text></TouchableOpacity>
      <Text style={s.muted}>{students.length} assigned students · {students.filter(x=>marks[id(x.studentId)]?.status).length} marked</Text>
      {students.map(row=>{const student=row.studentId;const key=id(student);return <View key={key} style={s.studentRow}><View style={{flex:1}}><Text style={s.name}>{name(student)}</Text><Text style={s.muted}>{student?.admissionNumber||"—"}{row.sectionId?.name?" · "+row.sectionId.name:""}</Text></View><View style={s.statusWrap}>{statuses.map(status=><TouchableOpacity key={status} onPress={()=>setMarks(m=>({...m,[key]:{...m[key],status}}))} style={[s.status,marks[key]?.status===status&&s.statusActive]}><Text style={[s.statusText,marks[key]?.status===status&&s.statusTextActive]}>{status}</Text></TouchableOpacity>)}</View></View>})}
      {students.length>0?<><TouchableOpacity style={s.secondary} onPress={()=>setMarks(Object.fromEntries(students.map(x=>[id(x.studentId),{...marks[id(x.studentId)],status:"present"}])))}><Text style={s.secondaryText}>Mark all present</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={s.primary} onPress={saveAttendance}><Text style={s.primaryText}>{busy?"Saving…":"Save attendance"}</Text></TouchableOpacity></>:<Text style={s.muted}>No students found for this assignment.</Text>}
    </View>:null}
    {tab==="students"&&!loading?<View style={s.panel}><Text style={s.panelTitle}>My assigned students</Text>{students.map(row=>{const student=row.studentId;return <View key={row._id} style={s.studentRow}><View style={{flex:1}}><Text style={s.name}>{name(student)}</Text><Text style={s.muted}>{student?.admissionNumber||"—"} · {row.sectionId?.name||"No section"}</Text></View><Text style={s.badge}>{row.status||"active"}</Text></View>})}{!students.length?<Text style={s.muted}>No students found in this assigned class.</Text>:null}</View>:null}
    {tab==="homework"?<><View style={s.panel}><Text style={s.panelTitle}>Create homework</Text><Text style={s.muted}>Publish work for the selected assigned class and subject.</Text><TextInput value={homeworkTitle} onChangeText={setHomeworkTitle} style={s.input} placeholder="Homework title"/><TextInput value={homeworkInstructions} onChangeText={setHomeworkInstructions} style={[s.input,{minHeight:90,textAlignVertical:"top"}]} multiline placeholder="Instructions for students"/><Text style={s.label}>Assigned date (YYYY-MM-DD)</Text><TextInput value={assignedDate} onChangeText={setAssignedDate} style={s.input}/><Text style={s.label}>Due date (YYYY-MM-DD)</Text><TextInput value={dueDate} onChangeText={setDueDate} style={s.input}/><TouchableOpacity disabled={busy||!selected} style={s.primary} onPress={createHomework}><Text style={s.primaryText}>{busy?"Saving…":"Publish homework"}</Text></TouchableOpacity></View><View style={s.panel}><Text style={s.panelTitle}>Homework & submissions</Text>{homework.map(item=><View key={item._id} style={s.studentRow}><View style={{flex:1}}><Text style={s.name}>{item.title}</Text><Text style={s.muted}>{item.classId?.name||"Class"} · {item.subjectId?.name||"Subject"} · Due {item.dueDate?new Date(item.dueDate).toLocaleDateString():"—"}</Text></View><TouchableOpacity onPress={()=>loadSubmissions(item._id)} style={s.secondary}><Text style={s.secondaryText}>Review</Text></TouchableOpacity></View>)}{!homework.length?<Text style={s.muted}>No homework assignments yet.</Text>:null}{submissions&&activeHomework?<><Text style={s.name}>Submission summary: {submissions.summary?.submitted||0} submitted · {submissions.summary?.pending||0} pending · {submissions.summary?.reviewed||0} reviewed</Text>{(submissions.data||[]).map(item=><View key={item._id} style={s.studentRow}><Text style={s.name}>{name(item.studentId)} · {item.status}</Text><Text style={s.muted}>{item.answer||"No written answer"}</Text>{item.status==="submitted"?<><TextInput style={s.input} placeholder="Marks obtained (optional)" keyboardType="decimal-pad" value={reviewDrafts[item._id]?.marks||""} onChangeText={v=>setReviewDrafts(d=>({...d,[item._id]:{...d[item._id],marks:v}}))}/><TextInput style={s.input} placeholder="Maximum marks (optional)" keyboardType="decimal-pad" value={reviewDrafts[item._id]?.max||""} onChangeText={v=>setReviewDrafts(d=>({...d,[item._id]:{...d[item._id],max:v}}))}/><TextInput style={s.input} placeholder="Feedback" value={reviewDrafts[item._id]?.feedback||""} onChangeText={v=>setReviewDrafts(d=>({...d,[item._id]:{...d[item._id],feedback:v}}))}/><TouchableOpacity disabled={busy} style={s.secondary} onPress={()=>reviewSubmission(activeHomework,item._id)}><Text style={s.secondaryText}>Submit review</Text></TouchableOpacity></>:<Text style={s.muted}>Reviewed · {item.marksObtained==null?"No marks":item.marksObtained+" / "+item.maxMarks}</Text>}</View>)}</>:null}</View></>:null}
    {tab==="exams"?<View style={s.panel}><Text style={s.panelTitle}>Examinations</Text><Text style={s.muted}>Examination marks entry is restricted to your assigned subjects and students.</Text>{exams.map(item=><View key={item._id} style={s.studentRow}><View style={{flex:1}}><Text style={s.name}>{item.name}</Text><Text style={s.muted}>{item.status} · {item.startDate?new Date(item.startDate).toLocaleDateString():"Schedule not set"}</Text></View><Text style={s.badge}>{item.status}</Text></View>)}{!exams.length?<Text style={s.muted}>No examinations available.</Text>:null}</View>:null}
    {tab==="reports"?<View style={s.panel}><Text style={s.panelTitle}>My class reports</Text><Text style={s.muted}>Attendance summaries for your assigned class.</Text><TouchableOpacity style={s.primary} disabled={busy||!selected} onPress={runReport}><Text style={s.primaryText}>{busy?"Loading…":"Generate attendance report"}</Text></TouchableOpacity>{report?<><Text style={s.name}>Attendance report</Text><Text style={s.muted}>Marked records: {report.summary?.marked??0} · Students: {report.summary?.students??0} · Attendance: {report.summary?.percentage==null?"—":report.summary.percentage+"%"}</Text>{(report.summary?.byStatus||[]).map(x=><Text key={x.status} style={s.muted}>{x.status}: {x.count}</Text>)}</>:null}</View>:null}
    {scopes.length===0&&!loading?<View style={s.panel}><Text style={s.panelTitle}>No active teaching assignments</Text><Text style={s.muted}>Your school administrator needs to assign your classes and subjects.</Text></View>:null}
  </ScrollView>;
}
const s=StyleSheet.create({page:{padding:spacing.lg,paddingBottom:36,gap:spacing.md},heading:{gap:5},kicker:{color:colors.accent,fontSize:11,fontWeight:"900",letterSpacing:1.2},title:{color:colors.ink,fontSize:24,fontWeight:"900"},muted:{color:colors.muted,fontSize:12},chips:{gap:7,paddingVertical:4},chip:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:12,paddingVertical:9},chipActive:{backgroundColor:colors.primary,borderColor:colors.primary},chipText:{fontSize:12,color:colors.muted,fontWeight:"700"},chipTextActive:{color:colors.white},panel:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:15,gap:12},panelTitle:{color:colors.ink,fontSize:17,fontWeight:"900"},label:{color:colors.muted,fontSize:12,fontWeight:"800"},input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:11,color:colors.ink},secondary:{backgroundColor:colors.primarySoft,borderRadius:radius.md,padding:12,alignItems:"center"},secondaryText:{color:colors.primary,fontWeight:"800"},primary:{backgroundColor:colors.primary,borderRadius:radius.md,padding:14,alignItems:"center"},primaryText:{color:colors.white,fontWeight:"900"},studentRow:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:12,gap:8},name:{color:colors.ink,fontSize:13,fontWeight:"800"},statusWrap:{flexDirection:"row",gap:5,flexWrap:"wrap"},status:{borderWidth:1,borderColor:colors.border,borderRadius:8,paddingHorizontal:8,paddingVertical:7},statusActive:{backgroundColor:colors.primarySoft,borderColor:colors.primary},statusText:{fontSize:10,color:colors.muted,fontWeight:"700"},statusTextActive:{color:colors.primary},badge:{color:colors.primary,fontSize:11,fontWeight:"800"},loading:{padding:24,alignItems:"center",gap:8},alert:{padding:13,backgroundColor:"#FDECEC",borderRadius:radius.md,gap:6},error:{color:colors.danger},action:{color:colors.primary,fontWeight:"800"},notice:{padding:12,backgroundColor:"#E6F5ED",borderRadius:radius.md},success:{color:colors.success,fontWeight:"800"}});
