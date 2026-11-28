import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";

const initialForm = {
  admissionNumber: "", firstName: "", lastName: "", dateOfBirth: "", photoUrl: "",
  address: { line1: "", line2: "", city: "", district: "", state: "", postalCode: "", country: "" },
  gender: "not_specified", admissionDate: new Date().toISOString().slice(0, 10),
  guardianName: "", guardianRelationship: "other", guardianPhone: "", guardianEmail: "",
  father: { firstName: "", lastName: "", phone: "", email: "", photoUrl: "" },
  mother: { firstName: "", lastName: "", phone: "", email: "", photoUrl: "" },
};

export default function StudentForm({ onClose, onCreated }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdStudent, setCreatedStudent] = useState(null);
  const [parentVerification, setParentVerification] = useState([]);

  useEffect(() => {
    let alive = true;
    apiRequest("/academic-years?status=active", { accessToken })
      .then((response) => {
        if (!alive) return;
        const available = Array.isArray(response?.data) ? response.data.filter((item) => item.status === "active") : [];
        setYears(available);
        setYearId(available[0]?._id || "");
      })
      .catch((err) => { if (alive) setError(err.message || "Unable to load academic years."); })
      .finally(() => { if (alive) setOptionsLoading(false); });
    return () => { alive = false; };
  }, [accessToken]);

  useEffect(() => {
    let alive = true;
    if (!yearId) return undefined;
    apiRequest(`/classes?academicYearId=${encodeURIComponent(yearId)}&status=active`, { accessToken })
      .then((response) => { if (alive) setClasses(Array.isArray(response?.data) ? response.data.filter((item) => item.status === "active") : []); })
      .catch((err) => { if (alive) setError(err.message || "Unable to load classes."); });
    return () => { alive = false; };
  }, [accessToken, yearId]);

  useEffect(() => {
    let alive = true;
    if (!classId) return undefined;
    apiRequest(`/sections?classId=${encodeURIComponent(classId)}&status=active`, { accessToken })
      .then((response) => { if (alive) setSections(Array.isArray(response?.data) ? response.data.filter((item) => item.status === "active") : []); })
      .catch((err) => { if (alive) setError(err.message || "Unable to load sections."); });
    return () => { alive = false; };
  }, [accessToken, classId]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }
  function updateParentField(parent, event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [parent]: { ...current[parent], [name]: name === "phone" ? value.replace(/[^0-9]/g, "").slice(0, 10) : value } }));
  }
  function updateAddressField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, address: { ...current.address, [name]: value } }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!yearId || !classId) { setError("Select an active academic year and class before saving the admission."); return; }
    setSaving(true);
    try {
      let student = createdStudent;
      if (!student) {
        const payload = {
          ...form,
          admissionNumber: form.admissionNumber.trim(), firstName: form.firstName.trim(),
          lastName: form.lastName.trim(), guardianName: form.guardianName.trim(),
          guardianPhone: form.guardianPhone.trim(), guardianEmail: form.guardianEmail.trim(),
          dateOfBirth: form.dateOfBirth || null, photoUrl: form.photoUrl.trim() || null,
          address: Object.fromEntries(Object.entries(form.address).map(([key, value]) => [key, value.trim()])),
          parents: Object.fromEntries(["father", "mother"].map((role) => [role, form[role].firstName.trim() ? { ...form[role], firstName: form[role].firstName.trim(), lastName: form[role].lastName.trim(), phone: form[role].phone.trim(), email: form[role].email.trim(), photoUrl: form[role].photoUrl.trim() } : undefined])),
        };
        const response = await apiRequest("/students", { method: "POST", accessToken, body: payload });
        if (!response?.success || !response.data?._id) throw new Error("Student profile was not created successfully.");
        student = response.data;
        setCreatedStudent(student);
        const verificationTargets = response.parents || [];
        const verification = await Promise.all(verificationTargets.filter((parent) => parent.emailVerificationRequired).map(async (parent) => {
          const email = form[parent.relationship]?.email?.trim();
          try {
            await apiRequest(`/guardians/${parent.guardianId}/email-verification/send`, { method: "POST", accessToken, body: { email } });
            return { ...parent, sent: true };
          } catch (sendError) { return { ...parent, sent: false, error: sendError.message || "Email could not be sent" }; }
        }));
        setParentVerification(verification);
        if (verification.some((item) => !item.sent)) setNotice("Student profile created, but one or more parent verification emails could not be sent. Resend from Guardian Directory.");
        else if (verification.length) setNotice("Parent email verification codes have been sent.");
      }
      const enrollmentResponse = await apiRequest("/enrollments", {
        method: "POST", accessToken,
        body: {
          studentId: student._id, academicYearId: yearId, classId,
          sectionId: sectionId || null, enrollmentDate: form.admissionDate,
          reAdmissionReason: "",
        },
      });
      if (!enrollmentResponse?.success || !enrollmentResponse.data) throw new Error("Student profile was saved, but academic placement could not be completed. Retry placement; the student profile will not be duplicated.");
      onCreated(student);
    } catch (err) {
      setError(err.message || "Unable to complete student admission.");
      if (createdStudent) setNotice("Student profile already exists. Correct the placement details if needed, then retry; a duplicate student record will not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="student-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="student-form-modal" role="dialog" aria-modal="true" aria-labelledby="student-form-title">
        <div className="student-form-header">
          <div><h2 id="student-form-title">Add student</h2><p>Enter student details and assign an initial academic placement.</p></div>
          <button type="button" className="student-form-close" onClick={onClose} disabled={saving} aria-label="Close form">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="student-form-body">
            <h3>Student information</h3>
            <div className="student-form-grid">
              <label>Admission number *<input name="admissionNumber" value={form.admissionNumber} onChange={updateField} maxLength={50} required disabled={!!createdStudent}/></label>
              <label>Admission date *<input name="admissionDate" type="date" value={form.admissionDate} onChange={updateField} required disabled={!!createdStudent}/></label>
              <label>Student first name *<input name="firstName" value={form.firstName} onChange={updateField} maxLength={80} required disabled={!!createdStudent}/></label>
              <label>Last name<input name="lastName" value={form.lastName} onChange={updateField} maxLength={80} disabled={!!createdStudent}/></label>
              <label>Date of birth<input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={updateField} disabled={!!createdStudent}/></label>
              <label>Gender<select name="gender" value={form.gender} onChange={updateField} disabled={!!createdStudent}><option value="not_specified">Prefer not to specify</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
            </div>
            <h3>Address & profile</h3>
            <div className="student-form-grid">
              <label className="student-form-full">Student photo URL (HTTPS)<input name="photoUrl" type="url" value={form.photoUrl} onChange={updateField} maxLength={2048} placeholder="https://…" disabled={!!createdStudent}/></label>
              <label className="student-form-full">Address line 1<input name="line1" value={form.address.line1} onChange={updateAddressField} maxLength={120} disabled={!!createdStudent}/></label>
              <label className="student-form-full">Address line 2<input name="line2" value={form.address.line2} onChange={updateAddressField} maxLength={120} disabled={!!createdStudent}/></label>
              <label>City / Town<input name="city" value={form.address.city} onChange={updateAddressField} maxLength={80} disabled={!!createdStudent}/></label>
              <label>District<input name="district" value={form.address.district} onChange={updateAddressField} maxLength={80} disabled={!!createdStudent}/></label>
              <label>State<input name="state" value={form.address.state} onChange={updateAddressField} maxLength={80} disabled={!!createdStudent}/></label>
              <label>Postal code<input name="postalCode" value={form.address.postalCode} onChange={updateAddressField} maxLength={12} disabled={!!createdStudent}/></label>
              <label>Country<input name="country" value={form.address.country} onChange={updateAddressField} maxLength={80} disabled={!!createdStudent}/></label>
            </div>
            <h3>Guardian information</h3>
            <div className="student-form-grid">
              <label>Primary guardian name *<input name="guardianName" value={form.guardianName} required onChange={updateField} maxLength={160} disabled={!!createdStudent}/></label>
              <label>Relationship to student<select name="guardianRelationship" value={form.guardianRelationship} onChange={updateField} required disabled={!!createdStudent}><option value="mother">Mother</option><option value="father">Father</option><option value="uncle">Uncle</option><option value="aunt">Aunt</option><option value="grandparent">Grandparent</option><option value="step_parent">Step-parent</option><option value="sibling">Brother / Sister</option><option value="legal_guardian">Legal guardian</option><option value="other">Other</option></select></label>
              <label>Guardian phone<input name="guardianPhone" type="tel" value={form.guardianPhone} onChange={updateField} maxLength={20} disabled={!!createdStudent}/></label>
              <label className="student-form-full">Guardian email<input name="guardianEmail" type="email" value={form.guardianEmail} onChange={updateField} maxLength={254} disabled={!!createdStudent}/></label>
            </div>
            <h3>Father details (optional)</h3>
            <div className="student-form-grid">
              <label>Father first name<input name="firstName" value={form.father.firstName} onChange={(event) => updateParentField("father", event)} maxLength={80} disabled={!!createdStudent}/></label>
              <label>Father last name<input name="lastName" value={form.father.lastName} onChange={(event) => updateParentField("father", event)} maxLength={80} disabled={!!createdStudent}/></label>
              <label>Father phone (10 digits)<input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.father.phone} onChange={(event) => updateParentField("father", event)} disabled={!!createdStudent}/></label>
              <label>Father email (verification code sent after save)<input name="email" type="email" value={form.father.email} onChange={(event) => updateParentField("father", event)} maxLength={254} disabled={!!createdStudent}/></label>
              <label className="student-form-full">Father photo URL (HTTPS)<input name="photoUrl" type="url" value={form.father.photoUrl} onChange={(event) => updateParentField("father", event)} maxLength={2048} disabled={!!createdStudent}/></label>
            </div>
            <h3>Mother details (optional)</h3>
            <div className="student-form-grid">
              <label>Mother first name<input name="firstName" value={form.mother.firstName} onChange={(event) => updateParentField("mother", event)} maxLength={80} disabled={!!createdStudent}/></label>
              <label>Mother last name<input name="lastName" value={form.mother.lastName} onChange={(event) => updateParentField("mother", event)} maxLength={80} disabled={!!createdStudent}/></label>
              <label>Mother phone (10 digits)<input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.mother.phone} onChange={(event) => updateParentField("mother", event)} disabled={!!createdStudent}/></label>
              <label>Mother email (verification code sent after save)<input name="email" type="email" value={form.mother.email} onChange={(event) => updateParentField("mother", event)} maxLength={254} disabled={!!createdStudent}/></label>
              <label className="student-form-full">Mother photo URL (HTTPS)<input name="photoUrl" type="url" value={form.mother.photoUrl} onChange={(event) => updateParentField("mother", event)} maxLength={2048} disabled={!!createdStudent}/></label>
            </div>
            {parentVerification.map((item) => <p key={item.guardianId} role="status">{item.relationship}: {item.sent ? "verification email sent" : item.error || "verification email pending"}</p>)}
            <h3>Academic placement</h3>
            {optionsLoading ? <p role="status">Loading academic years…</p> : null}
            <div className="student-form-grid">
              <label>Academic year *<select value={yearId} onChange={(event) => { setYearId(event.target.value); setClassId(""); setClasses([]); setSectionId(""); setSections([]); }} required disabled={optionsLoading || !!createdStudent}><option value="">Select academic year</option>{years.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
              <label>Class *<select value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId(""); setSections([]); }} required disabled={!yearId || !classes.length || !!createdStudent}><option value="">Select class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
              <label>Section (optional)<select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId || !sections.length || !!createdStudent}><option value="">No section</option>{sections.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
            </div>
            {years.length === 0 && !optionsLoading ? <p className="student-error" role="alert">No active academic year is available. Create or activate an academic year before admitting students.</p> : null}
            {notice && <p role="status">{notice}</p>}
            {error && <div className="student-error" role="alert">{error}</div>}
          </div>
          <div className="student-form-footer">
            <button type="button" className="student-cancel-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving || optionsLoading || !yearId || !classId}>{saving ? "Saving…" : createdStudent ? "Retry placement" : "Save student & placement"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
