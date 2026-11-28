import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";

const nameOf = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Student";

export default function AcademicYearRollover({ onComplete }) {
  const { accessToken, user } = useAuth();
  const canManage = user?.role === "school_admin";
  const [years, setYears] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    apiRequest("/academic-years", { accessToken })
      .then((response) => {
        if (!alive) return;
        const list = Array.isArray(response?.data) ? response.data : [];
        setYears(list);
        setSourceId(list.find((item) => item.status === "active")?._id || "");
        setTargetId(list.find((item) => item.status === "draft")?._id || "");
      })
      .catch((err) => { if (alive) setError(err.message || "Unable to load academic years."); });
    return () => { alive = false; };
  }, [accessToken]);

  const loadPreview = async () => {
    if (!sourceId || !targetId) return;
    setLoading(true); setError(""); setNotice(""); setPreview(null); setConfirming(false);
    try {
      const response = await apiRequest(`/enrollments/promotion-preview?sourceAcademicYearId=${encodeURIComponent(sourceId)}&targetAcademicYearId=${encodeURIComponent(targetId)}`, { accessToken });
      if (!response?.success || !response.data) throw new Error("Unable to prepare the rollover preview.");
      const data = response.data;
      setPreview(data);
      const initial = {};
      for (const enrollment of data.enrollments) {
        const currentOrder = enrollment.classId?.sortOrder ?? 0;
        const nextClass = data.targetClasses.find((item) => item.sortOrder > currentOrder) || null;
        const sameClass = data.targetClasses.find((item) => item.sortOrder === currentOrder) || null;
        const targetClass = nextClass || sameClass || data.targetClasses[0] || null;
        initial[enrollment._id] = {
          outcome: nextClass ? "promote" : "retain",
          classId: targetClass?._id || "",
          sectionId: "",
        };
      }
      setDecisions(initial);
    } catch (err) { setError(err.message || "Unable to prepare the rollover preview."); }
    finally { setLoading(false); }
  };

  const updateDecision = (id, field, value) => {
    setDecisions((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value, ...(field === "classId" ? { sectionId: "" } : {}) },
    }));
  };

  const counts = useMemo(() => Object.values(decisions).reduce((acc, item) => {
    acc[item.outcome] = (acc[item.outcome] || 0) + 1;
    return acc;
  }, {}), [decisions]);

  const execute = async () => {
    if (!preview || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const placements = preview.enrollments.map((enrollment) => ({
        enrollmentId: enrollment._id,
        outcome: decisions[enrollment._id]?.outcome,
        ...( ["promote", "retain"].includes(decisions[enrollment._id]?.outcome)
          ? { classId: decisions[enrollment._id].classId, sectionId: decisions[enrollment._id].sectionId || null }
          : {}),
      }));
      const response = await apiRequest("/enrollments/rollover", {
        method: "POST", accessToken, body: { sourceAcademicYearId: sourceId, targetAcademicYearId: targetId, placements },
      });
      if (!response?.success || !response.data) throw new Error("The academic-year rollover could not be completed.");
      const summary = response.data;
      setNotice(`Rollover completed: ${summary.promoted} promoted, ${summary.retained} retained, ${summary.transferred} transferred and ${summary.withdrawn} withdrawn. ${summary.targetAcademicYear.name} is now active.`);
      setPreview(null); setConfirming(false);
      const yearsResponse = await apiRequest("/academic-years", { accessToken });
      if (yearsResponse?.success && Array.isArray(yearsResponse.data)) setYears(yearsResponse.data);
      onComplete?.(summary);
    } catch (err) { setError(err.message || "The academic-year rollover could not be completed."); setConfirming(false); }
    finally { setSaving(false); }
  };

  const targetSections = preview?.targetSections || [];
  const ready = preview && preview.enrollments.every((item) => {
    const decision = decisions[item._id];
    return decision && (["transfer", "withdraw"].includes(decision.outcome) ||
      (decision.classId && preview.targetClasses.some((c) => c._id === decision.classId) &&
       (!decision.sectionId || targetSections.some((s) => s._id === decision.sectionId && s.classId === decision.classId))));
  });

  return <section className="rollover-panel" aria-labelledby="rollover-title">
    <div className="rollover-heading">
      <div><p className="enrollments-eyebrow">END-OF-SESSION WORKFLOW</p><h3 id="rollover-title">Student promotion & academic-year rollover</h3><p>Review every active student, choose the next-year placement or record an exit, then complete the year transition in one transaction.</p></div>
    </div>
    {!canManage && <p className="enrollment-info">Only the school administrator can execute an academic-year rollover.</p>}
    <div className="rollover-selectors">
      <label>Current academic year<select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setPreview(null); }} disabled={!canManage || loading || saving}>
        <option value="">Select active year</option>{years.filter((y) => y.status === "active").map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
      </select></label>
      <label>Next academic year<select value={targetId} onChange={(e) => { setTargetId(e.target.value); setPreview(null); }} disabled={!canManage || loading || saving}>
        <option value="">Select draft year</option>{years.filter((y) => y.status === "draft").map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
      </select></label>
      <button className="enrollment-button secondary" type="button" onClick={() => void loadPreview()} disabled={!canManage || !sourceId || !targetId || loading || saving}>{loading ? "Preparing…" : "Prepare preview"}</button>
    </div>
    {error && <p className="rollover-error" role="alert">{error}</p>}
    {notice && <p className="enrollment-notice" role="status">{notice}</p>}
    {preview && <>
      <div className="rollover-summary"><strong>{preview.eligibleCount} active students to review</strong><span>{preview.sourceYear.name} → {preview.targetYear.name}</span><span>{preview.targetClasses.length} target classes available</span></div>
      {preview.targetClasses.length === 0 && preview.enrollments.length > 0 && <p className="rollover-error" role="alert">Create active classes in the draft target year before promoting or retaining students.</p>}
      <div className="rollover-table-wrap"><table className="rollover-table"><thead><tr><th>Student</th><th>Current placement</th><th>Decision</th><th>Target class</th><th>Target section</th></tr></thead><tbody>
        {preview.enrollments.map((enrollment) => {
          const decision = decisions[enrollment._id] || {};
          const options = preview.targetClasses.filter((item) => item.status === "active");
          const sections = targetSections.filter((item) => item.classId === decision.classId);
          const needsPlacement = ["promote", "retain"].includes(decision.outcome);
          return <tr key={enrollment._id}>
            <td><strong>{nameOf(enrollment.studentId)}</strong><small>{enrollment.studentId?.admissionNumber || "—"}</small></td>
            <td>{enrollment.classId?.name || "—"}{enrollment.sectionId?.name ? ` · ${enrollment.sectionId.name}` : ""}</td>
            <td><select aria-label={`Decision for ${nameOf(enrollment.studentId)}`} value={decision.outcome || "promote"} onChange={(e) => updateDecision(enrollment._id, "outcome", e.target.value)} disabled={!canManage || saving}>
              <option value="promote">Promote</option><option value="retain">Retain in class</option><option value="transfer">Transfer out</option><option value="withdraw">Withdraw</option>
            </select></td>
            <td>{needsPlacement ? <select aria-label={`Target class for ${nameOf(enrollment.studentId)}`} value={decision.classId || ""} onChange={(e) => updateDecision(enrollment._id, "classId", e.target.value)} disabled={!canManage || saving}>
              <option value="">Select class</option>{options.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select> : <span>—</span>}</td>
            <td>{needsPlacement ? <select aria-label={`Target section for ${nameOf(enrollment.studentId)}`} value={decision.sectionId || ""} onChange={(e) => updateDecision(enrollment._id, "sectionId", e.target.value)} disabled={!canManage || saving || !decision.classId}>
              <option value="">No section</option>{sections.map((item) => <option key={item._id} value={item._id}>{item.name}{item.capacity ? ` (capacity ${item.capacity})` : ""}</option>)}
            </select> : <span>—</span>}</td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="rollover-counts"><span>Promote: {counts.promote || 0}</span><span>Retain: {counts.retain || 0}</span><span>Transfer: {counts.transfer || 0}</span><span>Withdraw: {counts.withdraw || 0}</span></div>
      {preview.enrollments.length === 0 && <p className="enrollment-info">There are no active student placements to process. You can still close the current year and activate the next year.</p>}
      {confirming ? <div className="enrollment-confirm" role="alertdialog" aria-labelledby="rollover-confirm-title"><div><h4 id="rollover-confirm-title">Confirm academic-year rollover?</h4><p>This will close {preview.sourceYear.name}, activate {preview.targetYear.name}, end all current-year active enrollments and create the selected next-year placements. This operation cannot be undone from this screen.</p></div><div className="enrollment-form-actions"><button type="button" className="enrollment-button secondary" onClick={() => setConfirming(false)} disabled={saving}>Review again</button><button type="button" className="enrollment-button primary" onClick={() => void execute()} disabled={saving}>{saving ? "Processing…" : "Confirm rollover"}</button></div></div>
        : <div className="enrollment-form-actions"><button type="button" className="enrollment-button primary" onClick={() => setConfirming(true)} disabled={!canManage || !ready || saving}>Review and confirm rollover</button></div>}
    </>}
  </section>;
}
