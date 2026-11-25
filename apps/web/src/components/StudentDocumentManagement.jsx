import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";

const categories = [
  ["birth_certificate", "Birth certificate"], ["identity_proof", "Identity proof"],
  ["address_proof", "Address proof"], ["previous_school", "Previous-school record"],
  ["transfer_certificate", "Transfer certificate"], ["medical", "Medical record"],
  ["photograph", "Photograph"], ["other", "Other"],
];
const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const studentName = (student) => [student.firstName, student.lastName].filter(Boolean).join(" ");

export default function StudentDocumentManagement() {
  const { accessToken } = useAuth();
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [category, setCategory] = useState("birth_certificate");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiRequest("/students?limit=100", { accessToken })
      .then((response) => setStudents(response.data || []))
      .catch((err) => setError(err.message || "Unable to load students."));
  }, [accessToken]);

  const loadDocuments = async (selectedId = studentId) => {
    if (!selectedId) { setDocuments([]); return; }
    const response = await apiRequest(`/students/${encodeURIComponent(selectedId)}/documents`, { accessToken });
    setDocuments(response.data || []);
  };

  useEffect(() => {
    if (!studentId) { setDocuments([]); return; }
    loadDocuments(studentId).catch((err) => setError(err.message || "Unable to load documents."));
  }, [studentId, accessToken]);

  const upload = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!studentId || !file) { setError("Select a student and a file."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("File size must not exceed 10 MB."); return; }
    setLoading(true);
    try {
      const signed = await apiRequest(`/students/${encodeURIComponent(studentId)}/documents/signature`, { method: "POST", accessToken, body: {} });
      const sign = signed.data;
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sign.apiKey);
      form.append("timestamp", String(sign.timestamp));
      form.append("folder", sign.folder);
      form.append("allowed_formats", sign.allowedFormats);
      form.append("public_id", sign.publicId);
      form.append("signature", sign.signature);
      const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`, { method: "POST", body: form });
      const uploaded = await cloudResponse.json();
      if (!cloudResponse.ok) throw new Error(uploaded?.error?.message || "Cloudinary upload failed.");
      await apiRequest(`/students/${encodeURIComponent(studentId)}/documents`, { method: "POST", accessToken, body: {
        name: file.name, category, fileUrl: uploaded.secure_url, publicId: uploaded.public_id,
        resourceType: uploaded.resource_type, format: uploaded.format, bytes: uploaded.bytes, notes,
      }});
      setFile(null); setNotes(""); event.target.reset();
      setNotice("Document uploaded and added to the student record.");
      await loadDocuments(studentId);
    } catch (err) { setError(err.message || "Document upload failed."); }
    finally { setLoading(false); }
  };

  const remove = async (document) => {
    if (!window.confirm(`Delete the record for "${document.name}"? The file will also be deleted from Cloudinary.`)) return;
    setError(""); setNotice("");
    try {
      await apiRequest(`/students/${encodeURIComponent(studentId)}/documents/${encodeURIComponent(document._id)}`, { method: "DELETE", accessToken });
      setDocuments((current) => current.filter((item) => item._id !== document._id));
      setNotice("Document and Cloudinary file deleted.");
    } catch (err) { setError(err.message || "Unable to delete document."); }
  };

  return <section className="content-card" style={{ padding: 24 }}>
    <header style={{ marginBottom: 20 }}><h2>Student Document Management</h2><p>Upload and maintain student records securely in Cloudinary.</p></header>
    {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
    {notice && <p role="status" style={{ color: "#067647" }}>{notice}</p>}
    <label style={{ display: "grid", gap: 6, maxWidth: 520, marginBottom: 18 }}>Student
      <select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Select a student</option>{students.map((student) => <option key={student._id} value={student._id}>{student.admissionNumber} — {studentName(student)}</option>)}</select>
    </label>
    <form onSubmit={upload} style={{ display: "grid", gap: 12, maxWidth: 620, padding: 18, border: "1px solid #e4e7ec", borderRadius: 12, marginBottom: 24 }}>
      <h3>Upload a document</h3>
      <label style={{ display: "grid", gap: 6 }}>Document category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label style={{ display: "grid", gap: 6 }}>File (PDF, JPG, PNG; max 10 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <label style={{ display: "grid", gap: 6 }}>Notes (optional)<textarea rows="2" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={loading || !studentId || !file}>{loading ? "Uploading…" : "Upload document"}</button>
      <small>Files are uploaded directly to Cloudinary using a short-lived server signature. The API secret is never exposed to the browser.</small>
    </form>
    <h3>Document register {studentId ? `(${documents.length})` : ""}</h3>
    {!studentId ? <p>Select a student to view their documents.</p> : documents.length === 0 ? <p>No documents have been uploaded for this student.</p> :
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th align="left">Document</th><th align="left">Category</th><th align="left">Size</th><th align="left">Uploaded</th><th align="left">File</th><th /></tr></thead><tbody>
        {documents.map((document) => <tr key={document._id}><td>{document.name}{document.notes ? <small style={{ display: "block" }}>{document.notes}</small> : null}</td><td>{categories.find(([value]) => value === document.category)?.[1] || document.category}</td><td>{formatSize(document.bytes)}</td><td>{new Date(document.createdAt).toLocaleDateString("en-IN")}</td><td><a href={document.fileUrl} target="_blank" rel="noreferrer">Open</a></td><td><button type="button" onClick={() => remove(document)}>Delete record</button></td></tr>)}
      </tbody></table></div>}
  </section>;
}
