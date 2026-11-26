import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const categories = [["general","General"],["academic","Academic"],["examination","Examination"],["event","Event"],["holiday","Holiday"],["urgent","Urgent"]];
const labelDate = value => value ? new Date(value).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "—";
const id = value => String(value?._id || value || "");

export function TeacherAnnouncementsScreen() {
  const [items,setItems]=useState([]);
  const [assignments,setAssignments]=useState([]);
  const [years,setYears]=useState([]);
  const [selectedAssignment,setSelectedAssignment]=useState("");
  const [filter,setFilter]=useState("all");
  const [form,setForm]=useState(false);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [category,setCategory]=useState("general");
  const [expiry,setExpiry]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const selected=assignments.find(item=>item._id===selectedAssignment)||assignments[0];
  const activeYears=useMemo(()=>years.filter(item=>item.status==="active"),[years]);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [announcements,assignmentResponse,yearResponse]=await Promise.all([
        apiRequest("/announcements"),
        apiRequest("/teacher-assignments?status=active"),
        apiRequest("/academic-years"),
      ]);
      setItems(announcements.data||[]);
      setAssignments(assignmentResponse.data||[]);
      setSelectedAssignment(current=>current||(assignmentResponse.data||[])[0]?._id||"");
      setYears(yearResponse.data||[]);
    }catch(err){setError(err.message||"Unable to load announcements.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const visible=items.filter(item=>filter==="all"||item.status===filter);
  const assignmentLabel=item=>(item.classId?.name||"Class")+(item.sectionId?.name?" · "+item.sectionId.name:" · All sections")+" — "+(item.subjectId?.name||"Subject");
  const create=async()=>{
    if(!selected||!title.trim()||!body.trim()){setError("Choose an assigned class and enter a title and message.");return;}
    const yearId=id(selected.academicYearId);
    if(!activeYears.some(year=>id(year)===yearId)){setError("The assignment must belong to an active academic year.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const audienceType=selected.sectionId?"SECTION":"CLASS";
      await apiRequest("/announcements",{method:"POST",body:{
        title:title.trim(),body:body.trim(),category,audienceType,academicYearId:yearId,
        classId:id(selected.classId),sectionId:selected.sectionId?id(selected.sectionId):null,
        expiresAt:expiry.trim()?new Date(expiry).toISOString():null,
      }});
      setForm(false);setTitle("");setBody("");setCategory("general");setExpiry("");
      setNotice("Announcement saved as a draft.");await load();
    }catch(err){setError(err.message||"Unable to save announcement.");}
    finally{setBusy(false);}
  };
  const transition=async(item,action)=>{
    setBusy(true);setError("");setNotice("");
    try{
      await apiRequest("/announcements/"+item._id+"/"+action,{method:"PATCH"});
      setNotice(action==="publish"?"Announcement published.":"Announcement archived.");await load();
    }catch(err){setError(err.message||"Unable to update announcement.");}
    finally{setBusy(false);}
  };
  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.heading}><Text style={s.kicker}>TEACHER WORKSPACE</Text><Text style={s.title}>Announcements & notices</Text><Text style={s.muted}>Share updates with the classes and sections you teach.</Text></View>
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    {notice?<Text accessibilityRole="status" style={s.success}>{notice}</Text>:null}
    <View style={s.row}>
      <Text style={s.panelTitle}>Your announcements</Text>
      <TouchableOpacity disabled={loading||!assignments.length||!activeYears.length} style={s.primary} onPress={()=>{setForm(true);setError("");setNotice("");}}><Text style={s.primaryText}>+ New</Text></TouchableOpacity>
    </View>
    <View style={s.chips}>{[["all","All"],["draft","Drafts"],["published","Published"],["archived","Archived"]].map(([value,label])=><TouchableOpacity key={value} onPress={()=>setFilter(value)} style={[s.chip,filter===value&&s.chipActive]}><Text style={[s.chipText,filter===value&&s.chipTextActive]}>{label}</Text></TouchableOpacity>)}</View>
    {form?<View style={s.panel}>
      <Text style={s.panelTitle}>Create announcement draft</Text>
      <Text style={s.label}>Assigned class / section</Text>
      <View style={s.assignmentList}>{assignments.map(item=><TouchableOpacity key={item._id} onPress={()=>setSelectedAssignment(item._id)} style={[s.assignment,s.selectedAssignment===item._id&&s.assignmentActive]}><Text style={s.assignmentText}>{assignmentLabel(item)}</Text><Text style={s.radio}>{selected?._id===item._id?"●":"○"}</Text></TouchableOpacity>)}</View>
      <Text style={s.label}>Title</Text><TextInput value={title} onChangeText={setTitle} maxLength={160} style={s.input} placeholder="Announcement title"/>
      <Text style={s.label}>Message</Text><TextInput value={body} onChangeText={setBody} multiline maxLength={10000} style={[s.input,s.multiline]} placeholder="Write the notice for your class or section"/>
      <Text style={s.label}>Category</Text><View style={s.chips}>{categories.map(([value,label])=><TouchableOpacity key={value} onPress={()=>setCategory(value)} style={[s.chip,category===value&&s.chipActive]}><Text style={[s.chipText,category===value&&s.chipTextActive]}>{label}</Text></TouchableOpacity>)}</View>
      <Text style={s.label}>Expiry date (optional, YYYY-MM-DD)</Text><TextInput value={expiry} onChangeText={setExpiry} style={s.input} placeholder="2027-03-31"/>
      <View style={s.row}><TouchableOpacity style={s.secondary} onPress={()=>setForm(false)}><Text style={s.secondaryText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={s.primary} onPress={create}><Text style={s.primaryText}>{busy?"Saving…":"Save draft"}</Text></TouchableOpacity></View>
    </View>:null}
    {loading?<View style={s.loading}><ActivityIndicator color={colors.primary}/><Text style={s.muted}>Loading announcements…</Text></View>:visible.length===0?<Text style={s.empty}>No announcements in this filter.</Text>:visible.map(item=><View key={item._id} style={s.panel}>
      <View style={s.row}><Text style={s.category}>{categories.find(([value])=>value===item.category)?.[1]||item.category}</Text><Text style={s.status}>{item.status}</Text></View>
      <Text style={s.cardTitle}>{item.title}</Text><Text style={s.message}>{item.body}</Text>
      <Text style={s.meta}>{item.audienceType==="SECTION"?(item.classId?.name||"Class")+" · "+(item.sectionId?.name||"Section"):(item.classId?.name||"Class")} · {labelDate(item.publishedAt||item.createdAt)}</Text>
      {item.status==="draft"?<TouchableOpacity disabled={busy} style={s.primary} onPress={()=>transition(item,"publish")}><Text style={s.primaryText}>Publish</Text></TouchableOpacity>:item.status==="published"?<TouchableOpacity disabled={busy} style={s.secondary} onPress={()=>transition(item,"archive")}><Text style={s.secondaryText}>Archive</Text></TouchableOpacity>:null}
    </View>)}
  </ScrollView>;
}
const s=StyleSheet.create({
 page:{padding:spacing.lg,gap:spacing.md},heading:{gap:spacing.xs},kicker:{fontSize:11,fontWeight:"800",letterSpacing:1.2,color:colors.primary},title:{fontSize:25,fontWeight:"800",color:colors.text},muted:{color:colors.muted,fontSize:13},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:spacing.sm},panel:{backgroundColor:colors.surface,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm,borderWidth:1,borderColor:colors.border},panelTitle:{fontSize:17,fontWeight:"800",color:colors.text},label:{fontSize:12,fontWeight:"700",color:colors.text,marginTop:spacing.xs},input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,color:colors.text,backgroundColor:colors.background},multiline:{minHeight:110,textAlignVertical:"top"},chips:{flexDirection:"row",flexWrap:"wrap",gap:spacing.xs},chip:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:spacing.md,paddingVertical:spacing.sm},chipActive:{backgroundColor:colors.primary,borderColor:colors.primary},chipText:{fontSize:12,color:colors.text,fontWeight:"600"},chipTextActive:{color:"#FFFFFF"},primary:{backgroundColor:colors.primary,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,alignSelf:"flex-start"},primaryText:{color:"#FFFFFF",fontWeight:"700"},secondary:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,alignSelf:"flex-start"},secondaryText:{color:colors.text,fontWeight:"700"},assignmentList:{gap:spacing.xs},assignment:{padding:spacing.sm,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},assignmentActive:{borderColor:colors.primary,backgroundColor:colors.background},assignmentText:{flex:1,color:colors.text,fontSize:12},radio:{color:colors.primary,fontWeight:"800"},category:{color:colors.primary,fontSize:11,fontWeight:"800"},status:{color:colors.muted,fontSize:11,fontWeight:"700",textTransform:"uppercase"},cardTitle:{fontSize:17,fontWeight:"800",color:colors.text},message:{fontSize:14,lineHeight:21,color:colors.text},meta:{fontSize:11,color:colors.muted},empty:{color:colors.muted,textAlign:"center",padding:spacing.lg},loading:{flexDirection:"row",gap:spacing.sm,alignItems:"center",padding:spacing.md},error:{color:colors.danger,backgroundColor:colors.surface,padding:spacing.md,borderRadius:radius.md},success:{color:colors.success,backgroundColor:colors.surface,padding:spacing.md,borderRadius:radius.md},
});
