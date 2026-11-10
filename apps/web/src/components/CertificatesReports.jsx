import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import "./CertificatesReports.css";

const id = (value) => String(value?._id || value || "");
const nameOf = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Unnamed student";
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const downloadCsv = (filename, rows) => {
  if (!rows.length) return;
  const csv = [Object.keys(rows[0]).map(csvCell).join(","), ...rows.map((row) => Object.values(row).map(csvCell).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
};

export default function CertificatesReports() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState("certificates");
  const [students, setStudents] = useState([]);
  const [years, setYears] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [certificateType, setCertificateType] = useState("bonafide");
  const [reason, setReason] = useState("");
  const [reissuedFrom, setReissuedFrom] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reissueDraft, setReissueDraft] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [issued, setIssued] = useState(null);
  const [reportType, setReportType] = useState("history");
  const [yearId, setYearId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCertificates = async () => {
    const response = await apiRequest("/certificates?limit=100", { accessToken });
    setCertificates(response.data || []);
  };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiRequest("/students?limit=100", { accessToken, signal: controller.signal }),
      apiRequest("/academic-years", { accessToken, signal: controller.signal }),
      apiRequest("/certificates?limit=100", { accessToken, signal: controller.signal }),
    ]).then(([studentResponse, yearResponse, certificateResponse]) => {
      if (controller.signal.aborted) return;
      setStudents(studentResponse.data || []);
      setYears(yearResponse.data || []);
      setCertificates(certificateResponse.data || []);
      const active = (yearResponse.data || []).find((item) => item.status === "active");
      if (active) setYearId(id(active));
    }).catch((err) => { if (err.name !== "AbortError") setError(err.message || "Unable to load certificates and reports."); });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    if (!studentId) return undefined;
    const controller = new AbortController();
    apiRequest(`/enrollments?studentId=${encodeURIComponent(studentId)}`, { accessToken, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setEnrollments(response.data || []);
        setEnrollmentId(reissueDraft ? id(reissueDraft.enrollmentId) : "");
        setReissueDraft(null);
      }).catch((err) => { if (err.name !== "AbortError") setError(err.message || "Unable to load enrollment history."); });
    return () => controller.abort();
  }, [accessToken, studentId, reissueDraft]);

  const issue = async (event) => {
    event.preventDefault(); setError(""); setNotice(""); setIssued(null);
    if (!studentId || !enrollmentId) { setError("Select a student and the relevant enrollment."); return; }
    setLoading(true);
    try {
      const response = await apiRequest("/certificates", { method: "POST", accessToken, body: {
        studentId, enrollmentId, type: certificateType, reason, remarks,
        ...(reissuedFrom ? { reissuedFrom } : {}),
      }});
      setIssued(response.data); setNotice(reissuedFrom ? "Replacement certificate issued; original history is retained." : "Certificate issued and registered.");
      setReissuedFrom(""); setReissueDraft(null);
      await loadCertificates();
    } catch (err) { setError(err.message || "Certificate issuance failed."); }
    finally { setLoading(false); }
  };

  const generateReport = async () => {
    setLoading(true); setError(""); setNotice(""); setReport(null);
    try {
      let path;
      if (reportType === "history") {
        if (!studentId) throw new Error("Select a student to generate academic history.");
        path = `/reports/student-history?studentId=${encodeURIComponent(studentId)}`;
      } else if (reportType === "strength") {
        path = `/reports/enrollment-strength${yearId ? `?academicYearId=${encodeURIComponent(yearId)}` : ""}`;
      } else {
        path = `/reports/fees${yearId ? `?academicYearId=${encodeURIComponent(yearId)}` : ""}`;
      }
      const response = await apiRequest(path, { accessToken });
      setReport(reportType === "history" ? response.data : response);
    } catch (err) { setError(err.message || "Unable to generate report."); }
    finally { setLoading(false); }
  };

  const prepareReissue = (certificate) => {
    setTab("certificates"); setIssued(null); setReissueDraft(certificate);
    setStudentId(id(certificate.studentId)); setCertificateType(certificate.type); setReissuedFrom(certificate._id);
    setReason(certificate.reason || ""); setRemarks(certificate.remarks || "");
    setNotice("Review the details and issue a replacement certificate. The original record will remain in the register.");
  };

  const voidCertificate = async (certificate) => {
    const voidReason = window.prompt("Enter the reason for voiding this certificate:");
    if (!voidReason?.trim()) return;
    setError(""); setNotice("");
    try {
      await apiRequest(`/certificates/${certificate._id}/void`, { method: "PATCH", accessToken, body: { reason: voidReason.trim() } });
      setNotice("Certificate marked void. Its original record remains in the register.");
      await loadCertificates();
    } catch (err) { setError(err.message || "Unable to void certificate."); }
  };

  const exportRows = () => {
    if (!report) return;
    const rows = reportType === "strength"
      ? (report.data || []).map(({ academicYear, className, sectionName, active, completed, transferred, withdrawn }) => ({ academicYear, className, sectionName, active, completed, transferred, withdrawn }))
      : reportType === "fees"
        ? (report.data || []).map((item) => ({
          invoiceNumber: item.invoiceNumber, student: nameOf(item.studentId), academicYear: item.academicYearId?.name,
          totalAmount: item.totalAmount, paidAmount: item.paidAmount, outstanding: Math.max(0, item.totalAmount - item.paidAmount),
          postedPayments: item.paymentSummary?.posted, reversedPayments: item.paymentSummary?.reversed,
        }))
        : (report.enrollments || []).map((item) => ({
          academicYear: item.academicYearId?.name, className: item.classId?.name, section: item.sectionId?.name || "",
          enrollmentDate: item.enrollmentDate, status: item.status, endedAt: item.endedAt || "",
        }));
    downloadCsv(`school-report-${reportType}.csv`, rows);
  };

  const printableCertificate = issued || null;
  return <section className="certificates-reports">
    <header className="cr-heading"><div><h2>Certificates & reports</h2><p>Issue verified school certificates and prepare academic, enrollment and finance reports.</p></div>
      <div className="cr-actions"><button type="button" onClick={() => window.print()} disabled={!printableCertificate && !report}>Print current view</button></div>
    </header>
    <nav className="cr-tabs" aria-label="Certificates and reports">
      <button className={tab === "certificates" ? "active" : ""} onClick={() => setTab("certificates")}>Certificates</button>
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Reports</button>
    </nav>
    {error && <p className="cr-error" role="alert">{error}</p>}
    {notice && <p className="cr-notice" role="status">{notice}</p>}
    {tab === "certificates" ? <>
      <form className="cr-panel cr-form" onSubmit={issue}>
        <h3>Issue a certificate</h3>
        <label>Student<select required value={studentId} onChange={(event) => { setStudentId(event.target.value); setEnrollments([]); setEnrollmentId(""); setIssued(null); }}><option value="">Select student</option>{students.map((item) => <option key={id(item)} value={id(item)}>{item.admissionNumber} — {nameOf(item)}</option>)}</select></label>
        <label>Certificate type<select value={certificateType} onChange={(event) => setCertificateType(event.target.value)}><option value="bonafide">Bonafide certificate</option><option value="transfer">Transfer certificate</option></select></label>
        <label>Enrollment<select required value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}><option value="">Select enrollment record</option>{enrollments.map((item) => <option key={id(item)} value={id(item)}>{item.academicYearId?.name} · {item.classId?.name}{item.sectionId?.name ? ` / ${item.sectionId.name}` : ""} · {item.status}</option>)}</select></label>
        {certificateType === "transfer" && <label>Reason for leaving / transfer<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></label>}
        <label>Remarks (optional)<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={500} /></label>
        <p className="cr-help">Certificate identity and placement details are copied from verified school records. Bonafide requires an active enrollment; transfer requires an ended enrollment.</p>
        <button type="submit" disabled={loading || !studentId || !enrollmentId}>{loading ? "Issuing…" : "Issue certificate"}</button>
      </form>
      {issued && <article className="cr-certificate" aria-label="Issued certificate">
        <div className="cr-certificate-top"><strong>{issued.snapshot.school}</strong><span>{issued.type === "bonafide" ? "BONAFIDE CERTIFICATE" : "TRANSFER CERTIFICATE"}</span></div>
        <p>Certificate No: <strong>{issued.certificateNumber}</strong></p>
        <p>This is to certify that <strong>{issued.snapshot.studentName}</strong>, Admission No. <strong>{issued.snapshot.admissionNumber}</strong>, was enrolled in <strong>{issued.snapshot.className}</strong> {issued.snapshot.sectionName ? `(${issued.snapshot.sectionName})` : ""} during academic year <strong>{issued.snapshot.academicYear}</strong>.</p>
        {issued.type === "transfer" && <p>Enrollment ended on {new Date(issued.snapshot.enrollmentEndedAt).toLocaleDateString()} for the recorded reason: {issued.snapshot.transferReason || issued.reason}.</p>}
        {issued.remarks && <p>Remarks: {issued.remarks}</p>}
        <p>Issued on: {new Date(issued.issuedAt).toLocaleDateString()}</p>
        <p>Verification code: <strong>{issued.verificationCode || "Available in secure verification record"}</strong></p>
        <small>Printed copy is a representation of the registered certificate. Verify authenticity using the school's certificate register.</small>
      </article>}
      <div className="cr-panel"><h3>Certificate register</h3>
        <div className="cr-table-wrap"><table><thead><tr><th>Certificate no.</th><th>Student</th><th>Type</th><th>Issued</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {certificates.map((item) => <tr key={item._id}><td>{item.certificateNumber}</td><td>{nameOf(item.studentId)}</td><td>{item.type}</td><td>{new Date(item.issuedAt).toLocaleDateString()}</td><td>{item.status}</td><td>{item.status === "issued" && <div className="cr-actions"><button type="button" onClick={() => prepareReissue(item)}>Reissue</button><button type="button" onClick={() => voidCertificate(item)}>Void</button></div>}</td></tr>)}
          {!certificates.length && <tr><td colSpan="6">No certificates issued yet.</td></tr>}
        </tbody></table></div>
      </div>
    </> : <>
      <div className="cr-panel cr-form">
        <h3>Generate a school report</h3>
        <label>Report type<select value={reportType} onChange={(event) => { setReportType(event.target.value); setReport(null); }}><option value="history">Student academic history</option><option value="strength">Enrollment / class strength</option><option value="fees">Fee collection and outstanding</option></select></label>
        {reportType === "history" && <label>Student<select value={studentId} onChange={(event) => { setStudentId(event.target.value); setReport(null); }}><option value="">Select student</option>{students.map((item) => <option key={id(item)} value={id(item)}>{item.admissionNumber} — {nameOf(item)}</option>)}</select></label>}
        {reportType !== "history" && <label>Academic year<select value={yearId} onChange={(event) => setYearId(event.target.value)}><option value="">All academic years</option>{years.map((item) => <option key={id(item)} value={id(item)}>{item.name}</option>)}</select></label>}
        <div className="cr-actions"><button type="button" onClick={() => void generateReport()} disabled={loading}>{loading ? "Generating…" : "Generate report"}</button><button type="button" onClick={exportRows} disabled={!report}>Export CSV</button><button type="button" onClick={() => window.print()} disabled={!report}>Print / Save PDF</button></div>
      </div>
      {report && <div className="cr-panel cr-report">
        {reportType === "history" ? <>
          <h3>Academic history — {nameOf(report.student)}</h3><p>Admission no. {report.student.admissionNumber} · Status: {report.student.status}</p>
          <h4>Enrollment history</h4><div className="cr-table-wrap"><table><thead><tr><th>Academic year</th><th>Class</th><th>Section</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>{report.enrollments.map((item) => <tr key={item._id}><td>{item.academicYearId?.name}</td><td>{item.classId?.name}</td><td>{item.sectionId?.name || "—"}</td><td>{new Date(item.enrollmentDate).toLocaleDateString()}</td><td>{item.endedAt ? new Date(item.endedAt).toLocaleDateString() : "—"}</td><td>{item.status}</td></tr>)}</tbody></table></div>
          <h4>Published examination results</h4><div className="cr-table-wrap"><table><thead><tr><th>Examination</th><th>Date</th><th>Score</th><th>Percentage</th><th>Grade</th><th>Status</th></tr></thead><tbody>{report.academicResults.map((item) => <tr key={item.examinationId}><td>{item.examinationName}</td><td>{new Date(item.startDate).toLocaleDateString()}</td><td>{item.result.totalObtained}/{item.result.totalMaximum}</td><td>{item.result.percentage}%</td><td>{item.result.grade || "—"}</td><td>{item.result.status}</td></tr>)}</tbody></table></div>
        </> : reportType === "strength" ? <>
          <h3>Enrollment strength</h3><p>Total records: {report.summary?.totalStudents || 0}</p><div className="cr-table-wrap"><table><thead><tr><th>Year</th><th>Class</th><th>Section</th><th>Active</th><th>Completed</th><th>Transferred</th><th>Withdrawn</th></tr></thead><tbody>{(report.data || []).map((item, index) => <tr key={index}><td>{item.academicYear}</td><td>{item.className}</td><td>{item.sectionName}</td><td>{item.active}</td><td>{item.completed}</td><td>{item.transferred}</td><td>{item.withdrawn}</td></tr>)}</tbody></table></div>
        </> : <>
          <h3>Fee collection report</h3><div className="cr-metrics"><span>Invoiced: ₹{report.summary?.invoiced ?? 0}</span><span>Outstanding: ₹{report.summary?.outstanding ?? 0}</span><span>Posted payments: ₹{report.summary?.postedPayments ?? 0}</span><span>Reversed payments: ₹{report.summary?.reversedPayments ?? 0}</span></div><div className="cr-table-wrap"><table><thead><tr><th>Invoice</th><th>Student</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Posted</th><th>Reversed</th></tr></thead><tbody>{report.data?.map((item) => <tr key={item._id}><td>{item.invoiceNumber}</td><td>{nameOf(item.studentId)}</td><td>₹{item.totalAmount}</td><td>₹{item.paidAmount}</td><td>₹{Math.max(0, item.totalAmount - item.paidAmount)}</td><td>₹{item.paymentSummary?.posted || 0}</td><td>₹{item.paymentSummary?.reversed || 0}</td></tr>)}</tbody></table></div>
        </>}
      </div>}
    </>}
  </section>;
}
