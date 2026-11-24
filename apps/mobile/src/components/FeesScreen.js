import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../services/apiClient";
import { colors, radius, spacing } from "../theme/tokens";

const idOf = (value) => String(value?._id || value?.id || value || "");
const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "—";
const studentName = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Student";
const frequencies = ["one_time", "monthly", "quarterly", "half_yearly", "annually"];
const methods = ["cash", "upi", "bank_transfer", "cheque", "card", "other"];

export function FeesScreen({ onHome }) {
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [sections, setSections] = useState([]);
  const [structures, setStructures] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [outstanding, setOutstanding] = useState({ data: [], summary: {} });
  const [tab, setTab] = useState("structures");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [picker, setPicker] = useState("");
  const [structureModal, setStructureModal] = useState(false);
  const [structureForm, setStructureForm] = useState({ classId: "", name: "", headName: "Tuition Fee", amount: "", frequency: "monthly", items: [] });
  const [bulkModal, setBulkModal] = useState(false);
  const [individualModal, setIndividualModal] = useState(false);
  const [individualForm, setIndividualForm] = useState({ enrollmentId: "", feeStructureId: "", invoiceNumber: "", dueDate: "" });
  const [bulkForm, setBulkForm] = useState({ classId: "", sectionId: "", feeStructureId: "", dueDate: "", invoiceNumberPrefix: "FEE" });
  const [bulkSections, setBulkSections] = useState([]);
  const [bulkResult, setBulkResult] = useState(null);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", paymentDate: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [yr, cls, enr] = await Promise.all([apiRequest("/academic-years"), apiRequest("/classes"), apiRequest("/enrollments?status=active")]);
      const yearList = Array.isArray(yr?.data) ? yr.data : [];
      setYears(yearList); setClasses(Array.isArray(cls?.data) ? cls.data : []); setEnrollments(Array.isArray(enr?.data) ? enr.data : []);
      const active = yearList.find((item) => item.status === "active") || yearList[0];
      const effectiveYear = yearId || active?._id || "";
      if (!yearId && effectiveYear) setYearId(effectiveYear);
      if (effectiveYear) {
        const [st, inv, out] = await Promise.all([
          apiRequest("/fees/structures?academicYearId=" + encodeURIComponent(effectiveYear)),
          apiRequest("/fees/invoices?academicYearId=" + encodeURIComponent(effectiveYear)),
          apiRequest("/fees/outstanding?academicYearId=" + encodeURIComponent(effectiveYear)),
        ]);
        setStructures(st?.data || []); setInvoices(inv?.data || []); setOutstanding({ data: out?.data || [], summary: out?.summary || {} });
      } else { setStructures([]); setInvoices([]); setOutstanding({ data: [], summary: {} }); }
    } catch (e) { setError(e.message || "Unable to load fee information."); }
    finally { setLoading(false); }
  }, [yearId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    if (!bulkForm.classId) { setBulkSections([]); return undefined; }
    apiRequest("/sections?classId=" + encodeURIComponent(bulkForm.classId) + "&status=active")
      .then((r) => { if (alive) setBulkSections(r?.data || []); })
      .catch((e) => { if (alive) setError(e.message || "Unable to load sections."); });
    return () => { alive = false; };
  }, [bulkForm.classId]);

  const currentClasses = classes.filter((item) => idOf(item.academicYearId) === yearId && item.status === "active");
  const structureOptions = structures.filter((item) => item.status === "active" && idOf(item.classId) === bulkForm.classId);
  const eligibleEnrollments = enrollments.filter((item) => idOf(item.academicYearId) === yearId && item.status === "active");
  const selectedEnrollment = eligibleEnrollments.find((item) => idOf(item._id) === individualForm.enrollmentId);
  const individualStructureOptions = selectedEnrollment ? structures.filter((item) => item.status === "active" && idOf(item.classId) === idOf(selectedEnrollment.classId)) : [];
  const addHead = () => {
    if (!structureForm.headName.trim() || structureForm.amount === "" || !Number.isFinite(Number(structureForm.amount)) || Number(structureForm.amount) < 0) {
      setError("Enter a fee head and a valid non-negative amount."); return;
    }
    setStructureForm((s) => ({ ...s, items: [...s.items, { name: s.headName.trim(), amount: Number(s.amount), frequency: s.frequency }], headName: "", amount: "" }));
    setError("");
  };
  const createStructure = async () => {
    const items = [...structureForm.items];
    if (structureForm.headName.trim() && structureForm.amount !== "" && Number.isFinite(Number(structureForm.amount)) && Number(structureForm.amount) >= 0) {
      items.push({ name: structureForm.headName.trim(), amount: Number(structureForm.amount), frequency: structureForm.frequency });
    }
    if (!yearId || !structureForm.classId || !structureForm.name.trim() || !items.length) { setError("Select a class, name the structure and add at least one fee head."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/fees/structures", { method: "POST", body: { academicYearId: yearId, classId: structureForm.classId, name: structureForm.name.trim(), items } });
      setNotice("Fee structure created."); setStructureModal(false);
      setStructureForm({ classId: "", name: "", headName: "Tuition Fee", amount: "", frequency: "monthly", items: [] });
      await load();
    } catch (e) { setError(e.message || "Unable to create fee structure."); }
    finally { setSaving(false); }
  };

  const createIndividualInvoice = async () => {
    if (!individualForm.enrollmentId || !individualForm.feeStructureId || !individualForm.invoiceNumber.trim() || !individualForm.dueDate) { setError("Select a student, fee structure, invoice number and due date."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await apiRequest("/fees/invoices", { method: "POST", body: { ...individualForm, invoiceNumber: individualForm.invoiceNumber.trim() } });
      setNotice("Student-specific invoice " + r.data.invoiceNumber + " created for " + studentName(selectedEnrollment?.studentId) + ".");
      setIndividualModal(false); setIndividualForm({ enrollmentId: "", feeStructureId: "", invoiceNumber: "", dueDate: "" });
      await load();
    } catch (e) { setError(e.message || "Unable to create student invoice."); }
    finally { setSaving(false); }
  };

  const createBulkInvoices = async () => {
    if (!bulkForm.classId || !bulkForm.feeStructureId || !bulkForm.dueDate || !bulkForm.invoiceNumberPrefix.trim()) { setError("Complete class, fee structure, due date and invoice prefix."); return; }
    setSaving(true); setError(""); setNotice(""); setBulkResult(null);
    try {
      const r = await apiRequest("/fees/invoices/bulk", { method: "POST", body: { academicYearId: yearId, ...bulkForm, sectionId: bulkForm.sectionId || null } });
      setBulkResult(r.data); setNotice("Invoice generation complete: " + r.data.created + " created, " + r.data.skipped + " skipped.");
      setBulkModal(false); await load();
    } catch (e) { setError(e.message || "Unable to generate invoices."); }
    finally { setSaving(false); }
  };

  const openPayment = async (invoice) => {
    setPaymentInvoice(invoice); setPaymentForm({ amount: "", method: "cash", paymentDate: new Date().toISOString().slice(0, 10), reference: "", notes: "" }); setReversing(null); setReversalReason(""); setError("");
    try { const r = await apiRequest("/fees/invoices/" + invoice._id + "/payments"); setPayments(r.data || []); }
    catch (e) { setError(e.message || "Unable to load payment history."); }
  };
  const recordPayment = async () => {
    if (!paymentInvoice || !Number.isFinite(Number(paymentForm.amount)) || Number(paymentForm.amount) <= 0) { setError("Enter a valid payment amount."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await apiRequest("/fees/invoices/" + paymentInvoice._id + "/payments", { method: "POST", body: { ...paymentForm, amount: Number(paymentForm.amount) } });
      setNotice("Payment recorded. Receipt: " + r.data.receiptNumber);
      const history = await apiRequest("/fees/invoices/" + paymentInvoice._id + "/payments");
      setPayments(history.data || []); setPaymentInvoice((v) => v ? { ...v, paidAmount: Number(v.paidAmount || 0) + Number(r.data.amount || 0), status: Number(v.paidAmount || 0) + Number(r.data.amount || 0) >= Number(v.totalAmount || 0) ? "paid" : "partial" } : v);
      setPaymentForm((v) => ({ ...v, amount: "", reference: "", notes: "" })); await load();
    } catch (e) { setError(e.message || "Unable to record payment."); }
    finally { setSaving(false); }
  };
  const reversePayment = async () => {
    if (!paymentInvoice || !reversing || reversalReason.trim().length < 5) { setError("Enter a reversal reason of at least 5 characters."); return; }
    setSaving(true); setError("");
    try {
      await apiRequest("/fees/invoices/" + paymentInvoice._id + "/payments/" + reversing._id + "/reverse", { method: "PATCH", body: { reason: reversalReason.trim() } });
      setNotice("Payment " + reversing.receiptNumber + " reversed."); setReversing(null); setReversalReason("");
      const [history] = await Promise.all([apiRequest("/fees/invoices/" + paymentInvoice._id + "/payments"), load()]);
      setPayments(history.data || []);
      const updated = invoices.find((v) => v._id === paymentInvoice._id);
      if (updated) setPaymentInvoice({ ...updated, paidAmount: Math.max(0, Number(updated.paidAmount || 0) - Number(reversing.amount || 0)) });
    } catch (e) { setError(e.message || "Unable to reverse payment."); }
    finally { setSaving(false); }
  };

  const selectedClass = currentClasses.find((v) => v._id === structureForm.classId);
  const pickerOptions = picker === "structureClass" ? currentClasses : picker === "bulkClass" ? currentClasses : picker === "bulkSection" ? [{ _id: "", name: "All sections" }, ...bulkSections] : picker === "bulkStructure" ? structureOptions : picker === "individualStudent" ? eligibleEnrollments : picker === "individualStructure" ? individualStructureOptions : [];
  const pickerTitle = picker === "structureClass" || picker === "bulkClass" ? "Select class" : picker === "bulkSection" ? "Select section" : picker === "individualStudent" ? "Select student" : "Select fee structure";
  const Picker = () => <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker("")}><View style={s.backdrop}><View style={s.modal}><Text style={s.modalTitle}>{pickerTitle}</Text><ScrollView style={{ maxHeight: 340 }}>{pickerOptions.map((item) => <TouchableOpacity key={item._id || "none"} style={s.option} onPress={() => {
    if (picker === "structureClass") setStructureForm((v) => ({ ...v, classId: item._id }));
    if (picker === "bulkClass") setBulkForm((v) => ({ ...v, classId: item._id, sectionId: "", feeStructureId: "" }));
    if (picker === "bulkSection") setBulkForm((v) => ({ ...v, sectionId: item._id }));
    if (picker === "bulkStructure") setBulkForm((v) => ({ ...v, feeStructureId: item._id }));
    if (picker === "individualStudent") {
      const admission = item.studentId?.admissionNumber || "STUDENT";
      setIndividualForm((v) => ({ ...v, enrollmentId: item._id, feeStructureId: "", invoiceNumber: "IND-" + String(admission).replace(/[^A-Za-z0-9-]/g, "").slice(0, 18) + "-" + Date.now().toString().slice(-6) }));
    }
    if (picker === "individualStructure") setIndividualForm((v) => ({ ...v, feeStructureId: item._id }));
    setPicker("");
  }}><Text style={s.optionText}>{picker === "individualStudent" ? studentName(item.studentId) + " · " + (item.studentId?.admissionNumber || "No admission number") + " · " + (item.classId?.name || "Class not set") + (item.sectionId?.name ? " / " + item.sectionId.name : "") : item.name + (item.totalAmount ? " · " + money(item.totalAmount) : "")}</Text></TouchableOpacity>)}</ScrollView>{picker === "individualStudent" && pickerOptions.length === 0 ? <Text style={s.muted}>No active student enrollments found for this academic year. Check Student Placements.</Text> : null}<TouchableOpacity style={s.cancel} onPress={() => setPicker("")}><Text style={s.link}>Cancel</Text></TouchableOpacity></View></View></Modal>;

  return <ScrollView contentContainerStyle={s.content}>
    <View style={s.header}><View style={{ flex: 1 }}><Text style={s.kicker}>SCHOOL FINANCE</Text><Text style={s.heading}>Fees & Payments</Text><Text style={s.muted}>Fee plans, invoices, collections and balances</Text></View><TouchableOpacity onPress={onHome}><Text style={s.link}>Home</Text></TouchableOpacity></View>
    <Text style={s.label}>Academic year</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{years.map((v) => <TouchableOpacity key={v._id} style={[s.chip, yearId === v._id && s.activeChip]} onPress={() => setYearId(v._id)}><Text style={[s.chipText, yearId === v._id && s.activeText]}>{v.name}</Text></TouchableOpacity>)}</ScrollView>
    <View style={s.tabs}>{[["structures","Fee plans"],["invoices","Invoices"],["outstanding","Outstanding"]].map(([key,label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.activeTab]}><Text style={[s.tabText, tab === key && s.activeText]}>{label}</Text></TouchableOpacity>)}</View>
    {notice ? <Text style={s.notice}>{notice}</Text> : null}{error ? <Text style={s.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.primary}/> : null}
    {tab === "structures" ? <>
      <TouchableOpacity style={s.primaryButton} onPress={() => { setError(""); setStructureModal(true); }}><Text style={s.primaryText}>＋ Create fee structure</Text></TouchableOpacity>
      {structures.length === 0 ? <Text style={s.empty}>No fee structures for this academic year yet.</Text> : structures.map((v) => <View key={v._id} style={s.card}><View style={s.row}><Text style={s.cardTitle}>{v.name}</Text><Text style={[s.status, v.status === "active" ? s.good : s.bad]}>{v.status}</Text></View><Text style={s.muted}>{v.classId?.name || "Class"} · {v.academicYearId?.name || "Academic year"}</Text>{(v.items || []).map((item, i) => <View key={i} style={s.line}><Text style={s.body}>{item.name} · {item.frequency.replaceAll("_"," ")}</Text><Text style={s.amount}>{money(item.amount)}</Text></View>)}<View style={s.line}><Text style={s.label}>Total per cycle</Text><Text style={s.total}>{money((v.items || []).reduce((sum,x)=>sum+Number(x.amount||0),0))}</Text></View></View>)}
    </> : null}
    {tab === "invoices" ? <>
      <TouchableOpacity style={s.primaryButton} onPress={() => { setError(""); setIndividualModal(true); }}><Text style={s.primaryText}>＋ Create invoice for one student</Text></TouchableOpacity>
      <TouchableOpacity style={s.secondaryButton} onPress={() => { setError(""); setBulkModal(true); }}><Text style={s.secondaryText}>Generate class invoices</Text></TouchableOpacity>
      {invoices.length === 0 ? <Text style={s.empty}>No invoices issued for this academic year.</Text> : invoices.map((v) => <View key={v._id} style={s.card}><View style={s.row}><Text style={s.cardTitle}>{v.invoiceNumber}</Text><Text style={[s.status, v.status === "paid" ? s.good : s.bad]}>{v.status}</Text></View><Text style={s.body}>{studentName(v.studentId)} · {v.studentId?.admissionNumber || "—"}</Text><Text style={s.muted}>{v.enrollmentId?.classId?.name || "Student invoice"} · Due {dateOf(v.dueDate)}</Text><View style={s.line}><Text style={s.body}>Total {money(v.totalAmount)}</Text><Text style={s.body}>Paid {money(v.paidAmount)}</Text></View><View style={s.line}><Text style={s.label}>Balance</Text><Text style={s.total}>{money(Math.max(0,Number(v.totalAmount||0)-Number(v.paidAmount||0)))}</Text></View><TouchableOpacity style={s.secondaryButton} onPress={() => openPayment(v)}><Text style={s.secondaryText}>Payments & receipts</Text></TouchableOpacity></View>)}
    </> : null}
    {tab === "outstanding" ? <>
      <View style={s.summary}><Text style={s.label}>Outstanding invoices</Text><Text style={s.big}>{outstanding.summary?.invoiceCount || 0}</Text><Text style={s.label}>Total balance</Text><Text style={s.big}>{money(outstanding.summary?.totalOutstanding)}</Text><Text style={s.muted}>Overdue: {outstanding.summary?.overdueCount || 0} invoices · {money(outstanding.summary?.overdueAmount)}</Text></View>
      {outstanding.data.length === 0 ? <Text style={s.empty}>No outstanding fees for this academic year.</Text> : outstanding.data.map((v) => <View key={v._id} style={s.card}><Text style={s.cardTitle}>{studentName(v.studentId)} · {v.invoiceNumber}</Text><Text style={s.muted}>{v.enrollmentId?.classId?.name || "Class"} · Due {dateOf(v.dueDate)}</Text><Text style={s.total}>{money(Number(v.totalAmount||0)-Number(v.paidAmount||0))} due</Text><TouchableOpacity style={s.secondaryButton} onPress={() => openPayment(v)}><Text style={s.secondaryText}>Record / view payment</Text></TouchableOpacity></View>)}
    </> : null}

    <Modal visible={structureModal} transparent animationType="slide" onRequestClose={() => setStructureModal(false)}><View style={s.backdrop}><ScrollView contentContainerStyle={s.modalScroll}><View style={s.modal}><Text style={s.modalTitle}>Create fee structure</Text><Text style={s.label}>Class *</Text><TouchableOpacity style={s.select} onPress={() => setPicker("structureClass")}><Text style={s.optionText}>{selectedClass?.name || "Choose class"}</Text></TouchableOpacity><Text style={s.label}>Structure name *</Text><TextInput style={s.input} value={structureForm.name} onChangeText={(v) => setStructureForm((x) => ({...x,name:v}))} placeholder="e.g. Class 5 annual plan"/><Text style={s.label}>Fee head</Text><TextInput style={s.input} value={structureForm.headName} onChangeText={(v) => setStructureForm((x) => ({...x,headName:v}))} placeholder="Tuition fee"/><Text style={s.label}>Amount (₹)</Text><TextInput style={s.input} keyboardType="decimal-pad" value={structureForm.amount} onChangeText={(v) => setStructureForm((x) => ({...x,amount:v}))} placeholder="Amount"/><Text style={s.label}>Frequency</Text><View style={s.chips}>{frequencies.map((v) => <TouchableOpacity key={v} style={[s.chip,structureForm.frequency===v&&s.activeChip]} onPress={() => setStructureForm((x)=>({...x,frequency:v}))}><Text style={[s.chipText,structureForm.frequency===v&&s.activeText]}>{v.replaceAll("_"," ")}</Text></TouchableOpacity>)}</View><TouchableOpacity style={s.secondaryButton} onPress={addHead}><Text style={s.secondaryText}>Add fee head to plan</Text></TouchableOpacity>{structureForm.items.map((v,i)=><Text key={i} style={s.body}>• {v.name}: {money(v.amount)} ({v.frequency.replaceAll("_"," ")})</Text>)}<TouchableOpacity style={s.primaryButton} disabled={saving} onPress={createStructure}><Text style={s.primaryText}>{saving ? "Saving…" : "Save fee structure"}</Text></TouchableOpacity><TouchableOpacity style={s.cancel} onPress={() => setStructureModal(false)}><Text style={s.link}>Cancel</Text></TouchableOpacity></View></ScrollView></View></Modal>

    <Modal visible={individualModal} transparent animationType="slide" onRequestClose={() => setIndividualModal(false)}><View style={s.backdrop}><ScrollView contentContainerStyle={s.modalScroll}><View style={s.modal}><Text style={s.modalTitle}>Student-specific fee invoice</Text><Text style={s.muted}>Use this for optional charges such as Transport Fee. Only the selected student's enrollment will be invoiced.</Text><Text style={s.label}>Student *</Text><TouchableOpacity style={s.select} onPress={() => setPicker("individualStudent")}><Text style={s.optionText}>{selectedEnrollment ? studentName(selectedEnrollment.studentId) + " · " + (selectedEnrollment.studentId?.admissionNumber || "") + " · " + (selectedEnrollment.classId?.name || "Class") : "Choose student"}</Text></TouchableOpacity><Text style={s.label}>Fee structure *</Text><TouchableOpacity style={s.select} disabled={!selectedEnrollment} onPress={() => setPicker("individualStructure")}><Text style={s.optionText}>{individualStructureOptions.find((v) => v._id === individualForm.feeStructureId)?.name || "Choose fee structure"}</Text></TouchableOpacity><Text style={s.label}>Invoice number *</Text><TextInput style={s.input} value={individualForm.invoiceNumber} onChangeText={(v) => setIndividualForm((x) => ({ ...x, invoiceNumber: v }))} placeholder="Unique invoice number"/><Text style={s.label}>Due date (YYYY-MM-DD) *</Text><TextInput style={s.input} value={individualForm.dueDate} onChangeText={(v) => setIndividualForm((x) => ({ ...x, dueDate: v }))} placeholder="2026-12-31"/><TouchableOpacity style={s.primaryButton} disabled={saving} onPress={createIndividualInvoice}><Text style={s.primaryText}>{saving ? "Creating…" : "Create student invoice"}</Text></TouchableOpacity><TouchableOpacity style={s.cancel} onPress={() => setIndividualModal(false)}><Text style={s.link}>Cancel</Text></TouchableOpacity></View></ScrollView></View></Modal>

    <Modal visible={bulkModal} transparent animationType="slide" onRequestClose={() => setBulkModal(false)}><View style={s.backdrop}><ScrollView contentContainerStyle={s.modalScroll}><View style={s.modal}><Text style={s.modalTitle}>Generate class invoices</Text><Text style={s.label}>Class *</Text><TouchableOpacity style={s.select} onPress={() => setPicker("bulkClass")}><Text style={s.optionText}>{currentClasses.find((v)=>v._id===bulkForm.classId)?.name || "Choose class"}</Text></TouchableOpacity><Text style={s.label}>Section</Text><TouchableOpacity style={s.select} disabled={!bulkForm.classId} onPress={() => setPicker("bulkSection")}><Text style={s.optionText}>{bulkSections.find((v)=>v._id===bulkForm.sectionId)?.name || "All sections"}</Text></TouchableOpacity><Text style={s.label}>Fee structure *</Text><TouchableOpacity style={s.select} disabled={!bulkForm.classId} onPress={() => setPicker("bulkStructure")}><Text style={s.optionText}>{structureOptions.find((v)=>v._id===bulkForm.feeStructureId)?.name || "Choose fee structure"}</Text></TouchableOpacity><Text style={s.label}>Due date (YYYY-MM-DD) *</Text><TextInput style={s.input} value={bulkForm.dueDate} onChangeText={(v)=>setBulkForm((x)=>({...x,dueDate:v}))} placeholder="2026-12-31"/><Text style={s.label}>Invoice number prefix *</Text><TextInput style={s.input} value={bulkForm.invoiceNumberPrefix} onChangeText={(v)=>setBulkForm((x)=>({...x,invoiceNumberPrefix:v}))} placeholder="FEE"/><TouchableOpacity style={s.primaryButton} disabled={saving} onPress={createBulkInvoices}><Text style={s.primaryText}>{saving?"Generating…":"Generate invoices"}</Text></TouchableOpacity><TouchableOpacity style={s.cancel} onPress={()=>setBulkModal(false)}><Text style={s.link}>Cancel</Text></TouchableOpacity></View></ScrollView></View></Modal>

    <Modal visible={!!paymentInvoice} transparent animationType="slide" onRequestClose={()=>setPaymentInvoice(null)}><View style={s.backdrop}><ScrollView contentContainerStyle={s.modalScroll}><View style={s.modal}><Text style={s.modalTitle}>Payments & receipts</Text><Text style={s.body}>{paymentInvoice?.invoiceNumber} · {studentName(paymentInvoice?.studentId)}</Text><Text style={s.total}>Balance: {money(Math.max(0,Number(paymentInvoice?.totalAmount||0)-Number(paymentInvoice?.paidAmount||0)))}</Text><Text style={s.label}>Payment amount (₹)</Text><TextInput style={s.input} keyboardType="decimal-pad" value={paymentForm.amount} onChangeText={(v)=>setPaymentForm((x)=>({...x,amount:v}))} placeholder="Amount received"/><Text style={s.label}>Method</Text><View style={s.chips}>{methods.map((v)=><TouchableOpacity key={v} style={[s.chip,paymentForm.method===v&&s.activeChip]} onPress={()=>setPaymentForm((x)=>({...x,method:v}))}><Text style={[s.chipText,paymentForm.method===v&&s.activeText]}>{v.replaceAll("_"," ")}</Text></TouchableOpacity>)}</View><Text style={s.label}>Payment date (YYYY-MM-DD)</Text><TextInput style={s.input} value={paymentForm.paymentDate} onChangeText={(v)=>setPaymentForm((x)=>({...x,paymentDate:v}))}/><Text style={s.label}>Reference (optional)</Text><TextInput style={s.input} value={paymentForm.reference} onChangeText={(v)=>setPaymentForm((x)=>({...x,reference:v}))} placeholder="Transaction / cheque reference"/><Text style={s.label}>Notes (optional)</Text><TextInput style={s.input} value={paymentForm.notes} onChangeText={(v)=>setPaymentForm((x)=>({...x,notes:v}))} placeholder="Payment notes"/><TouchableOpacity style={s.primaryButton} disabled={saving} onPress={recordPayment}><Text style={s.primaryText}>{saving?"Recording…":"Record payment"}</Text></TouchableOpacity><Text style={s.sectionTitle}>Receipt history</Text>{payments.length===0?<Text style={s.muted}>No payments recorded yet.</Text>:payments.map((v)=><View key={v._id} style={s.history}><Text style={s.cardTitle}>{v.receiptNumber} · {money(v.amount)}</Text><Text style={s.muted}>{dateOf(v.paymentDate)} · {v.method.replaceAll("_"," ")} · {v.status}</Text>{v.reference?<Text style={s.muted}>Ref: {v.reference}</Text>:null}{v.status==="posted"?<TouchableOpacity onPress={()=>setReversing(v)}><Text style={s.dangerLink}>Reverse payment</Text></TouchableOpacity>:<Text style={s.muted}>Reason: {v.reversalReason}</Text>}</View>)}{reversing?<><Text style={s.label}>Reason for reversing {reversing.receiptNumber}</Text><TextInput style={s.input} value={reversalReason} onChangeText={setReversalReason} placeholder="At least 5 characters"/><TouchableOpacity style={s.dangerButton} disabled={saving} onPress={reversePayment}><Text style={s.primaryText}>{saving?"Reversing…":"Confirm reversal"}</Text></TouchableOpacity></>:null}<TouchableOpacity style={s.cancel} onPress={()=>setPaymentInvoice(null)}><Text style={s.link}>Close</Text></TouchableOpacity></View></ScrollView></View></Modal>
    <Picker/>
  </ScrollView>;
}

const s = StyleSheet.create({
 content:{padding:spacing.lg,paddingBottom:40,gap:spacing.md},header:{flexDirection:"row",alignItems:"center",gap:12},kicker:{fontSize:10,fontWeight:"900",letterSpacing:1.2,color:colors.accent},heading:{fontSize:25,fontWeight:"900",color:colors.ink,marginTop:4},muted:{fontSize:12,color:colors.muted,marginTop:4},label:{fontSize:12,fontWeight:"800",color:colors.muted,marginTop:5},link:{color:colors.primary,fontWeight:"800"},chips:{flexDirection:"row",flexWrap:"wrap",gap:7},chip:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingVertical:8,paddingHorizontal:12,backgroundColor:colors.surface},activeChip:{backgroundColor:colors.primary,borderColor:colors.primary},chipText:{fontSize:11,color:colors.ink,fontWeight:"700"},activeText:{color:colors.white},tabs:{flexDirection:"row",gap:6},tab:{flex:1,paddingVertical:11,borderRadius:radius.md,alignItems:"center",backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},activeTab:{backgroundColor:colors.primary,borderColor:colors.primary},tabText:{fontSize:11,fontWeight:"800",color:colors.muted},notice:{color:colors.success,fontSize:13,fontWeight:"700"},error:{color:colors.danger,fontSize:13,fontWeight:"700"},empty:{color:colors.muted,fontSize:13,paddingVertical:20,textAlign:"center"},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:9},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},cardTitle:{fontSize:15,fontWeight:"900",color:colors.ink,flex:1},body:{fontSize:12,color:colors.ink},status:{fontSize:10,fontWeight:"900",textTransform:"uppercase"},good:{color:colors.success},bad:{color:colors.danger},line:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},amount:{fontSize:12,color:colors.ink,fontWeight:"700"},total:{fontSize:17,color:colors.primary,fontWeight:"900"},primaryButton:{backgroundColor:colors.primary,borderRadius:radius.md,padding:14,alignItems:"center"},primaryText:{color:colors.white,fontWeight:"900"},secondaryButton:{backgroundColor:colors.primarySoft,borderRadius:radius.md,padding:12,alignItems:"center"},secondaryText:{color:colors.primary,fontWeight:"800"},summary:{backgroundColor:colors.primarySoft,borderRadius:radius.lg,padding:16,gap:7},big:{fontSize:22,color:colors.primary,fontWeight:"900"},backdrop:{flex:1,backgroundColor:"rgba(15,23,42,0.45)",justifyContent:"center",padding:spacing.md},modalScroll:{flexGrow:1,justifyContent:"center"},modal:{backgroundColor:colors.surface,borderRadius:radius.lg,padding:spacing.lg,gap:10},modalTitle:{fontSize:20,fontWeight:"900",color:colors.ink},select:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:13,backgroundColor:colors.background},optionText:{fontSize:13,color:colors.ink,fontWeight:"700"},input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:12,color:colors.ink,backgroundColor:colors.background,fontSize:14},option:{paddingVertical:13,borderBottomWidth:1,borderBottomColor:colors.border},cancel:{alignItems:"center",padding:10},sectionTitle:{fontSize:15,fontWeight:"900",color:colors.ink,marginTop:8},history:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:10,gap:5},dangerLink:{color:colors.danger,fontWeight:"800",fontSize:12},dangerButton:{backgroundColor:colors.danger,borderRadius:radius.md,padding:13,alignItems:"center"},
});