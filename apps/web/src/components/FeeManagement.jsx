import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./FeeManagement.css";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const studentName = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Student";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const printPaymentReceipt = (payment, invoice) => {
  const popup = window.open("", "_blank", "width=760,height=720");
  if (!popup) {
    window.alert("Please allow pop-ups to print the payment receipt.");
    return;
  }
  const student = invoice?.studentId;
  const receivedBy = payment.receivedBy;
  const rows = [
    ["Receipt number", payment.receiptNumber],
    ["Invoice number", invoice?.invoiceNumber],
    ["Student", studentName(student)],
    ["Admission number", student?.admissionNumber || "—"],
    ["Payment date", new Date(payment.paymentDate).toLocaleDateString("en-IN")],
    ["Payment method", String(payment.method || "").replaceAll("_", " ")],
    ["Reference", payment.reference || "—"],
    ["Amount received", money(payment.amount)],
    ["Received by", [receivedBy?.firstName, receivedBy?.lastName].filter(Boolean).join(" ") || "School office"],
  ];
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(payment.receiptNumber)}</title>
    <style>
      body{font:14px Arial,sans-serif;color:#1f2937;margin:36px auto;max-width:680px;padding:0 24px}
      header{text-align:center;border-bottom:2px solid #1f2937;padding-bottom:18px;margin-bottom:22px}
      h1{font-size:22px;margin:0 0 6px}header p{margin:0;color:#64748b}
      table{width:100%;border-collapse:collapse}td{padding:12px 10px;border-bottom:1px solid #e5e7eb}
      td:first-child{width:38%;color:#64748b}td:last-child{font-weight:600}
      .amount{font-size:18px;color:#166534}.footer{margin-top:42px;display:flex;justify-content:space-between;color:#64748b;font-size:12px}
      @media print{body{margin:12mm auto;padding:0}button{display:none}}
    </style></head><body>
    <header><h1>Fee Payment Receipt</h1><p>School ERP · Official payment acknowledgement</p></header>
    <table>${rows.map(([label,value]) => `<tr><td>${escapeHtml(label)}</td><td class="${label === "Amount received" ? "amount" : ""}">${escapeHtml(value)}</td></tr>`).join("")}</table>
    <div class="footer"><span>Generated electronically</span><span>Keep this receipt for your records</span></div>
    <script>window.addEventListener("load",()=>window.print());</script>
    </body></html>`);
  popup.document.close();
};

export default function FeeManagement() {
  const { accessToken } = useAuth();
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [structures, setStructures] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [outstanding, setOutstanding] = useState({ data: [], summary: { invoiceCount: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 } });
  const [outstandingClassId, setOutstandingClassId] = useState("");
  const [outstandingSectionId, setOutstandingSectionId] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [outstandingSections, setOutstandingSections] = useState([]);
  const [yearId, setYearId] = useState("");
  const [tab, setTab] = useState("structures");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [structureForm, setStructureForm] = useState({ classId: "", name: "", items: [{ name: "Tuition Fee", amount: "", frequency: "monthly" }] });
  const [invoiceForm, setInvoiceForm] = useState({ enrollmentId: "", feeStructureId: "", invoiceNumber: "", dueDate: "" });
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", paymentDate: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
  const [payments, setPayments] = useState([]);
  const [reversalReason, setReversalReason] = useState("");
  const [bulkSections, setBulkSections] = useState([]);
  const [bulkForm, setBulkForm] = useState({ classId: "", sectionId: "", feeStructureId: "", dueDate: "", invoiceNumberPrefix: "" });
  const [bulkResult, setBulkResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const [yr, cls, stu, enr] = await Promise.all([
        apiRequest("/academic-years", { accessToken }),
        apiRequest("/classes", { accessToken }),
        apiRequest("/students?limit=500", { accessToken }),
        apiRequest("/enrollments?status=active", { accessToken }),
      ]);
      setYears(yr.data || []); setClasses(cls.data || []); setStudents(stu.data || []); setEnrollments(enr.data || []);
      const active = (yr.data || []).find((item) => item.status === "active");
      setYearId((current) => current || active?._id || (yr.data || [])[0]?._id || "");
    } catch (err) { setError(err.message || "Unable to load fee management data."); }
  }, [accessToken]);

  const loadStructures = useCallback(async () => {
    if (!yearId) { setStructures([]); return; }
    try { const response = await apiRequest(`/fees/structures?academicYearId=${encodeURIComponent(yearId)}`, { accessToken }); setStructures(response.data || []); }
    catch (err) { setError(err.message || "Unable to load fee structures."); }
  }, [accessToken, yearId]);

  const loadInvoices = useCallback(async () => {
    if (!yearId) { setInvoices([]); return; }
    try { const response = await apiRequest(`/fees/invoices?academicYearId=${encodeURIComponent(yearId)}`, { accessToken }); setInvoices(response.data || []); }
    catch (err) { setError(err.message || "Unable to load fee invoices."); }
  }, [accessToken, yearId]);


  const loadOutstanding = useCallback(async () => {
    if (!yearId) { setOutstanding({ data: [], summary: { invoiceCount: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 } }); return; }
    try {
      const params = new URLSearchParams({ academicYearId: yearId });
      if (outstandingClassId) params.set("classId", outstandingClassId);
      if (outstandingSectionId) params.set("sectionId", outstandingSectionId);
      if (overdueOnly) params.set("overdueOnly", "true");
      const response = await apiRequest(`/fees/outstanding?${params.toString()}`, { accessToken });
      setOutstanding({ data: response.data || [], summary: response.summary || { invoiceCount: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 } });
    } catch (err) { setError(err.message || "Unable to load outstanding fees."); }
  }, [accessToken, yearId, outstandingClassId, outstandingSectionId, overdueOnly]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadStructures(); void loadInvoices(); }, [loadStructures, loadInvoices]);
  useEffect(() => { void loadOutstanding(); }, [loadOutstanding]);
  useEffect(() => {
    if (!bulkForm.classId) { setBulkSections([]); return; }
    let cancelled = false;
    apiRequest(`/sections?classId=${encodeURIComponent(bulkForm.classId)}&status=active`, { accessToken })
      .then((response) => { if (!cancelled) setBulkSections(response.data || []); })
      .catch((err) => { if (!cancelled) setError(err.message || "Unable to load class sections."); });
    return () => { cancelled = true; };
  }, [accessToken, bulkForm.classId]);


  useEffect(() => {
    if (!outstandingClassId) { setOutstandingSections([]); setOutstandingSectionId(""); return; }
    let cancelled = false;
    apiRequest(`/sections?classId=${encodeURIComponent(outstandingClassId)}&status=active`, { accessToken })
      .then((response) => { if (!cancelled) setOutstandingSections(response.data || []); })
      .catch((err) => { if (!cancelled) setError(err.message || "Unable to load sections."); });
    return () => { cancelled = true; };
  }, [accessToken, outstandingClassId]);

  const currentClasses = classes.filter((item) => item.academicYearId === yearId || item.academicYearId?._id === yearId);
  const selectedClass = currentClasses.find((item) => item._id === structureForm.classId);
  const eligibleEnrollments = enrollments.filter((item) => {
    const eYear = item.academicYearId?._id || item.academicYearId;
    return eYear === yearId;
  });
  const updateItem = (index, key, value) => setStructureForm((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));

  const createStructure = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/fees/structures", { method: "POST", accessToken, body: {
        academicYearId: yearId, classId: structureForm.classId, name: structureForm.name,
        items: structureForm.items.map((item) => ({ ...item, amount: Number(item.amount) })),
      }});
      if (!response.success) throw new Error("Unable to create fee structure.");
      setNotice("Fee structure created."); setStructureForm({ classId: "", name: "", items: [{ name: "Tuition Fee", amount: "", frequency: "monthly" }] }); await loadStructures();
    } catch (err) { setError(err.message || "Unable to create fee structure."); }
    finally { setBusy(false); }
  };

  const createInvoice = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest("/fees/invoices", { method: "POST", accessToken, body: invoiceForm });
      if (!response.success) throw new Error("Unable to create invoice.");
      setNotice(`Invoice ${response.data.invoiceNumber} created.`); setInvoiceForm({ enrollmentId: "", feeStructureId: "", invoiceNumber: "", dueDate: "" }); await loadInvoices();
    } catch (err) { setError(err.message || "Unable to create invoice."); }
    finally { setBusy(false); }
  };

  const createBulkInvoices = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setBulkResult(null);
    try {
      const response = await apiRequest("/fees/invoices/bulk", { method: "POST", accessToken, body: {
        academicYearId: yearId, ...bulkForm, sectionId: bulkForm.sectionId || null,
      }});
      if (!response.success) throw new Error("Unable to generate class invoices.");
      setBulkResult(response.data);
      setNotice(`Bulk generation complete: ${response.data.created} created, ${response.data.skipped} skipped.`);
      await loadInvoices();
    } catch (err) { setError(err.message || "Unable to generate class invoices."); }
    finally { setBusy(false); }
  };

  const openPayments = async (invoice) => {
    setPaymentInvoice(invoice); setPaymentForm({ amount: "", method: "cash", paymentDate: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
    try { const response = await apiRequest(`/fees/invoices/${invoice._id}/payments`, { accessToken }); setPayments(response.data || []); }
    catch (err) { setError(err.message || "Unable to load receipts."); }
  };

  const recordPayment = async (event) => {
    event.preventDefault(); if (!paymentInvoice) return; setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/fees/invoices/${paymentInvoice._id}/payments`, { method: "POST", accessToken, body: { ...paymentForm, amount: Number(paymentForm.amount) } });
      if (!response.success) throw new Error("Unable to record payment.");
      setNotice(`Payment recorded. Receipt: ${response.data.receiptNumber}`); setPaymentInvoice(null); await loadInvoices();
    } catch (err) { setError(err.message || "Unable to record payment."); }
    finally { setBusy(false); }
  };


  const reversePayment = async (payment) => {
    if (!paymentInvoice || payment.status !== "posted") return;
    const reason = reversalReason.trim();
    if (reason.length < 5 || reason.length > 300) { setError("Enter a reversal reason between 5 and 300 characters."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/fees/invoices/${paymentInvoice._id}/payments/${payment._id}/reverse`, {
        method: "PATCH", accessToken, body: { reason },
      });
      if (!response.success) throw new Error("Unable to reverse payment.");
      setNotice(`Receipt ${payment.receiptNumber} reversed. Invoice balance has been updated.`);
      setReversalReason("");
      const history = await apiRequest(`/fees/invoices/${paymentInvoice._id}/payments`, { accessToken });
      setPayments(history.data || []);
      await loadInvoices();
      setPaymentInvoice((current) => current ? { ...current, paidAmount: Math.max(0, Number(current.paidAmount || 0) - Number(payment.amount || 0)) } : current);
    } catch (err) { setError(err.message || "Unable to reverse payment."); }
    finally { setBusy(false); }
  };
  return <section className="fees-page" aria-labelledby="fees-title">
    <div className="fees-intro"><div><p className="fees-eyebrow">SCHOOL FINANCE</p><h2 id="fees-title">Fees &amp; Payments</h2><p>Set class-wise fee structures, issue student invoices and record payments with receipt references.</p></div></div>
    <div className="fees-toolbar"><label>Academic year<select value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.status === "active" ? " · Active" : ""}</option>)}</select></label><div className="fees-tabs"><button type="button" className={tab === "structures" ? "active" : ""} onClick={() => setTab("structures")}>Fee structures</button><button type="button" className={tab === "invoices" ? "active" : ""} onClick={() => setTab("invoices")}>Invoices &amp; payments</button><button type="button" className={tab === "outstanding" ? "active" : ""} onClick={() => setTab("outstanding")}>Outstanding fees</button></div></div>
    {notice && <p className="fees-notice" role="status">{notice}</p>}{error && <p className="fees-error" role="alert">{error}</p>}
    {tab === "structures" ? <>
      <form className="fees-form" onSubmit={createStructure}>
        <h3>Create fee structure</h3><div className="fees-form-grid">
          <label>Class<select required value={structureForm.classId} onChange={(e) => setStructureForm((s) => ({ ...s, classId: e.target.value }))}><option value="">Select class</option>{currentClasses.filter((c) => c.status === "active").map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
          <label>Structure name<input required maxLength="120" value={structureForm.name} onChange={(e) => setStructureForm((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Class 5 General Fee" /></label>
        </div>
        <div className="fees-heads"><strong>Fee heads</strong>{structureForm.items.map((item, index) => <div className="fees-head-row" key={index}><input aria-label={`Fee head ${index + 1}`} required placeholder="Fee head" value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} /><input aria-label="Amount in rupees" required type="number" min="0" step="0.01" placeholder="Amount (₹)" value={item.amount} onChange={(e) => updateItem(index, "amount", e.target.value)} /><select aria-label="Frequency" value={item.frequency} onChange={(e) => updateItem(index, "frequency", e.target.value)}><option value="one_time">One time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half_yearly">Half yearly</option><option value="annually">Annually</option></select>{structureForm.items.length > 1 && <button type="button" className="fees-remove" onClick={() => setStructureForm((s) => ({ ...s, items: s.items.filter((_, i) => i !== index) }))}>Remove</button>}</div>)}</div>
        <div className="fees-form-actions"><button type="button" className="fees-secondary" onClick={() => setStructureForm((s) => ({ ...s, items: [...s.items, { name: "", amount: "", frequency: "annually" }] }))}>+ Add fee head</button><button className="fees-primary" disabled={busy || !yearId}>{busy ? "Saving…" : "Save fee structure"}</button></div>
      </form>
      <div className="fees-list-heading"><h3>Configured fee structures</h3><span>{structures.length} structures</span></div>
      {structures.length ? <div className="fees-structure-grid">{structures.map((structure) => <article className="fees-card" key={structure._id}><div className="fees-card-top"><strong>{structure.name}</strong><span>{structure.classId?.name || "Class"}</span></div>{structure.items.map((item, i) => <div className="fees-line" key={i}><span>{item.name} <small>{item.frequency.replace("_", " ")}</small></span><strong>{money(item.amount)}</strong></div>)}<div className="fees-total"><span>Total</span><strong>{money(structure.items.reduce((sum, item) => sum + item.amount, 0))}</strong></div></article>)}</div> : <p className="fees-empty">No fee structures configured for this academic year.</p>}
    </> : tab === "invoices" ? <>
      <form className="fees-form" onSubmit={createInvoice}><h3>Issue student invoice</h3><div className="fees-form-grid">
        <label>Active student enrollment<select required value={invoiceForm.enrollmentId} onChange={(e) => setInvoiceForm((s) => ({ ...s, enrollmentId: e.target.value, feeStructureId: "" }))}><option value="">Select student</option>{eligibleEnrollments.map((enrollment) => { const student = enrollment.studentId; const className = enrollment.classId?.name || ""; return <option key={enrollment._id} value={enrollment._id}>{studentName(student)} · {student?.admissionNumber || ""} · {className}</option>; })}</select></label>
        <label>Fee structure<select required value={invoiceForm.feeStructureId} onChange={(e) => setInvoiceForm((s) => ({ ...s, feeStructureId: e.target.value }))}><option value="">Select structure</option>{structures.filter((s) => { const classId = s.classId?._id || s.classId; const enrollment = eligibleEnrollments.find((e) => e._id === invoiceForm.enrollmentId); return enrollment && classId === (enrollment.classId?._id || enrollment.classId) && s.status === "active"; }).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
        <label>Invoice number<input required maxLength="40" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm((s) => ({ ...s, invoiceNumber: e.target.value }))} placeholder="e.g. INV-2026-001" /></label>
        <label>Due date<input required type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((s) => ({ ...s, dueDate: e.target.value }))} /></label>
      </div><div className="fees-form-actions"><button className="fees-primary" disabled={busy || !yearId}>{busy ? "Creating…" : "Create invoice"}</button></div></form>
      <form className="fees-form fees-bulk-form" onSubmit={createBulkInvoices}>
        <h3>Generate invoices for a class</h3>
        <p className="fees-help">One invoice is created for each active enrollment. Students already invoiced for the same fee structure and due date are skipped.</p>
        <div className="fees-form-grid">
          <label>Class<select required value={bulkForm.classId} onChange={(e) => setBulkForm((s) => ({ ...s, classId: e.target.value, sectionId: "", feeStructureId: "" }))}><option value="">Select class</option>{currentClasses.filter((item) => item.status === "active").map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <label>Section<select value={bulkForm.sectionId} onChange={(e) => setBulkForm((s) => ({ ...s, sectionId: e.target.value }))} disabled={!bulkForm.classId}><option value="">All sections (including unsectioned students)</option>{bulkSections.map((section) => <option key={section._id} value={section._id}>{section.name}</option>)}</select></label>
          <label>Fee structure<select required value={bulkForm.feeStructureId} onChange={(e) => setBulkForm((s) => ({ ...s, feeStructureId: e.target.value }))}><option value="">Select structure</option>{structures.filter((item) => (item.classId?._id || item.classId) === bulkForm.classId && item.status === "active").map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <label>Due date<input required type="date" value={bulkForm.dueDate} onChange={(e) => setBulkForm((s) => ({ ...s, dueDate: e.target.value }))} /></label>
          <label>Invoice prefix<input required maxLength="24" pattern="[A-Za-z0-9-]+" value={bulkForm.invoiceNumberPrefix} onChange={(e) => setBulkForm((s) => ({ ...s, invoiceNumberPrefix: e.target.value.toUpperCase() }))} placeholder="e.g. MAY26" /></label>
        </div>
        <div className="fees-form-actions"><button className="fees-primary" disabled={busy || !yearId}>{busy ? "Generating…" : "Generate class invoices"}</button></div>
        {bulkResult && <div className="fees-bulk-results" role="status"><strong>{bulkResult.created} created · {bulkResult.skipped} skipped · {bulkResult.totalEligible} eligible</strong><div className="fees-bulk-result-list">{bulkResult.results.map((item) => <div key={item.enrollmentId}><span>{item.studentName || item.enrollmentId} {item.admissionNumber ? `· ${item.admissionNumber}` : ""}</span><span className={item.status === "created" ? "fees-result-created" : "fees-result-skipped"}>{item.status}{item.invoiceNumber ? ` · ${item.invoiceNumber}` : item.reason ? ` · ${item.reason}` : ""}</span></div>)}</div></div>}
      </form>
      <div className="fees-list-heading"><h3>Student invoices</h3><span>{invoices.length} invoices</span></div>
      {invoices.length ? <div className="fees-table-wrap"><table className="fees-table"><thead><tr><th>Invoice / Student</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice._id}><td><strong>{invoice.invoiceNumber}</strong><small>{studentName(invoice.studentId)} · {invoice.studentId?.admissionNumber}</small></td><td>{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td><td>{money(invoice.totalAmount)}</td><td>{money(invoice.paidAmount)}</td><td>{money(invoice.totalAmount - invoice.paidAmount)}</td><td><span className={`fees-status fees-${invoice.status}`}>{invoice.status}</span></td><td><button type="button" className="fees-secondary" onClick={() => void openPayments(invoice)}>Record payment / receipts</button></td></tr>)}</tbody></table></div> : <p className="fees-empty">No invoices issued for this academic year.</p>}
    </> : <>
      <div className="fees-form">
        <h3>Outstanding fee report</h3>
        <div className="fees-form-grid">
          <label>Class<select value={outstandingClassId} onChange={(event) => { setOutstandingClassId(event.target.value); setOutstandingSectionId(""); }}><option value="">All classes</option>{currentClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <label>Section<select value={outstandingSectionId} onChange={(event) => setOutstandingSectionId(event.target.value)} disabled={!outstandingClassId}><option value="">All sections</option>{outstandingSections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <label className="fees-checkbox-label"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /> Overdue invoices only</label>
        </div>
        <div className="fees-summary-grid">
          <div><span>Outstanding invoices</span><strong>{outstanding.summary.invoiceCount}</strong></div>
          <div><span>Total outstanding</span><strong>{money(outstanding.summary.totalOutstanding)}</strong></div>
          <div><span>Overdue invoices</span><strong>{outstanding.summary.overdueCount}</strong></div>
          <div><span>Overdue amount</span><strong>{money(outstanding.summary.overdueAmount)}</strong></div>
        </div>
      </div>
      {outstanding.data.length ? <div className="fees-table-wrap"><table className="fees-table"><thead><tr><th>Invoice / Student</th><th>Class / Section</th><th>Due date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{outstanding.data.map((invoice) => <tr key={invoice._id}><td><strong>{invoice.invoiceNumber}</strong><small>{studentName(invoice.studentId)} · {invoice.studentId?.admissionNumber || ""}</small></td><td>{invoice.enrollmentId?.classId?.name || "—"} / {invoice.enrollmentId?.sectionId?.name || "—"}</td><td>{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td><td>{money(invoice.totalAmount)}</td><td>{money(invoice.paidAmount)}</td><td>{money(invoice.totalAmount - invoice.paidAmount)}</td><td><span className={`fees-status fees-${invoice.status}`}>{new Date(invoice.dueDate) < new Date() ? "overdue" : invoice.status}</span></td></tr>)}</tbody></table></div> : <p className="fees-empty">No outstanding invoices match these filters.</p>}
    </>}
    {paymentInvoice && <div className="fees-modal-backdrop" role="presentation"><section className="fees-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button className="fees-modal-close" type="button" onClick={() => setPaymentInvoice(null)} aria-label="Close">×</button><h3 id="payment-title">Record payment</h3><p>{paymentInvoice.invoiceNumber} · Outstanding {money(paymentInvoice.totalAmount - paymentInvoice.paidAmount)}</p><form onSubmit={recordPayment}><div className="fees-form-grid"><label>Amount (₹)<input required type="number" min="0.01" max={paymentInvoice.totalAmount - paymentInvoice.paidAmount} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((s) => ({ ...s, amount: e.target.value }))} /></label><label>Payment method<select value={paymentForm.method} onChange={(e) => setPaymentForm((s) => ({ ...s, method: e.target.value }))}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="upi">UPI</option><option value="card">Card</option><option value="other">Other</option></select></label><label>Payment date<input type="date" required value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((s) => ({ ...s, paymentDate: e.target.value }))} /></label><label>Reference<input maxLength="100" value={paymentForm.reference} onChange={(e) => setPaymentForm((s) => ({ ...s, reference: e.target.value }))} placeholder="Transaction / cheque no." /></label></div><label>Notes<textarea maxLength="300" value={paymentForm.notes} onChange={(e) => setPaymentForm((s) => ({ ...s, notes: e.target.value }))} /></label><div className="fees-form-actions"><button className="fees-primary" disabled={busy}>{busy ? "Saving…" : "Save payment"}</button></div></form><h4>Payment history</h4><label className="fees-reversal-reason">Reversal reason (required for reversal)<textarea minLength="5" maxLength="300" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Explain why this payment is being reversed" /></label>{payments.length ? payments.map((payment) => <div className="fees-payment-row" key={payment._id}><span>{payment.receiptNumber}<small>{payment.method.replace("_", " ")} · {new Date(payment.paymentDate).toLocaleDateString("en-IN")} · {payment.status || "posted"}{payment.status === "reversed" ? ` · Reversed: ${payment.reversalReason}` : ""}</small></span><strong>{money(payment.amount)}</strong><div className="fees-payment-actions"><button type="button" className="fees-secondary" onClick={() => printPaymentReceipt(payment, paymentInvoice)}>Print receipt</button>{payment.status !== "reversed" && <button type="button" className="fees-danger" disabled={busy || reversalReason.trim().length < 5} onClick={() => void reversePayment(payment)}>Reverse</button>}</div></div>) : <p className="fees-empty">No payments recorded yet.</p>}</section></div>}
  </section>;
}
