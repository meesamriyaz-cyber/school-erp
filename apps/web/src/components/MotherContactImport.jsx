import { useState } from "react";
import { apiRequest } from "../lib/api.js";

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field.trim()); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) throw new Error("The CSV file is empty.");
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
  const required = ["admissionnumber", "motherfirstname", "motherlastname", "motherphone", "motheremail"];
  if (headers.length !== required.length || required.some((header) => !headers.includes(header))) {
    throw new Error("Use the template headers: AdmissionNumber, MotherFirstName, MotherLastName, MotherPhone, MotherEmail.");
  }
  return rows.map((values) => Object.fromEntries(required.map((header) => [header, values[headers.indexOf(header)] || ""])))
    .filter((item) => item.admissionnumber);
}

export default function MotherContactImport({ accessToken, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const downloadTemplate = () => {
    const csv = "AdmissionNumber,MotherFirstName,MotherLastName,MotherPhone,MotherEmail\nADM001,Ayesha,Khan,9876543210, mother@example.com\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mother-contact-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    setError("");
    setResult(null);
    setRows([]);
    setFileName(file?.name || "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Please choose a CSV file."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("CSV file must be smaller than 2 MB."); return; }
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length > 500) throw new Error("Import up to 500 students per file.");
      setRows(parsed);
    } catch (parseError) { setError(parseError.message || "Unable to read this CSV file."); }
  };

  const importRows = async () => {
    setSaving(true);
    setError("");
    setResult(null);
    try {
      const response = await apiRequest("/students/bulk-mother-contacts", {
        method: "POST",
        accessToken,
        body: { rows: rows.map((row) => ({
          admissionNumber: row.admissionnumber,
          motherFirstName: row.motherfirstname,
          motherLastName: row.motherlastname,
          motherPhone: row.motherphone,
          motherEmail: row.motheremail,
        })) },
      });
      if (!response?.success) throw new Error("Mother contact import failed.");
      setResult(response);
      onImported?.(response);
    } catch (importError) { setError(importError.message || "Unable to import mother contacts."); }
    finally { setSaving(false); }
  };

  return (
    <section className="student-details-card mother-contact-import" aria-labelledby="mother-contact-import-title">
      <div className="student-guardian-heading">
        <div>
          <h3 id="mother-contact-import-title">Import mothers' contact details</h3>
          <p>Match existing students by Admission Number. Father records and primary communication settings are not changed.</p>
        </div>
        <button type="button" onClick={downloadTemplate}>Download CSV template</button>
      </div>
      <label>
        Choose CSV file
        <input type="file" accept=".csv,text/csv" onChange={selectFile} />
      </label>
      {fileName && <p>{fileName} · {rows.length} student rows ready</p>}
      {error && <p className="student-guardian-error" role="alert">{error}</p>}
      {rows.length > 0 && (
        <>
          <p>Preview: {rows.slice(0, 5).map((row) => `${row.admissionnumber} — ${row.motherfirstname} ${row.motherlastname}`).join(" · ")}{rows.length > 5 ? " …" : ""}</p>
          <button type="button" className="student-guardian-primary-button" onClick={importRows} disabled={saving}>
            {saving ? "Importing…" : `Import ${rows.length} mother records`}
          </button>
        </>
      )}
      {result?.summary && (
        <div role="status">
          <p>Import complete: {result.summary.updated} updated, {result.summary.notFound} admission numbers not found, {result.summary.skipped} skipped, {result.summary.errors} errors.</p>
          {result.data?.some((item) => item.status !== "updated") && (
            <ul>{result.data.filter((item) => item.status !== "updated").map((item) => <li key={item.admissionNumber}>{item.admissionNumber}: {item.message}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
